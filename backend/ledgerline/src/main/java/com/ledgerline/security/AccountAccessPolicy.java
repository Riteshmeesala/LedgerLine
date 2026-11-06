package com.ledgerline.security;

import com.ledgerline.exception.ResourceNotFoundException;
import com.ledgerline.model.UserRole;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * AccountAccessPolicy enforces resource-level ownership and access control.
 *
 * Core Security Rule:
 * When an authenticated user with role HOLDER attempts to access an account that they do
 * not own (or that does not exist), the policy strictly throws ResourceNotFoundException (HTTP 404),
 * NEVER AccessDeniedException (HTTP 403).
 *
 * Why:
 * Returning HTTP 403 reveals that a resource exists and belongs to someone else (IDOR enumeration).
 * Returning HTTP 404 makes foreign accounts indistinguishable from non-existent accounts,
 * completely neutralizing IDOR probing.
 */
@Component("accountAccessPolicy")
public class AccountAccessPolicy {

    private final JdbcTemplate jdbcTemplate;

    public AccountAccessPolicy(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Checks if the authenticated principal is authorized to access the specified account.
     *
     * @param authentication The current Spring Security authentication context.
     * @param accountId The UUID of the account being accessed.
     * @return true if access is permitted; otherwise throws ResourceNotFoundException.
     */
    public boolean canAccessAccount(Authentication authentication, UUID accountId) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            // Unauthenticated callers fail closed
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }

        // 1. ADMIN and AUDITOR roles have legitimate organizational visibility across accounts
        if (principal.getRole() == UserRole.ADMIN || principal.getRole() == UserRole.AUDITOR) {
            return true;
        }

        // 2. Query the owner_id of the account directly from the database
        UUID ownerId;
        try {
            ownerId = jdbcTemplate.queryForObject(
                    "SELECT owner_id FROM accounts WHERE id = ?",
                    UUID.class,
                    accountId
            );
        } catch (EmptyResultDataAccessException e) {
            // Account does not exist -> 404
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }

        // 3. For HOLDER: If owner_id is null (e.g. SYSTEM account) or does not match caller's UUID,
        // mask existence by throwing ResourceNotFoundException (HTTP 404)
        if (ownerId == null || !ownerId.equals(principal.getId())) {
            throw new ResourceNotFoundException("Account not found: " + accountId);
        }

        // 4. Caller owns this customer account
        return true;
    }
}

