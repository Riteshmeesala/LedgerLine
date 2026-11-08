package com.ledgerline.controller;

import com.ledgerline.dto.AuditLogEntryDto;
import com.ledgerline.dto.PageResponse;
import com.ledgerline.dto.UserResponse;
import com.ledgerline.security.UserPrincipal;
import com.ledgerline.service.AuditService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/me")
public class UserController {

    private final AuditService auditService;

    public UserController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    public ResponseEntity<UserResponse> getCurrentUser(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(new UserResponse(
                principal.getId(),
                principal.getEmail(),
                principal.getRole(),
                principal.isEnabled()
        ));
    }

    @GetMapping("/activity")
    public ResponseEntity<PageResponse<AuditLogEntryDto>> getMyActivity(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(auditService.getAuditLogs(action, outcome, from, to, principal.getId(), page, size));
    }
}

