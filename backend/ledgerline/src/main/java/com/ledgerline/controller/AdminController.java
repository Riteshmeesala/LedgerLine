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

    @GetMapping("/users")
    public ResponseEntity<List<UserResponse>> listUsers() {
        List<UserResponse> users = jdbcTemplate.query(
                "SELECT id, email, role, enabled, failed_logins, locked_until FROM users ORDER BY created_at ASC LIMIT 100",
                (rs, rowNum) -> {
                    java.sql.Timestamp lockedUntil = rs.getTimestamp("locked_until");
                    boolean isLocked = lockedUntil != null && lockedUntil.toInstant().isAfter(java.time.Instant.now());
                    return new UserResponse(
                            (UUID) rs.getObject("id"),
                            rs.getString("email"),
                            com.ledgerline.model.UserRole.valueOf(rs.getString("role")),
                            rs.getBoolean("enabled"),
                            rs.getInt("failed_logins"),
                            isLocked
                    );
                }
        );
        return ResponseEntity.ok(users);
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
        UserResponse response = authService.createUserByAdmin(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/users/{id}/disable")
    public ResponseEntity<?> disableUser(
            @PathVariable UUID id,
            Authentication authentication,
            HttpServletRequest servletRequest) {
        UUID adminId = parseAdminId(authentication);

        List<Map<String, Object>> targetList = jdbcTemplate.queryForList(
                "SELECT id, email, role, enabled FROM users WHERE id = ?",
                id
        );
        if (targetList.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Not Found",
                            "status", 404,
                            "detail", "User not found: " + id
                    ));
        }

        Map<String, Object> target = targetList.get(0);
        String roleStr = (String) target.get("role");
        boolean isCurrentlyEnabled = Boolean.TRUE.equals(target.get("enabled"));

        if (!isCurrentlyEnabled) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Unprocessable Entity",
                            "status", 422,
                            "detail", "User is already disabled"
                    ));
        }

        if ("ADMIN".equals(roleStr)) {
            Long activeAdmins = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND enabled = true",
                    Long.class
            );
            if (activeAdmins != null && activeAdmins <= 1L) {
                return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.parseMediaType("application/problem+json"))
                        .body(Map.of(
                                "type", "about:blank",
                                "title", "Unprocessable Entity",
                                "status", 422,
                                "detail", "Cannot disable the last active administrator"
                        ));
            }
        }

        if (id.equals(adminId)) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Unprocessable Entity",
                            "status", 422,
                            "detail", "An administrator cannot disable their own account"
                    ));
        }

        jdbcTemplate.update("UPDATE users SET enabled = false WHERE id = ?", id);

        String email = (String) target.get("email");
        auditService.appendAudit(
                adminId,
                "ADMIN",
                "DISABLE_USER",
                "USER",
                id.toString(),
                Map.of(
                        "userId", id.toString(),
                        "email", email,
                        "role", roleStr,
                        "enabled", false
                ),
                servletRequest != null ? servletRequest.getRemoteAddr() : null
        );

        return ResponseEntity.ok(new UserResponse(
                id,
                email,
                com.ledgerline.model.UserRole.valueOf(roleStr),
                false
        ));
    }

    @PostMapping("/users/{id}/enable")
    public ResponseEntity<?> enableUser(
            @PathVariable UUID id,
            Authentication authentication,
            HttpServletRequest servletRequest) {
        UUID adminId = parseAdminId(authentication);

        List<Map<String, Object>> targetList = jdbcTemplate.queryForList(
                "SELECT id, email, role, enabled FROM users WHERE id = ?",
                id
        );
        if (targetList.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Not Found",
                            "status", 404,
                            "detail", "User not found: " + id
                    ));
        }

        Map<String, Object> target = targetList.get(0);
        String roleStr = (String) target.get("role");
        boolean isCurrentlyEnabled = Boolean.TRUE.equals(target.get("enabled"));

        if (isCurrentlyEnabled) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Unprocessable Entity",
                            "status", 422,
                            "detail", "User is already enabled"
                    ));
        }

        jdbcTemplate.update("UPDATE users SET enabled = true WHERE id = ?", id);

        String email = (String) target.get("email");
        auditService.appendAudit(
                adminId,
                "ADMIN",
                "ENABLE_USER",
                "USER",
                id.toString(),
                Map.of(
                        "userId", id.toString(),
                        "email", email,
                        "role", roleStr,
                        "enabled", true
                ),
                servletRequest != null ? servletRequest.getRemoteAddr() : null
        );

        return ResponseEntity.ok(new UserResponse(
                id,
                email,
                com.ledgerline.model.UserRole.valueOf(roleStr),
                true
        ));
    }

    @PostMapping("/users/{id}/unlock")
    public ResponseEntity<?> unlockUser(
            @PathVariable UUID id,
            Authentication authentication,
            HttpServletRequest servletRequest) {
        UUID adminId = parseAdminId(authentication);

        List<Map<String, Object>> targetList = jdbcTemplate.queryForList(
                "SELECT id, email, role, enabled, failed_logins, locked_until FROM users WHERE id = ?",
                id
        );
        if (targetList.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.parseMediaType("application/problem+json"))
                    .body(Map.of(
                            "type", "about:blank",
                            "title", "Not Found",
                            "status", 404,
                            "detail", "User not found: " + id
                    ));
        }

        Map<String, Object> target = targetList.get(0);
        String email = (String) target.get("email");
        int failedLogins = target.get("failed_logins") != null ? ((Number) target.get("failed_logins")).intValue() : 0;
        java.sql.Timestamp lockedUntil = (java.sql.Timestamp) target.get("locked_until");

        jdbcTemplate.update("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", id);

        auditService.appendAudit(
                adminId,
                "ADMIN",
                "UNLOCK_USER",
                "USER",
                id.toString(),
                Map.of(
                        "userId", id.toString(),
                        "email", email,
                        "previousFailedLogins", failedLogins,
                        "previousLockedUntil", lockedUntil != null ? lockedUntil.toString() : "null",
                        "unlocked", true
                ),
                servletRequest != null ? servletRequest.getRemoteAddr() : null
        );

        return ResponseEntity.ok(Map.of(
                "id", id.toString(),
                "email", email,
                "failedLogins", 0,
                "unlocked", true
        ));
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

