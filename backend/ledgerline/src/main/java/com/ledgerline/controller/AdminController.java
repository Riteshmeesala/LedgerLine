package com.ledgerline.controller;

import com.ledgerline.dto.AccountStatusChangeRequest;
import com.ledgerline.dto.CreateUserRequest;
import com.ledgerline.dto.UserResponse;
import com.ledgerline.service.AuditService;
import com.ledgerline.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AuthService authService;
    private final JdbcTemplate jdbcTemplate;
    private final AuditService auditService;

    public AdminController(AuthService authService, JdbcTemplate jdbcTemplate, AuditService auditService) {
        this.authService = authService;
        this.jdbcTemplate = jdbcTemplate;
        this.auditService = auditService;
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
        UserResponse response = authService.createUserByAdmin(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/accounts/{id}/freeze")
    public ResponseEntity<?> freezeAccount(
            @PathVariable UUID id,
            @RequestBody(required = false) AccountStatusChangeRequest request,
            Authentication authentication,
            HttpServletRequest servletRequest) {
        if (request == null || request.reason() == null || request.reason().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Bad Request",
                            "status", 400,
                            "detail", "Reason is mandatory (between 3 and 200 characters)"
                    ));
        }
        String trimmedReason = request.reason().trim();
        if (trimmedReason.length() < 3 || trimmedReason.length() > 200) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Bad Request",
                            "status", 400,
                            "detail", "Reason must be between 3 and 200 characters"
                    ));
        }

        List<String> statuses = jdbcTemplate.query(
                "SELECT status FROM accounts WHERE id = ?",
                (rs, rowNum) -> rs.getString("status"),
                id
        );
        if (statuses.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Not Found",
                            "status", 404,
                            "detail", "Account not found: " + id
                    ));
        }
        String previousStatus = statuses.get(0);
        jdbcTemplate.update("UPDATE accounts SET status = 'FROZEN' WHERE id = ?", id);

        UUID adminId = parseAdminId(authentication);
        auditService.appendAudit(
                adminId,
                "ADMIN",
                "FREEZE_ACCOUNT",
                "ACCOUNT",
                id.toString(),
                Map.of(
                        "reason", trimmedReason,
                        "previousStatus", previousStatus,
                        "status", "FROZEN"
                ),
                servletRequest != null ? servletRequest.getRemoteAddr() : null
        );

        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "FROZEN",
                "reason", trimmedReason
        ));
    }

    @PostMapping("/accounts/{id}/unfreeze")
    public ResponseEntity<?> unfreezeAccount(
            @PathVariable UUID id,
            @RequestBody(required = false) AccountStatusChangeRequest request,
            Authentication authentication,
            HttpServletRequest servletRequest) {
        if (request == null || request.reason() == null || request.reason().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Bad Request",
                            "status", 400,
                            "detail", "Reason is mandatory (between 3 and 200 characters)"
                    ));
        }
        String trimmedReason = request.reason().trim();
        if (trimmedReason.length() < 3 || trimmedReason.length() > 200) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Bad Request",
                            "status", 400,
                            "detail", "Reason must be between 3 and 200 characters"
                    ));
        }

        List<String> statuses = jdbcTemplate.query(
                "SELECT status FROM accounts WHERE id = ?",
                (rs, rowNum) -> rs.getString("status"),
                id
        );
        if (statuses.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Not Found",
                            "status", 404,
                            "detail", "Account not found: " + id
                    ));
        }
        String previousStatus = statuses.get(0);
        jdbcTemplate.update("UPDATE accounts SET status = 'ACTIVE' WHERE id = ?", id);

        UUID adminId = parseAdminId(authentication);
        auditService.appendAudit(
                adminId,
                "ADMIN",
                "UNFREEZE_ACCOUNT",
                "ACCOUNT",
                id.toString(),
                Map.of(
                        "reason", trimmedReason,
                        "previousStatus", previousStatus,
                        "status", "ACTIVE"
                ),
                servletRequest != null ? servletRequest.getRemoteAddr() : null
        );

        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "status", "ACTIVE",
                "reason", trimmedReason
        ));
    }

    private UUID parseAdminId(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof com.ledgerline.security.UserPrincipal up) {
            return up.getId();
        }
        if (authentication != null && authentication.getName() != null) {
            try {
                return UUID.fromString(authentication.getName());
            } catch (IllegalArgumentException ignored) {
            }
        }
        return null;
    }
}

