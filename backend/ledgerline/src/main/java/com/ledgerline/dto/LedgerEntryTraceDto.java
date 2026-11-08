package com.ledgerline.dto;

import java.time.Instant;
import java.util.UUID;

public record LedgerEntryTraceDto(
        long id,
        UUID accountId,
        long amount,
        long balanceAfter,
        Instant createdAt
) {}

