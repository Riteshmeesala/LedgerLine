package com.ledgerline.dto;

public record LedgerConservationDto(
        long sumOfEntries,
        long sumOfBalances,
        long imbalancedTransferCount,
        boolean healthy
) {}

