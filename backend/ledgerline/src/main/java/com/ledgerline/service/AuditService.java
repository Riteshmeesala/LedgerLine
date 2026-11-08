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
     * Returns paginated audit log entries ordered by seq DESC with optional filtering.
     */
    @Transactional(readOnly = true)
    public PageResponse<AuditLogEntryDto> getAuditLogs(int page, int size) {
        return getAuditLogs(null, null, null, null, null, page, size);
    }

    /**
     * Returns filtered, paginated audit log entries ordered by seq DESC.
     * Capped at max size 100 per page.
     */
    @Transactional(readOnly = true)
    public PageResponse<AuditLogEntryDto> getAuditLogs(
            String action,
            String outcome,
            Instant from,
            Instant to,
            UUID actorId,
            int page,
            int size) {
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.clamp(size, 1, 100);
        int offset = boundedPage * boundedSize;

        StringBuilder whereSql = new StringBuilder(" WHERE 1=1 ");
        List<Object> params = new ArrayList<>();

        if (action != null && !action.isBlank()) {
            whereSql.append(" AND action = ? ");
            params.add(action.trim());
        }

        if (actorId != null) {
            whereSql.append(" AND actor_id = ? ");
            params.add(actorId);
        }

        if (from != null) {
            whereSql.append(" AND created_at >= ? ");
            params.add(Timestamp.from(from));
        }

        if (to != null) {
            whereSql.append(" AND created_at <= ? ");
            params.add(Timestamp.from(to));
        }

        if (outcome != null && !outcome.isBlank()) {
            String norm = outcome.trim().toUpperCase();
            if ("FAILED".equals(norm) || "DENIED".equals(norm) || "FAILED_OR_DENIED".equals(norm)) {
                whereSql.append(" AND (action IN ('ACCESS_DENIED', 'AUTHENTICATION_FAILED', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_FUNDS', " +
                        "'IDEMPOTENCY_MISMATCH', 'ILLEGAL_STATE', 'ILLEGAL_ARGUMENT', 'TYPE_MISMATCH', 'PAYLOAD_TOO_LARGE', " +
                        "'INTERNAL_ERROR', 'UNKNOWN_PROPERTY', 'MALFORMED_INPUT', 'VALIDATION_FAILED', 'RESOURCE_NOT_FOUND', 'CONFLICT', 'INVALID_IDEMPOTENCY_KEY') " +
                        "OR action LIKE '%_FAILED' OR action LIKE '%DENIED%' OR action LIKE '%MISMATCH%' OR action LIKE '%EXCEEDED%' OR action LIKE '%INSUFFICIENT%' " +
                        "OR payload->>'outcome' = 'FAILED' OR payload->>'outcome' = 'DENIED') ");
            } else if ("SUCCESS".equals(norm)) {
                whereSql.append(" AND NOT (action IN ('ACCESS_DENIED', 'AUTHENTICATION_FAILED', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_FUNDS', " +
                        "'IDEMPOTENCY_MISMATCH', 'ILLEGAL_STATE', 'ILLEGAL_ARGUMENT', 'TYPE_MISMATCH', 'PAYLOAD_TOO_LARGE', " +
                        "'INTERNAL_ERROR', 'UNKNOWN_PROPERTY', 'MALFORMED_INPUT', 'VALIDATION_FAILED', 'RESOURCE_NOT_FOUND', 'CONFLICT', 'INVALID_IDEMPOTENCY_KEY') " +
                        "OR action LIKE '%_FAILED' OR action LIKE '%DENIED%' OR action LIKE '%MISMATCH%' OR action LIKE '%EXCEEDED%' OR action LIKE '%INSUFFICIENT%' " +
                        "OR payload->>'outcome' = 'FAILED' OR payload->>'outcome' = 'DENIED') ");
            }
        }

        String countSql = "SELECT COUNT(*) FROM audit_log " + whereSql;
        long totalElements = Optional.ofNullable(
                jdbcTemplate.queryForObject(countSql, Long.class, params.toArray())
        ).orElse(0L);

        int totalPages = (int) Math.ceil((double) totalElements / boundedSize);

        String selectSql = "SELECT seq, actor_id, actor_role, action, entity_type, entity_id, payload, ip, prev_hash, hash, created_at " +
                "FROM audit_log " + whereSql + " ORDER BY seq DESC LIMIT ? OFFSET ?";
        List<Object> queryParams = new ArrayList<>(params);
        queryParams.add(boundedSize);
        queryParams.add(offset);

        List<AuditLogEntryDto> content = jdbcTemplate.query(
                selectSql,
                (rs, rowNum) -> {
                    long seq = rs.getLong("seq");
                    UUID rowActorId = rs.getObject("actor_id", UUID.class);
                    String actorRole = rs.getString("actor_role");
                    String rowAction = rs.getString("action");
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
                            rowActorId,
                            actorRole,
                            rowAction,
                            entityType,
                            entityId,
                            payloadMap,
                            ip,
                            prevHash,
                            hash,
                            createdAt
                    );
                },
                queryParams.toArray()
        );

        return new PageResponse<>(content, boundedPage, boundedSize, totalElements, totalPages);
    }

    /**
     * Exports matching audit log entries as sanitized CSV.
     * Capped at safe row limit (max 1000).
     * Strictly guards against CSV formula injection by prepending apostrophe (')
     * to any cell starting with =, +, -, @, \t, \r.
     */
    @Transactional(readOnly = true)
    public byte[] exportAuditLogsCsv(
            String action,
            String outcome,
            Instant from,
            Instant to,
            UUID actorId,
            int limit) {
        int boundedLimit = Math.clamp(limit, 1, 1000);

        StringBuilder whereSql = new StringBuilder(" WHERE 1=1 ");
        List<Object> params = new ArrayList<>();

        if (action != null && !action.isBlank()) {
            whereSql.append(" AND action = ? ");
            params.add(action.trim());
        }

        if (actorId != null) {
            whereSql.append(" AND actor_id = ? ");
            params.add(actorId);
        }

        if (from != null) {
            whereSql.append(" AND created_at >= ? ");
            params.add(Timestamp.from(from));
        }

        if (to != null) {
            whereSql.append(" AND created_at <= ? ");
            params.add(Timestamp.from(to));
        }

        if (outcome != null && !outcome.isBlank()) {
            String norm = outcome.trim().toUpperCase();
            if ("FAILED".equals(norm) || "DENIED".equals(norm) || "FAILED_OR_DENIED".equals(norm)) {
                whereSql.append(" AND (action IN ('ACCESS_DENIED', 'AUTHENTICATION_FAILED', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_FUNDS', " +
                        "'IDEMPOTENCY_MISMATCH', 'ILLEGAL_STATE', 'ILLEGAL_ARGUMENT', 'TYPE_MISMATCH', 'PAYLOAD_TOO_LARGE', " +
                        "'INTERNAL_ERROR', 'UNKNOWN_PROPERTY', 'MALFORMED_INPUT', 'VALIDATION_FAILED', 'RESOURCE_NOT_FOUND', 'CONFLICT', 'INVALID_IDEMPOTENCY_KEY') " +
                        "OR action LIKE '%_FAILED' OR action LIKE '%DENIED%' OR action LIKE '%MISMATCH%' OR action LIKE '%EXCEEDED%' OR action LIKE '%INSUFFICIENT%' " +
                        "OR payload->>'outcome' = 'FAILED' OR payload->>'outcome' = 'DENIED') ");
            } else if ("SUCCESS".equals(norm)) {
                whereSql.append(" AND NOT (action IN ('ACCESS_DENIED', 'AUTHENTICATION_FAILED', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_FUNDS', " +
                        "'IDEMPOTENCY_MISMATCH', 'ILLEGAL_STATE', 'ILLEGAL_ARGUMENT', 'TYPE_MISMATCH', 'PAYLOAD_TOO_LARGE', " +
                        "'INTERNAL_ERROR', 'UNKNOWN_PROPERTY', 'MALFORMED_INPUT', 'VALIDATION_FAILED', 'RESOURCE_NOT_FOUND', 'CONFLICT', 'INVALID_IDEMPOTENCY_KEY') " +
                        "OR action LIKE '%_FAILED' OR action LIKE '%DENIED%' OR action LIKE '%MISMATCH%' OR action LIKE '%EXCEEDED%' OR action LIKE '%INSUFFICIENT%') ");
            }
        }

        String selectSql = "SELECT seq, actor_id, actor_role, action, entity_type, entity_id, payload, ip, prev_hash, hash, created_at " +
                "FROM audit_log " + whereSql + " ORDER BY seq DESC LIMIT ?";
        params.add(boundedLimit);

        StringBuilder csv = new StringBuilder();
        csv.append("Seq,Actor ID,Actor Role,Action,Entity Type,Entity ID,Payload,IP,Prev Hash,Hash,Created At\n");

        jdbcTemplate.query(
                selectSql,
                rs -> {
                    long seq = rs.getLong("seq");
                    String rowActorId = rs.getString("actor_id");
                    String actorRole = rs.getString("actor_role");
                    String rowAction = rs.getString("action");
                    String entityType = rs.getString("entity_type");
                    String entityId = rs.getString("entity_id");
                    String payload = rs.getString("payload");
                    String ip = rs.getString("ip");
                    String prevHash = rs.getString("prev_hash");
                    String hash = rs.getString("hash");
                    Timestamp ts = rs.getTimestamp("created_at");
                    String createdAt = ts != null ? ts.toInstant().toString() : "";

                    csv.append(sanitizeCsvCell(seq)).append(",")
                            .append(sanitizeCsvCell(rowActorId)).append(",")
                            .append(sanitizeCsvCell(actorRole)).append(",")
                            .append(sanitizeCsvCell(rowAction)).append(",")
                            .append(sanitizeCsvCell(entityType)).append(",")
                            .append(sanitizeCsvCell(entityId)).append(",")
                            .append(sanitizeCsvCell(payload)).append(",")
                            .append(sanitizeCsvCell(ip)).append(",")
                            .append(sanitizeCsvCell(prevHash)).append(",")
                            .append(sanitizeCsvCell(hash)).append(",")
                            .append(sanitizeCsvCell(createdAt)).append("\n");
                },
                params.toArray()
        );

        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static String sanitizeCsvCell(Object value) {
        if (value == null) return "";
        String str = value.toString();
        if (str.isEmpty()) return "";

        // Guard against CSV formula injection: =, +, -, @, \t, \r
        char firstChar = str.charAt(0);
        if (firstChar == '=' || firstChar == '+' || firstChar == '-' || firstChar == '@' || firstChar == '\t' || firstChar == '\r') {
            str = "'" + str;
        }

        if (str.contains(",") || str.contains("\"") || str.contains("\n") || str.contains("\r")) {
            str = "\"" + str.replace("\"", "\"\"") + "\"";
        }
        return str;
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

