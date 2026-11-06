package com.ledgerline.controller;

import com.ledgerline.dto.CreateUserRequest;
import com.ledgerline.dto.UserResponse;
import com.ledgerline.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AuthService authService;
    private final JdbcTemplate jdbcTemplate;

    public AdminController(AuthService authService, JdbcTemplate jdbcTemplate) {
        this.authService = authService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
        UserResponse response = authService.createUserByAdmin(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/accounts/{id}/freeze")
    public ResponseEntity<Map<String, Object>> freezeAccount(@PathVariable UUID id) {
        int updated = jdbcTemplate.update("UPDATE accounts SET status = 'FROZEN' WHERE id = ?", id);
        if (updated == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of("id", id.toString(), "status", "FROZEN"));
    }

    @PostMapping("/accounts/{id}/unfreeze")
    public ResponseEntity<Map<String, Object>> unfreezeAccount(@PathVariable UUID id) {
        int updated = jdbcTemplate.update("UPDATE accounts SET status = 'ACTIVE' WHERE id = ?", id);
        if (updated == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of("id", id.toString(), "status", "ACTIVE"));
    }
}

