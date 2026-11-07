package com.ledgerline.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.model.UserRole;
import com.ledgerline.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class AuditAndStatementsSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtService jwtService;

    private String holderToken;
    private UUID holderId;
    private UUID accountId;

    private String auditorToken;
    private UUID auditorId;

    private String adminToken;
    private UUID adminId;

    @BeforeEach
    void setUp() throws Exception {
        jdbcTemplate.execute("ALTER TABLE audit_log DISABLE TRIGGER ALL; TRUNCATE TABLE audit_log RESTART IDENTITY; ALTER TABLE audit_log ENABLE TRIGGER ALL;");
        jdbcTemplate.execute("ALTER TABLE ledger_entries DISABLE TRIGGER ALL; ALTER TABLE transfers DISABLE TRIGGER ALL; ALTER TABLE accounts DISABLE TRIGGER ALL; ALTER TABLE idempotency_keys DISABLE TRIGGER ALL;");
        jdbcTemplate.execute("TRUNCATE TABLE ledger_entries, transfers, idempotency_keys CASCADE;");
        jdbcTemplate.execute("DELETE FROM accounts WHERE id <> 'a0000000-0000-0000-0000-000000000001';");
        jdbcTemplate.execute("UPDATE accounts SET balance = 0, version = 0 WHERE id = 'a0000000-0000-0000-0000-000000000001';");
        jdbcTemplate.execute("ALTER TABLE ledger_entries ENABLE TRIGGER ALL; ALTER TABLE transfers ENABLE TRIGGER ALL; ALTER TABLE accounts ENABLE TRIGGER ALL; ALTER TABLE idempotency_keys ENABLE TRIGGER ALL;");

        holderId = UUID.randomUUID();
        String holderEmail = "holder-" + holderId + "@test.local";
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'HOLDER', TRUE, 0, ?)",
                holderId, holderEmail, Timestamp.from(Instant.now())
        );
        holderToken = jwtService.generateToken(holderId, UserRole.HOLDER);

        accountId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status, created_at) VALUES (?, ?, 'CUSTOMER', 'Audit Test Account', 0, 0, 'ACTIVE', ?)",
                accountId, holderId, Timestamp.from(Instant.now())
        );

        auditorId = UUID.randomUUID();
        String auditorEmail = "auditor-" + auditorId + "@test.local";
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'AUDITOR', TRUE, 0, ?)",
                auditorId, auditorEmail, Timestamp.from(Instant.now())
        );
        auditorToken = jwtService.generateToken(auditorId, UserRole.AUDITOR);

        adminId = UUID.randomUUID();
        String adminEmail = "admin-" + adminId + "@test.local";
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'ADMIN', TRUE, 0, ?)",
                adminId, adminEmail, Timestamp.from(Instant.now())
        );
        adminToken = jwtService.generateToken(adminId, UserRole.ADMIN);
    }

    @Test
    @DisplayName("Audit chain verification succeeds on an untampered, clean cryptographic chain")
    void verifyReportsValidOnCleanChain() throws Exception {
        // Perform 2 deposits
        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "clean-dep-1-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 5000}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "clean-dep-2-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 3000}"))
                .andExpect(status().isOk());

        // Verify chain via AUDITOR token
        mockMvc.perform(get("/api/audit/verify")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.checkedRows", greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$.firstBrokenSeq").doesNotExist());
    }

    @Test
    @DisplayName("Audit chain verification strictly pinpoints the exact sequence number of a tampered row")
    void tamperedRowReportsExactBrokenSeq() throws Exception {
        // Ensure there is at least one row in audit_log
        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "tamper-dep-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isOk());

        // Select the latest seq from audit_log
        Long targetSeq = jdbcTemplate.queryForObject("SELECT MAX(seq) FROM audit_log", Long.class);
        assertNotNull(targetSeq);

        try {
            // Temporarily disable the immutability trigger inside this test session
            jdbcTemplate.execute("ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_no_update_delete");

            // Tamper with the payload directly in the database
            jdbcTemplate.update(
                    "UPDATE audit_log SET payload = '{\"tampered\":\"malicious_injection\"}'::jsonb WHERE seq = ?",
                    targetSeq
            );
        } finally {
            // Re-enable the immutability trigger immediately
            jdbcTemplate.execute("ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_no_update_delete");
        }

        // Verify chain: must report invalid and point to targetSeq
        mockMvc.perform(get("/api/audit/verify")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.firstBrokenSeq").value(targetSeq));
    }

    @Test
    @DisplayName("AUDITOR role can read all inspection routes but receives 403 Forbidden on all financial write routes")
    void auditorCanReadEverythingButGets403OnEveryWriteRoute() throws Exception {
        // 1. Read routes succeed (200 OK)
        mockMvc.perform(get("/api/audit")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());

        mockMvc.perform(get("/api/audit/verify")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/ledger/conservation")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sumOfEntries").value(0))
                .andExpect(jsonPath("$.healthy").value(true));

        mockMvc.perform(get("/api/accounts/{id}/statement", accountId)
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk());

        // 2. Write routes fail with 403 Forbidden
        mockMvc.perform(post("/api/accounts")
                        .header("Authorization", "Bearer " + auditorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Auditor Account Attempt\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + auditorToken)
                        .header("Idempotency-Key", "auditor-dep-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/accounts/{id}/withdrawals", accountId)
                        .header("Authorization", "Bearer " + auditorToken)
                        .header("Idempotency-Key", "auditor-wdr-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + auditorToken)
                        .header("Idempotency-Key", "auditor-tx-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromAccountId\":\"" + accountId + "\",\"toAccountId\":\"" + accountId + "\",\"amountMinor\": 1000}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Denied and failed attempts (403, 404, 422) are captured in audit trail without breaking hash chain")
    void deniedAndFailedAttemptsAppearInAuditLog() throws Exception {
        long seqBefore = jdbcTemplate.queryForObject("SELECT COALESCE(MAX(seq), 0) FROM audit_log", Long.class);

        // 1. Trigger 422 Insufficient Funds
        mockMvc.perform(post("/api/accounts/{id}/withdrawals", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "fail-funds-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 9999999}"))
                .andExpect(status().isUnprocessableEntity());

        // 2. Trigger 404 IDOR on foreign account
        UUID foreignAccountId = UUID.randomUUID();
        mockMvc.perform(get("/api/accounts/{id}", foreignAccountId)
                        .header("Authorization", "Bearer " + holderToken))
                .andExpect(status().isNotFound());

        // 3. Trigger 403 Forbidden (HOLDER accessing /api/audit)
        mockMvc.perform(get("/api/audit")
                        .header("Authorization", "Bearer " + holderToken))
                .andExpect(status().isForbidden());

        long seqAfter = jdbcTemplate.queryForObject("SELECT COALESCE(MAX(seq), 0) FROM audit_log", Long.class);
        assertTrue(seqAfter >= seqBefore + 3, "All 3 security failures must be logged in audit_log");

        // Verify that the hash chain is still 100% valid despite failed operations
        mockMvc.perform(get("/api/audit/verify")
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
    }

    @Test
    @DisplayName("Account statement computes opening balance, entries, closing balance and validates reconciliation")
    void statementReconciliationMatchesExactBalances() throws Exception {
        // Deposit 1: 10,000 paise (Rs 100.00)
        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "stmt-dep-1-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 10000}"))
                .andExpect(status().isOk());

        // Deposit 2: 5,000 paise (Rs 50.00)
        mockMvc.perform(post("/api/accounts/{id}/deposits", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "stmt-dep-2-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 5000}"))
                .andExpect(status().isOk());

        // Withdrawal 1: 3,000 paise (Rs 30.00)
        mockMvc.perform(post("/api/accounts/{id}/withdrawals", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "stmt-wdr-1-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 3000}"))
                .andExpect(status().isOk());

        // Fetch Statement
        mockMvc.perform(get("/api/accounts/{id}/statement", accountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.openingBalance").value(0))
                .andExpect(jsonPath("$.periodSum").value(12000))
                .andExpect(jsonPath("$.closingBalance").value(12000))
                .andExpect(jsonPath("$.reconciled").value(true))
                .andExpect(jsonPath("$.totalEntries").value(3))
                .andExpect(jsonPath("$.entries", hasSize(3)))
                .andExpect(jsonPath("$.entries[0].amount").value(10000))
                .andExpect(jsonPath("$.entries[0].direction").value("CREDIT"))
                .andExpect(jsonPath("$.entries[1].amount").value(5000))
                .andExpect(jsonPath("$.entries[1].direction").value("CREDIT"))
                .andExpect(jsonPath("$.entries[2].amount").value(-3000))
                .andExpect(jsonPath("$.entries[2].direction").value("DEBIT"));

        // Verify HOLDER accessing another holder's account statement receives 404 Not Found
        UUID otherHolderId = UUID.randomUUID();
        String otherHolderEmail = "other-" + otherHolderId + "@test.local";
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'HOLDER', TRUE, 0, ?)",
                otherHolderId, otherHolderEmail, Timestamp.from(Instant.now())
        );
        String otherHolderToken = jwtService.generateToken(otherHolderId, UserRole.HOLDER);

        mockMvc.perform(get("/api/accounts/{id}/statement", accountId)
                        .header("Authorization", "Bearer " + otherHolderToken))
                .andExpect(status().isNotFound());
    }
}
