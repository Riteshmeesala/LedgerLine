package com.ledgerline.controller;

import com.ledgerline.dto.AccountResponse;
import com.ledgerline.dto.CreateAccountRequest;
import com.ledgerline.model.UserRole;
import com.ledgerline.security.AccountAccessPolicy;
import com.ledgerline.security.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final JdbcTemplate jdbcTemplate;
    private final AccountAccessPolicy accountAccessPolicy;

    public AccountController(JdbcTemplate jdbcTemplate, AccountAccessPolicy accountAccessPolicy) {
        this.jdbcTemplate = jdbcTemplate;
        this.accountAccessPolicy = accountAccessPolicy;
    }

    @GetMapping
    public ResponseEntity<List<AccountResponse>> listAccounts(@AuthenticationPrincipal UserPrincipal principal) {
        String sql;
        Object[] args;

        if (principal.getRole() == UserRole.ADMIN || principal.getRole() == UserRole.AUDITOR) {
            sql = "SELECT id, owner_id, type, name, balance, status, created_at FROM accounts ORDER BY created_at ASC";
            args = new Object[]{};
        } else {
            sql = "SELECT id, owner_id, type, name, balance, status, created_at FROM accounts WHERE owner_id = ? ORDER BY created_at ASC";
            args = new Object[]{principal.getId()};
        }

        List<AccountResponse> accounts = jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new AccountResponse(
                        (UUID) rs.getObject("id"),
                        (UUID) rs.getObject("owner_id"),
                        rs.getString("type"),
                        rs.getString("name"),
                        rs.getLong("balance"),
                        rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                args
        );

        return ResponseEntity.ok(accounts);
    }

    @PostMapping
    @PreAuthorize("hasRole('HOLDER') or hasRole('ADMIN')")
    public ResponseEntity<AccountResponse> createAccount(
            @Valid @RequestBody CreateAccountRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {

        UUID accountId = UUID.randomUUID();
        UUID ownerId = principal.getId();
        Instant now = Instant.now();

        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status, created_at) VALUES (?, ?, 'CUSTOMER', ?, 0, 0, 'ACTIVE', ?)",
                accountId, ownerId, request.getName(), Timestamp.from(now)
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(new AccountResponse(
                accountId, ownerId, "CUSTOMER", request.getName(), 0L, "ACTIVE", now
        ));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('AUDITOR') or (hasRole('HOLDER') and @accountAccessPolicy.canAccessAccount(authentication, #id))")
    public ResponseEntity<AccountResponse> getAccountById(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {

        AccountResponse account = jdbcTemplate.queryForObject(
                "SELECT id, owner_id, type, name, balance, status, created_at FROM accounts WHERE id = ?",
                (rs, rowNum) -> new AccountResponse(
                        (UUID) rs.getObject("id"),
                        (UUID) rs.getObject("owner_id"),
                        rs.getString("type"),
                        rs.getString("name"),
                        rs.getLong("balance"),
                        rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                id
        );

        return ResponseEntity.ok(account);
    }

    @PostMapping("/{id}/deposits")
    @PreAuthorize("hasRole('HOLDER') and @accountAccessPolicy.canAccessAccount(authentication, #id)")
    public ResponseEntity<Map<String, Object>> deposit(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body) {
        // Full engine implementation handled in Phase D
        return ResponseEntity.ok(Map.of("accountId", id.toString(), "action", "deposit"));
    }

    @PostMapping("/{id}/withdrawals")
    @PreAuthorize("hasRole('HOLDER') and @accountAccessPolicy.canAccessAccount(authentication, #id)")
    public ResponseEntity<Map<String, Object>> withdraw(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body) {
        // Full engine implementation handled in Phase D
        return ResponseEntity.ok(Map.of("accountId", id.toString(), "action", "withdraw"));
    }
}

