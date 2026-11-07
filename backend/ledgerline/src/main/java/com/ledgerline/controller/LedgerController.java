package com.ledgerline.controller;

import com.ledgerline.dto.LedgerConservationDto;
import com.ledgerline.service.LedgerConservationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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
}

