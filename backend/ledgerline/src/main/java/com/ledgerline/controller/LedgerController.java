package com.ledgerline.controller;

import com.ledgerline.dto.LedgerConservationDto;
import com.ledgerline.dto.ReconciliationReportDto;
import com.ledgerline.service.LedgerConservationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ledger")
public class LedgerController {

    private final LedgerConservationService ledgerConservationService;

    public LedgerController(LedgerConservationService ledgerConservationService) {
        this.ledgerConservationService = ledgerConservationService;
    }

    @GetMapping("/conservation")
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<LedgerConservationDto> getConservation() {
        return ResponseEntity.ok(ledgerConservationService.checkConservation());
    }

    @GetMapping("/reconciliation")
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<ReconciliationReportDto> getReconciliationReport(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ledgerConservationService.getReconciliationReport(page, size));
    }
}

