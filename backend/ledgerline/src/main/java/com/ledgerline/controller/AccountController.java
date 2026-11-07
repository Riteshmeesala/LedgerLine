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
    private final com.ledgerline.service.MoneyEngineService moneyEngineService;

    public AccountController(
            JdbcTemplate jdbcTemplate,
            AccountAccessPolicy accountAccessPolicy,
            com.ledgerline.service.MoneyEngineService moneyEngineService) {
        this.jdbcTemplate = jdbcTemplate;
        this.accountAccessPolicy = accountAccessPolicy;
        this.moneyEngineService = moneyEngineService;
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
    public ResponseEntity<com.ledgerline.dto.TransferResponse> deposit(
            @PathVariable UUID id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody com.ledgerline.dto.DepositWithdrawRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {

        com.ledgerline.dto.TransferResponse response = moneyEngineService.executeTransfer(
                principal.getId(),
                "POST",
                "/api/accounts/" + id + "/deposits",
                idempotencyKey,
                com.ledgerline.service.MoneyEngineService.CASH_IN_OUT_ACCOUNT_ID,
                id,
                request.getAmountMinor(),
                "DEPOSIT"
        );

        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        if (response.isReplayed()) {
            headers.add("Idempotent-Replayed", "true");
        }
        return ResponseEntity.ok().headers(headers).body(response);
    }

    @PostMapping("/{id}/withdrawals")
    @PreAuthorize("hasRole('HOLDER') and @accountAccessPolicy.canAccessAccount(authentication, #id)")
    public ResponseEntity<com.ledgerline.dto.TransferResponse> withdraw(
            @PathVariable UUID id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody com.ledgerline.dto.DepositWithdrawRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {

        com.ledgerline.dto.TransferResponse response = moneyEngineService.executeTransfer(
                principal.getId(),
                "POST",
                "/api/accounts/" + id + "/withdrawals",
                idempotencyKey,
                id,
                com.ledgerline.service.MoneyEngineService.CASH_IN_OUT_ACCOUNT_ID,
                request.getAmountMinor(),
                "WITHDRAWAL"
        );

        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        if (response.isReplayed()) {
            headers.add("Idempotent-Replayed", "true");
        }
        return ResponseEntity.ok().headers(headers).body(response);
    }
}

