package com.ledgerline.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    @PostMapping
    @PreAuthorize("hasRole('HOLDER')")
    public ResponseEntity<Map<String, Object>> transfer(@RequestBody Map<String, Object> body) {
        // Full engine implementation handled in Phase E
        return ResponseEntity.ok(Map.of("status", "RECEIVED"));
    }
}

