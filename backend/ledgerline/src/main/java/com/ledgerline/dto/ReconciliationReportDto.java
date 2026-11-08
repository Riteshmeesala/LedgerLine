package com.ledgerline.dto;

import java.time.Instant;

public record ReconciliationReportDto(
        PageResponse<AccountReconciliationDto> accounts,
        boolean overallHealthy,
        long totalDiscrepancies,
        Instant generatedAt
) {}

