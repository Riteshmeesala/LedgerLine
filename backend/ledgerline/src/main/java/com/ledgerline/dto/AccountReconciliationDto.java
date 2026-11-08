package com.ledgerline.dto;

import java.util.UUID;

public record AccountReconciliationDto(
        UUID accountId,
        String accountName,
        String accountType,
        UUID ownerId,
        String status,
        long storedBalance,
        long entriesSum,
        long difference,
        boolean reconciled,
        boolean isSystemAccount
) {}

