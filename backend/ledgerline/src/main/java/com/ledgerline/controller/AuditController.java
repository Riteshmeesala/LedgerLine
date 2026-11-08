package com.ledgerline.controller;

import com.ledgerline.dto.AuditLogEntryDto;
import com.ledgerline.dto.AuditVerificationResult;
import com.ledgerline.dto.PageResponse;
import com.ledgerline.dto.TransferTraceDto;
import com.ledgerline.service.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<PageResponse<AuditLogEntryDto>> getAuditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(auditService.getAuditLogs(page, size));
    }

    @GetMapping("/verify")
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<AuditVerificationResult> verifyChain() {
        return ResponseEntity.ok(auditService.verifyChain());
    }

    @GetMapping("/transfers/{transferId}")
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<TransferTraceDto> getTransferTrace(@PathVariable UUID transferId) {
        return ResponseEntity.ok(auditService.getTransferTrace(transferId));
    }
}

