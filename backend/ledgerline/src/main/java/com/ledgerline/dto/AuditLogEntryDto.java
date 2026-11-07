package com.ledgerline.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AuditLogEntryDto(
        long seq,
        UUID actorId,
        String actorRole,
        String action,
        String entityType,
        String entityId,
        Map<String, Object> payload,
        String ip,
        String prevHash,
        String hash,
        Instant createdAt
) {}

