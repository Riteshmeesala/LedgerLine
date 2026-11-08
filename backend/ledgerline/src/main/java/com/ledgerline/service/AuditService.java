package com.ledgerline.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.dto.AuditLogEntryDto;
import com.ledgerline.dto.AuditVerificationResult;
import com.ledgerline.dto.LedgerEntryTraceDto;
import com.ledgerline.dto.PageResponse;
import com.ledgerline.dto.TransferDetailDto;
import com.ledgerline.dto.TransferTraceDto;
import com.ledgerline.exception.ResourceNotFoundException;
import com.ledgerline.util.CanonicalJsonUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class AuditService {

    public static final long AUDIT_ADVISORY_LOCK_ID = 74291847129L;
    public static final String GENESIS_PREV_HASH = "0".repeat(64);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AuditService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Appends an audit entry inside the current transaction (e.g., money movements).
     * Acquires an advisory xact lock to keep the hash chain strictly linear and race-free.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void appendAudit(
            UUID actorId,
            String actorRole,
            String action,
            String entityType,
            String entityId,
            Map<String, Object> payload,
            String ip) {
        appendAuditInternal(actorId, actorRole, action, entityType, entityId, payload, ip);
    }

    /**
     * Appends a security audit entry in a NEW, isolated transaction so that failed
     * or denied attempts (401, 403, 404, 422) are permanently preserved even if the
     * main business transaction rolls back.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSecurityEvent(
            UUID actorId,
            String actorRole,
            String action,
            String entityType,
            String entityId,
            Map<String, Object> payload,
            String ip) {
        appendAuditInternal(actorId, actorRole, action, entityType, entityId, payload, ip);
    }

    private void appendAuditInternal(
            UUID actorId,
            String actorRole,
            String action,
            String entityType,
            String entityId,
            Map<String, Object> payload,
            String ip) {
        // 1. Acquire transaction-level advisory lock to serialize audit appends
        jdbcTemplate.execute((java.sql.Connection conn) -> {
            try (PreparedStatement ps = conn.prepareStatement("SELECT pg_advisory_xact_lock(?)")) {
                ps.setLong(1, AUDIT_ADVISORY_LOCK_ID);
                ps.execute();
            }
            return null;
        });

        // 2. Query previous row's seq and hash
        List<Map<String, Object>> latest = jdbcTemplate.queryForList(
                "SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1"
        );

        long nextSeq = 1L;
        String prevHash = GENESIS_PREV_HASH;
        if (!latest.isEmpty()) {
            nextSeq = ((Number) latest.get(0).get("seq")).longValue() + 1L;
            prevHash = (String) latest.get(0).get("hash");
        }
        jdbcTemplate.queryForObject("SELECT setval('audit_log_seq_seq', ?, true)", Long.class, nextSeq);

        // 3. Deterministic timestamp truncated to milliseconds to survive database roundtrip
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String createdAtIso = DateTimeFormatter.ISO_INSTANT.format(now);

        // 4. Canonicalize payload
        String canonicalPayload = CanonicalJsonUtil.canonicalize(payload);

        // 5. Compute cryptographic hash
        String hash = computeHash(prevHash, nextSeq, actorId, action, entityType, entityId, canonicalPayload, createdAtIso);

        // 6. Insert into immutable audit_log table
        jdbcTemplate.update(
                "INSERT INTO audit_log (seq, actor_id, actor_role, action, entity_type, entity_id, payload, ip, prev_hash, hash, created_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)",
                nextSeq,
                actorId,
                actorRole,
                action,
                entityType,
                entityId,
                canonicalPayload,
                ip,
                prevHash,
                hash,
                Timestamp.from(now)
        );
    }

    /**
     * Verifies cryptographic integrity of the entire audit chain from genesis.
     */
    @Transactional(readOnly = true)
    public AuditVerificationResult verifyChain() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT seq, actor_id, action, entity_type, entity_id, payload, prev_hash, hash, created_at " +
                        "FROM audit_log ORDER BY seq ASC"
        );

        if (rows.isEmpty()) {
            return new AuditVerificationResult(true, 0, null);
        }

        long expectedSeq = 1L;
        String expectedPrevHash = GENESIS_PREV_HASH;

        for (Map<String, Object> row : rows) {
            long seq = ((Number) row.get("seq")).longValue();
            if (seq != expectedSeq) {
                return new AuditVerificationResult(false, expectedSeq - 1, seq);
            }

            String prevHash = (String) row.get("prev_hash");
            if (!expectedPrevHash.equals(prevHash)) {
                return new AuditVerificationResult(false, seq - 1, seq);
            }

            UUID actorId = row.get("actor_id") != null ? (UUID) row.get("actor_id") : null;
            String action = (String) row.get("action");
            String entityType = (String) row.get("entity_type");
            String entityId = (String) row.get("entity_id");

            Object payloadObj = row.get("payload");
            String canonicalPayload = CanonicalJsonUtil.canonicalize(payloadObj != null ? payloadObj.toString() : null);

            Object createdAtObj = row.get("created_at");
            Instant createdAtInstant;
            if (createdAtObj instanceof Timestamp ts) {
                createdAtInstant = ts.toInstant();
            } else if (createdAtObj instanceof OffsetDateTime odt) {
                createdAtInstant = odt.toInstant();
            } else {
                createdAtInstant = Instant.parse(createdAtObj.toString());
            }
            String createdAtIso = DateTimeFormatter.ISO_INSTANT.format(createdAtInstant);

            String expectedHash = computeHash(prevHash, seq, actorId, action, entityType, entityId, canonicalPayload, createdAtIso);
            String storedHash = (String) row.get("hash");

            if (!expectedHash.equalsIgnoreCase(storedHash)) {
                return new AuditVerificationResult(false, seq - 1, seq);
            }

            expectedPrevHash = storedHash;
            expectedSeq++;
        }

        return new AuditVerificationResult(true, rows.size(), null);
    }

    /**
     * Returns paginated audit log entries ordered by seq DESC.
     */
    @Transactional(readOnly = true)
    public PageResponse<AuditLogEntryDto> getAuditLogs(int page, int size) {
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.clamp(size, 1, 100);
        int offset = boundedPage * boundedSize;

        long totalElements = Optional.ofNullable(
                jdbcTemplate.queryForObject("SELECT COUNT(*) FROM audit_log", Long.class)
        ).orElse(0L);

        int totalPages = (int) Math.ceil((double) totalElements / boundedSize);

        List<AuditLogEntryDto> content = jdbcTemplate.query(
                "SELECT seq, actor_id, actor_role, action, entity_type, entity_id, payload, ip, prev_hash, hash, created_at " +
                        "FROM audit_log ORDER BY seq DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> {
                    long seq = rs.getLong("seq");
                    UUID actorId = rs.getObject("actor_id", UUID.class);
                    String actorRole = rs.getString("actor_role");
                    String action = rs.getString("action");
                    String entityType = rs.getString("entity_type");
                    String entityId = rs.getString("entity_id");
                    String payloadStr = rs.getString("payload");
                    Map<String, Object> payloadMap = null;
                    if (payloadStr != null) {
                        try {
                            payloadMap = objectMapper.readValue(payloadStr, new TypeReference<>() {});
                        } catch (Exception ignored) {
                            payloadMap = Collections.emptyMap();
                        }
                    }
                    String ip = rs.getString("ip");
                    String prevHash = rs.getString("prev_hash");
                    String hash = rs.getString("hash");
                    Timestamp ts = rs.getTimestamp("created_at");
                    Instant createdAt = ts != null ? ts.toInstant() : Instant.now();

                    return new AuditLogEntryDto(
                            seq,
                            actorId,
                            actorRole,
                            action,
                            entityType,
                            entityId,
                            payloadMap,
                            ip,
                            prevHash,
                            hash,
                            createdAt
                    );
                },
                boundedSize,
                offset
        );

        return new PageResponse<>(content, boundedPage, boundedSize, totalElements, totalPages);
    }

    /**
     * Retrieves complete transfer trace including transfer metadata, bilateral ledger entries,
     * and associated cryptographic audit log row(s).
     * Accessible by AUDITOR and ADMIN.
     */
    @Transactional(readOnly = true)
    public TransferTraceDto getTransferTrace(UUID transferId) {
        // 1. Fetch transfer details
        List<TransferDetailDto> transfers = jdbcTemplate.query(
                "SELECT id, kind, from_account, to_account, amount, initiated_by, idempotency_key, created_at " +
                        "FROM transfers WHERE id = ?",
                (rs, rowNum) -> new TransferDetailDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("kind"),
                        rs.getObject("from_account", UUID.class),
                        rs.getObject("to_account", UUID.class),
                        rs.getLong("amount"),
                        rs.getObject("initiated_by", UUID.class),
                        rs.getString("idempotency_key"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                transferId
        );

        if (transfers.isEmpty()) {
            throw new ResourceNotFoundException("Transfer not found: " + transferId);
        }
        TransferDetailDto transfer = transfers.get(0);

        // 2. Fetch associated ledger entries
        List<LedgerEntryTraceDto> entries = jdbcTemplate.query(
                "SELECT id, account_id, amount, balance_after, created_at " +
                        "FROM ledger_entries WHERE transfer_id = ? ORDER BY id ASC",
                (rs, rowNum) -> new LedgerEntryTraceDto(
                        rs.getLong("id"),
                        rs.getObject("account_id", UUID.class),
                        rs.getLong("amount"),
                        rs.getLong("balance_after"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                transferId
        );

        // 3. Fetch associated audit log entries (linked by entity_id or payload transferId)
        String transferIdStr = transferId.toString();
        List<AuditLogEntryDto> auditEntries = jdbcTemplate.query(
                "SELECT seq, actor_id, actor_role, action, entity_type, entity_id, payload, ip, prev_hash, hash, created_at " +
                        "FROM audit_log WHERE (entity_type = 'TRANSFER' AND entity_id = ?) OR (payload->>'transferId' = ?) " +
                        "ORDER BY seq ASC",
                (rs, rowNum) -> {
                    long seq = rs.getLong("seq");
                    UUID actorId = rs.getObject("actor_id", UUID.class);
                    String actorRole = rs.getString("actor_role");
                    String action = rs.getString("action");
                    String entityType = rs.getString("entity_type");
                    String entityId = rs.getString("entity_id");
                    String payloadStr = rs.getString("payload");
                    Map<String, Object> payloadMap = null;
                    if (payloadStr != null) {
                        try {
                            payloadMap = objectMapper.readValue(payloadStr, new TypeReference<>() {});
                        } catch (Exception ignored) {
                            payloadMap = Collections.emptyMap();
                        }
                    }
                    String ip = rs.getString("ip");
                    String prevHash = rs.getString("prev_hash");
                    String hash = rs.getString("hash");
                    Timestamp ts = rs.getTimestamp("created_at");
                    Instant createdAt = ts != null ? ts.toInstant() : Instant.now();

                    return new AuditLogEntryDto(
                            seq,
                            actorId,
                            actorRole,
                            action,
                            entityType,
                            entityId,
                            payloadMap,
                            ip,
                            prevHash,
                            hash,
                            createdAt
                    );
                },
                transferIdStr,
                transferIdStr
        );

        return new TransferTraceDto(transfer, entries, auditEntries);
    }

    public static String computeHash(
            String prevHash,
            long seq,
            UUID actorId,
            String action,
            String entityType,
            String entityId,
            String canonicalJson,
            String createdAtIso) {
        String input = prevHash +
                seq +
                (actorId != null ? actorId.toString() : "") +
                action +
                entityType +
                (entityId != null ? entityId : "") +
                canonicalJson +
                createdAtIso;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }
}

