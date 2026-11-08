package com.ledgerline.dto;

import java.time.Instant;
import java.util.UUID;

public record TransferDetailDto(
        UUID id,
        String kind,
        UUID fromAccount,
        UUID toAccount,
        long amount,
        UUID initiatedBy,
        String idempotencyKey,
        Instant createdAt
) {}

