package com.ledgerline.dto;

public record AuditVerificationResult(
        boolean valid,
        long checkedRows,
        Long firstBrokenSeq
) {}

