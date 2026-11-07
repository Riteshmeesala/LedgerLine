package com.ledgerline.dto;

import java.time.Instant;
import java.util.UUID;

public record StatementEntryDto(
        long id,
        UUID transferId,
        long amount,
        long balanceAfter,
        String direction,
        Instant createdAt
) {}
