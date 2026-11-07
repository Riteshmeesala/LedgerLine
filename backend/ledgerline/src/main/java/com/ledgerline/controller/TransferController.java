package com.ledgerline.controller;

import com.ledgerline.dto.TransferRequest;
import com.ledgerline.dto.TransferResponse;
import com.ledgerline.security.UserPrincipal;
import com.ledgerline.service.MoneyEngineService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    private final MoneyEngineService moneyEngineService;

    public TransferController(MoneyEngineService moneyEngineService) {
        this.moneyEngineService = moneyEngineService;
    }

    @PostMapping
    @PreAuthorize("hasRole('HOLDER')")
    public ResponseEntity<TransferResponse> transfer(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody TransferRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {

        TransferResponse response = moneyEngineService.executeTransfer(
                principal.getId(),
                "POST",
                "/api/transfers",
                idempotencyKey,
                request.getFromAccountId(),
                request.getToAccountId(),
                request.getAmountMinor(),
                "TRANSFER"
        );

        HttpHeaders headers = new HttpHeaders();
        if (response.isReplayed()) {
            headers.add("Idempotent-Replayed", "true");
        }
        return ResponseEntity.ok().headers(headers).body(response);
    }
}
