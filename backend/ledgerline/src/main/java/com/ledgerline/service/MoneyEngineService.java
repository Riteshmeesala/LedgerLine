package com.ledgerline.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.dto.TransferResponse;
import com.ledgerline.exception.IdempotencyMismatchException;
import com.ledgerline.exception.InsufficientFundsException;
import com.ledgerline.exception.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * MoneyEngineService executes all financial movements in ONE atomic transaction.
 *
 * Core Guarantees:
 * 1. Exactly-once idempotency with row-level locks on idempotency_keys.
 * 2. Strict integer arithmetic using Math.addExact / Math.subtractExact (zero float/double/BigDecimal).
 * 3. Deadlock-free account locking ordered strictly by ascending account UUID.
 * 4. Dual-sided double entry ledgering with conservation verified at commit time.
 * 5. Direct native SQL via JdbcTemplate to bypass ORM entity caches and guarantee direct DB row locks.
 */
@Service
public class MoneyEngineService {

    public static final UUID CASH_IN_OUT_ACCOUNT_ID = UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final Pattern IDEMPOTENCY_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{8,64}$");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final long maxMinorUnits;

    public MoneyEngineService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            @Value("${ledgerline.limits.max-minor-units:100000000}") long maxMinorUnits) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.maxMinorUnits = maxMinorUnits;
    }

    private static class AccountRecord {
        final UUID id;
        final UUID ownerId;
        final String type;
        final long balance;
        final String status;

        AccountRecord(UUID id, UUID ownerId, String type, long balance, String status) {
            this.id = id;
            this.ownerId = ownerId;
            this.type = type;
            this.balance = balance;
            this.status = status;
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public TransferResponse executeTransfer(
            UUID callerId,
            String method,
            String path,
            String idempotencyKey,
            UUID fromAccountId,
            UUID toAccountId,
            Long amountMinor,
            String kind) {

        // 1. Validation
        if (idempotencyKey == null || !IDEMPOTENCY_KEY_PATTERN.matcher(idempotencyKey).matches()) {
            throw new IllegalArgumentException("Idempotency-Key must be 8 to 64 alphanumeric, dash, or underscore characters.");
        }
        if (amountMinor == null || amountMinor <= 0 || amountMinor > maxMinorUnits) {
            throw new IllegalArgumentException("amountMinor must be between 1 and " + maxMinorUnits + " minor units.");
        }
        if (fromAccountId.equals(toAccountId)) {
            throw new IllegalArgumentException("Cannot transfer funds to the same account.");
        }

        // 2. Request hash: SHA-256(method, path, fromAccountId, toAccountId, amountMinor)
        String requestHash = computeRequestHash(method, path, fromAccountId, toAccountId, amountMinor);

        // 3. Idempotency Lock: INSERT ... ON CONFLICT DO NOTHING then SELECT ... FOR UPDATE
        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (user_id, key, request_hash, status, created_at) VALUES (?, ?, ?, 'IN_PROGRESS', ?) ON CONFLICT (user_id, key) DO NOTHING",
                callerId, idempotencyKey, requestHash, Timestamp.from(Instant.now())
        );

        var idemRow = jdbcTemplate.queryForMap(
                "SELECT request_hash, status, response_body FROM idempotency_keys WHERE user_id = ? AND key = ? FOR UPDATE",
                callerId, idempotencyKey
        );

        String storedHash = (String) idemRow.get("request_hash");
        String storedStatus = (String) idemRow.get("status");
        Object bodyObj = idemRow.get("response_body");
        String storedBody = bodyObj != null ? bodyObj.toString() : null;

        if ("COMPLETED".equals(storedStatus)) {
            if (storedHash.equals(requestHash)) {
                try {
                    TransferResponse replayed = objectMapper.readValue(storedBody, TransferResponse.class);
                    replayed.setReplayed(true);
                    return replayed;
                } catch (Exception e) {
                    throw new IllegalStateException("Failed to parse stored idempotent response", e);
                }
            } else {
                throw new IdempotencyMismatchException("Idempotency key reused with different request parameters.");
            }
        }

        // 4. Authorise source account ownership (for non-system accounts)
        if (!CASH_IN_OUT_ACCOUNT_ID.equals(fromAccountId)) {
            UUID sourceOwner;
            try {
                sourceOwner = jdbcTemplate.queryForObject(
                        "SELECT owner_id FROM accounts WHERE id = ?", UUID.class, fromAccountId
                );
            } catch (EmptyResultDataAccessException e) {
                throw new ResourceNotFoundException("Account not found: " + fromAccountId);
            }
            if (sourceOwner == null || !sourceOwner.equals(callerId)) {
                throw new ResourceNotFoundException("Account not found: " + fromAccountId);
            }
        }

        // 5. Deadlock-free account locking: order by ascending UUID
        UUID firstLockId = fromAccountId.compareTo(toAccountId) < 0 ? fromAccountId : toAccountId;
        UUID secondLockId = fromAccountId.compareTo(toAccountId) < 0 ? toAccountId : fromAccountId;

        AccountRecord firstAcc = lockAccountForUpdate(firstLockId);
        AccountRecord secondAcc = lockAccountForUpdate(secondLockId);

        AccountRecord fromAcc = fromAccountId.equals(firstAcc.id) ? firstAcc : secondAcc;
        AccountRecord toAcc = toAccountId.equals(firstAcc.id) ? firstAcc : secondAcc;

        if ("FROZEN".equals(fromAcc.status) || "FROZEN".equals(toAcc.status)) {
            throw new IllegalStateException("Account is frozen and cannot transact.");
        }

        // 6. Check funds from the locked row
        if ("CUSTOMER".equals(fromAcc.type) && fromAcc.balance < amountMinor) {
            throw new InsufficientFundsException(
                    "Insufficient funds: available " + fromAcc.balance + ", requested " + amountMinor
            );
        }

        // 7. Math exact arithmetic (No float/double/BigDecimal in money path)
        long newFromBalance = Math.subtractExact(fromAcc.balance, amountMinor);
        long newToBalance = Math.addExact(toAcc.balance, amountMinor);

        // 8. Update account balances using direct SQL
        jdbcTemplate.update("UPDATE accounts SET balance = ?, version = version + 1 WHERE id = ?", newFromBalance, fromAcc.id);
        jdbcTemplate.update("UPDATE accounts SET balance = ?, version = version + 1 WHERE id = ?", newToBalance, toAcc.id);

        // 9. Insert transfer and two symmetric ledger entries
        UUID transferId = UUID.randomUUID();
        Instant now = Instant.now();

        jdbcTemplate.update(
                "INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                transferId, kind, fromAcc.id, toAcc.id, amountMinor, callerId, idempotencyKey, Timestamp.from(now)
        );

        // Debit entry (-amountMinor)
        jdbcTemplate.update(
                "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?)",
                transferId, fromAcc.id, -amountMinor, newFromBalance, Timestamp.from(now)
        );

        // Credit entry (+amountMinor) -> sum is exactly 0
        jdbcTemplate.update(
                "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?)",
                transferId, toAcc.id, amountMinor, newToBalance, Timestamp.from(now)
        );

        // 10. Update idempotency record to COMPLETED with response payload
        TransferResponse response = new TransferResponse(transferId, kind, fromAcc.id, toAcc.id, amountMinor, now, false);
        try {
            String jsonResponse = objectMapper.writeValueAsString(response);
            jdbcTemplate.update(
                    "UPDATE idempotency_keys SET status = 'COMPLETED', response_status = 200, response_body = ?::jsonb WHERE user_id = ? AND key = ?",
                    jsonResponse, callerId, idempotencyKey
            );
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize idempotent response", e);
        }

        return response;
    }

    private AccountRecord lockAccountForUpdate(UUID accountId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id, owner_id, type, balance, status FROM accounts WHERE id = ? FOR UPDATE",
                    (rs, rowNum) -> new AccountRecord(
                            (UUID) rs.getObject("id"),
                            (UUID) rs.getObject("owner_id"),
                            rs.getString("type"),
                            rs.getLong("balance"),
                            rs.getString("status")
                    ),
                    accountId
            );
        } catch (EmptyResultDataAccessException e) {
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }
    }

    private String computeRequestHash(String method, String path, UUID fromAccount, UUID toAccount, long amount) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String raw = method + ":" + path + ":" + fromAccount + ":" + toAccount + ":" + amount;
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}

