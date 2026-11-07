package com.ledgerline.service;

import com.ledgerline.dto.StatementDto;
import com.ledgerline.dto.StatementEntryDto;
import com.ledgerline.exception.ResourceNotFoundException;
import com.ledgerline.model.UserRole;
import com.ledgerline.security.UserPrincipal;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class StatementService {

    private final JdbcTemplate jdbcTemplate;

    public StatementService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Generates an account statement with opening balance, chronologically ordered ledger entries,
     * closing balance, and mathematical reconciliation verification.
     * Enforces AccountAccessPolicy: foreign accounts return 404 for HOLDER callers.
     */
    @Transactional(readOnly = true)
    public StatementDto getStatement(
            UUID accountId,
            Instant from,
            Instant to,
            int page,
            int size,
            UserPrincipal principal) {

        // 1. Verify account existence and ownership
        UUID ownerId;
        try {
            ownerId = jdbcTemplate.queryForObject(
                    "SELECT owner_id FROM accounts WHERE id = ?",
                    UUID.class,
                    accountId
            );
        } catch (EmptyResultDataAccessException e) {
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }

        if (principal.getRole() == UserRole.HOLDER && !principal.getId().equals(ownerId)) {
            // IDOR Protection: Return 404 rather than 403 to prevent enumeration
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }

        // 2. Default date bounds
        Instant effectiveFrom = (from != null) ? from : Instant.EPOCH;
        Instant effectiveTo = (to != null) ? to : Instant.now();
        Timestamp fromTs = Timestamp.from(effectiveFrom);
        Timestamp toTs = Timestamp.from(effectiveTo);

        // 3. Opening balance (sum of all entries before effectiveFrom)
        long openingBalance = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE account_id = ? AND created_at < ?",
                        Long.class,
                        accountId,
                        fromTs
                )
        ).orElse(0L);

        // 4. Closing balance (sum of all entries up to and including effectiveTo)
        long closingBalance = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE account_id = ? AND created_at <= ?",
                        Long.class,
                        accountId,
                        toTs
                )
        ).orElse(0L);

        // 5. Total entries and sum in the period
        long periodSum = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE account_id = ? AND created_at >= ? AND created_at <= ?",
                        Long.class,
                        accountId,
                        fromTs,
                        toTs
                )
        ).orElse(0L);

        long totalEntries = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM ledger_entries WHERE account_id = ? AND created_at >= ? AND created_at <= ?",
                        Long.class,
                        accountId,
                        fromTs,
                        toTs
                )
        ).orElse(0L);

        // 6. Pagination
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.clamp(size, 1, 100);
        int offset = boundedPage * boundedSize;
        int totalPages = (int) Math.ceil((double) totalEntries / boundedSize);

        List<StatementEntryDto> entries = jdbcTemplate.query(
                "SELECT id, transfer_id, amount, balance_after, created_at " +
                        "FROM ledger_entries " +
                        "WHERE account_id = ? AND created_at >= ? AND created_at <= ? " +
                        "ORDER BY id ASC, created_at ASC " +
                        "LIMIT ? OFFSET ?",
                (rs, rowNum) -> {
                    long id = rs.getLong("id");
                    UUID transferId = rs.getObject("transfer_id", UUID.class);
                    long amount = rs.getLong("amount");
                    long balanceAfter = rs.getLong("balance_after");
                    String direction = amount < 0 ? "DEBIT" : "CREDIT";
                    Timestamp createdAt = rs.getTimestamp("created_at");
                    return new StatementEntryDto(
                            id,
                            transferId,
                            amount,
                            balanceAfter,
                            direction,
                            createdAt != null ? createdAt.toInstant() : Instant.now()
                    );
                },
                accountId,
                fromTs,
                toTs,
                boundedSize,
                offset
        );

        // 7. Mathematical reconciliation check
        boolean reconciled = (closingBalance == openingBalance + periodSum);

        return new StatementDto(
                accountId,
                effectiveFrom,
                effectiveTo,
                openingBalance,
                closingBalance,
                periodSum,
                reconciled,
                boundedPage,
                boundedSize,
                totalEntries,
                totalPages,
                entries
        );
    }
}
