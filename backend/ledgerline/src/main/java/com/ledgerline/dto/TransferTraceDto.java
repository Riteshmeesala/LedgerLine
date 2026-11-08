package com.ledgerline.dto;

import java.util.List;

public record TransferTraceDto(
        TransferDetailDto transfer,
        List<LedgerEntryTraceDto> entries,
        List<AuditLogEntryDto> auditEntries
) {}

