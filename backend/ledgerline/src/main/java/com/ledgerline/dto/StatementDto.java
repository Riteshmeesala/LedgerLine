package com.ledgerline.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record StatementDto(
        UUID accountId,
        Instant from,
        Instant to,
        long openingBalance,
        long closingBalance,
        long periodSum,
        boolean reconciled,
        int page,
        int size,
        long totalEntries,
        int totalPages,
        List<StatementEntryDto> entries
) {}

