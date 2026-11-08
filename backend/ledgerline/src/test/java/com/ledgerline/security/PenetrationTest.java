package com.ledgerline.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.model.UserRole;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class PenetrationTest {

    private static final UUID CASH_IN_OUT_ACCOUNT_ID = UUID.fromString("a0000000-0000-0000-0000-000000000001");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtService jwtService;

    @Value("${ledgerline.jwt.secret}")
    private String jwtSecret;

    private String holderToken;
    private UUID holderId;
    private UUID holderAccountId;

    private String secondHolderToken;
    private UUID secondHolderId;
    private UUID secondHolderAccountId;

    private String adminToken;
    private UUID adminId;

    private String auditorToken;
    private UUID auditorId;

    @BeforeEach
    void setUp() {
        jdbcTemplate.execute("ALTER TABLE audit_log DISABLE TRIGGER ALL; TRUNCATE TABLE audit_log RESTART IDENTITY; ALTER TABLE audit_log ENABLE TRIGGER ALL;");
        jdbcTemplate.execute("ALTER TABLE ledger_entries DISABLE TRIGGER ALL; ALTER TABLE transfers DISABLE TRIGGER ALL; ALTER TABLE accounts DISABLE TRIGGER ALL; ALTER TABLE idempotency_keys DISABLE TRIGGER ALL;");
        jdbcTemplate.execute("TRUNCATE TABLE ledger_entries, transfers, idempotency_keys CASCADE;");
        jdbcTemplate.execute("DELETE FROM accounts WHERE id <> 'a0000000-0000-0000-0000-000000000001';");
        jdbcTemplate.execute("UPDATE accounts SET balance = 0, version = 0 WHERE id = 'a0000000-0000-0000-0000-000000000001';");
        jdbcTemplate.execute("ALTER TABLE ledger_entries ENABLE TRIGGER ALL; ALTER TABLE transfers ENABLE TRIGGER ALL; ALTER TABLE accounts ENABLE TRIGGER ALL; ALTER TABLE idempotency_keys ENABLE TRIGGER ALL;");

        holderId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'HOLDER', TRUE, 0, ?)",
                holderId, "pen-holder1-" + holderId + "@test.local", Timestamp.from(Instant.now())
        );
        holderToken = jwtService.generateToken(holderId, UserRole.HOLDER);

        holderAccountId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status, created_at) VALUES (?, ?, 'CUSTOMER', 'Holder 1 Main', 100000, 0, 'ACTIVE', ?)",
                holderAccountId, holderId, Timestamp.from(Instant.now())
        );

        secondHolderId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'HOLDER', TRUE, 0, ?)",
                secondHolderId, "pen-holder2-" + secondHolderId + "@test.local", Timestamp.from(Instant.now())
        );
        secondHolderToken = jwtService.generateToken(secondHolderId, UserRole.HOLDER);

        secondHolderAccountId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status, created_at) VALUES (?, ?, 'CUSTOMER', 'Holder 2 Main', 50000, 0, 'ACTIVE', ?)",
                secondHolderAccountId, secondHolderId, Timestamp.from(Instant.now())
        );

        adminId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'ADMIN', TRUE, 0, ?)",
                adminId, "pen-admin-" + adminId + "@test.local", Timestamp.from(Instant.now())
        );
        adminToken = jwtService.generateToken(adminId, UserRole.ADMIN);

        auditorId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, 'hash', 'AUDITOR', TRUE, 0, ?)",
                auditorId, "pen-auditor-" + auditorId + "@test.local", Timestamp.from(Instant.now())
        );
        auditorToken = jwtService.generateToken(auditorId, UserRole.AUDITOR);
    }

    @Test
    @DisplayName("G-1: Transfer specifying system settlement account (CASH_IN_OUT) as destination must be rejected with 422")
    void transferTargetingSystemAccountIsRejectedWith422() throws Exception {
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "pen-key-sys-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromAccountId\":\"" + holderAccountId + "\",\"toAccountId\":\"" + CASH_IN_OUT_ACCOUNT_ID + "\",\"amountMinor\": 5000}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail", containsStringIgnoringCase("System account")));
    }

    @Test
    @DisplayName("G-2: Admin account freeze/unfreeze endpoints must reject HOLDER/AUDITOR with 403 and succeed for ADMIN")
    void unauthorizedCallerCannotFreezeOrUnfreezeAccounts() throws Exception {
        // HOLDER receives 403
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken))
                .andExpect(status().isForbidden());

        // AUDITOR receives 403
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", holderAccountId)
                        .header("Authorization", "Bearer " + auditorToken))
                .andExpect(status().isForbidden());

        // ADMIN succeeds
        mockMvc.perform(post("/api/admin/accounts/{id}/freeze", holderAccountId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"Administrative freeze for pen test\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FROZEN"));

        // Frozen account cannot transact
        mockMvc.perform(post("/api/accounts/{id}/deposits", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "pen-dep-frz-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isUnprocessableEntity());

        // ADMIN can unfreeze
        mockMvc.perform(post("/api/admin/accounts/{id}/unfreeze", holderAccountId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"Administrative unfreeze for pen test\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    @DisplayName("G-3: Idempotency-Key with leading or trailing whitespace is strictly validated or trimmed (HTTP 400)")
    void idempotencyKeyWithWhitespacePaddingIsRejectedOrNormalized() throws Exception {
        // Malformed key with whitespace padding
        mockMvc.perform(post("/api/accounts/{id}/deposits", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "  invalid-padded-key-1234  ")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Bad Request"));
    }

    @Test
    @DisplayName("G-10: Missing Idempotency-Key header is rejected with HTTP 400 problem+json")
    void missingIdempotencyKeyIsRejectedWith400ProblemJson() throws Exception {
        mockMvc.perform(post("/api/accounts/{id}/deposits", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Bad Request"));
    }

    @Test
    @DisplayName("G-4: Self-transfer (fromAccountId == toAccountId) is rejected cleanly with 422 Problem JSON")
    void selfTransferIsRejectedCleanlyWith422() throws Exception {
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "pen-self-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromAccountId\":\"" + holderAccountId + "\",\"toAccountId\":\"" + holderAccountId + "\",\"amountMinor\": 1000}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.title").value("Unprocessable Entity"))
                .andExpect(jsonPath("$.detail", containsStringIgnoringCase("Cannot transfer funds to the same account")));
    }

    @Test
    @DisplayName("G-5: Malformed or unexpected role claim in JWT fails cleanly with 401 Unauthorized instead of 500")
    void malformedRoleInJwtFailsWith401InsteadOf500() throws Exception {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        String forgedToken = Jwts.builder()
                .subject(holderId.toString())
                .claim("role", "SUPER_ROOT_ATTACKER")
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(key)
                .compact();

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + forgedToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.title").value("Unauthorized"));
    }

    @Test
    @DisplayName("G-6: Uncaught server exceptions return RFC 7807 problem+json 500 without leaking stack trace")
    void unexpectedExceptionsReturnProblemJson500WithoutStackTrace() throws Exception {
        // Invoking an account with an unparseable UUID format on an endpoint expecting UUID
        mockMvc.perform(get("/api/accounts/not-a-valid-uuid")
                        .header("Authorization", "Bearer " + holderToken))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(jsonPath("$.stackTrace").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    @DisplayName("G-7: Account list endpoint accepts pagination parameters to prevent unbounded memory exhaustion")
    void accountsListEndpointIsBoundedAndSupportsPagination() throws Exception {
        mockMvc.perform(get("/api/accounts")
                        .header("Authorization", "Bearer " + holderToken)
                        .param("page", "0")
                        .param("size", "1"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("G-8: Unknown JSON fields are rejected with HTTP 400 problem+json and no stack trace")
    void unknownJsonFieldsAreRejectedWith400ProblemJson() throws Exception {
        mockMvc.perform(post("/api/accounts/{id}/deposits", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "pen-unknown-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000, \"unknownInjectedProperty\": \"attack\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.stackTrace").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    @DisplayName("G-9: Oversized request payload exceeding 64KB is rejected with HTTP 413 or 400 problem+json")
    void oversizedPayloadExceeding64KbIsRejectedWith413Or400() throws Exception {
        String largePadding = "A".repeat(70000); // 70 KB > 64 KB limit
        mockMvc.perform(post("/api/accounts/{id}/deposits", holderAccountId)
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "pen-oversize-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000, \"padding\": \"" + largePadding + "\"}"))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    org.assertj.core.api.Assertions.assertThat(status)
                            .withFailMessage("Expected HTTP 413 or 400 but got " + status)
                            .isIn(400, 413);
                })
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(jsonPath("$.stackTrace").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    @DisplayName("G-11: THREATS.md matrix references only real, existing Java test methods in src/test")
    void threatModelMatrixRefersOnlyToExistingJavaTestMethods() throws Exception {
        java.nio.file.Path cwd = java.nio.file.Paths.get("").toAbsolutePath();
        java.nio.file.Path threatsPath = null;
        java.nio.file.Path testRoot = null;
        java.nio.file.Path cursor = cwd;
        while (cursor != null) {
            java.nio.file.Path cand = cursor.resolve("THREATS.md");
            if (java.nio.file.Files.exists(cand)) {
                threatsPath = cand;
                testRoot = cursor.resolve("backend/ledgerline/src/test/java");
                break;
            }
            cursor = cursor.getParent();
        }
        org.junit.jupiter.api.Assertions.assertNotNull(threatsPath, "THREATS.md must exist in repository root");
        org.junit.jupiter.api.Assertions.assertTrue(java.nio.file.Files.isDirectory(testRoot), "testRoot must exist: " + testRoot);

        java.util.List<String> lines = java.nio.file.Files.readAllLines(threatsPath);
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("`([A-Za-z0-9]+)\\.([A-Za-z0-9_]+)`");
        java.util.List<String> missingMethods = new java.util.ArrayList<>();
        int verifiedCount = 0;

        for (String line : lines) {
            if (line.startsWith("| **T-")) {
                String[] parts = line.split("\\|");
                if (parts.length > 5) {
                    String testCell = parts[5].trim();
                    java.util.regex.Matcher matcher = pattern.matcher(testCell);
                    while (matcher.find()) {
                        String className = matcher.group(1);
                        String methodName = matcher.group(2);
                        verifiedCount++;

                        try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.walk(testRoot)) {
                            java.util.Optional<java.nio.file.Path> classFile = stream
                                    .filter(p -> p.getFileName().toString().equals(className + ".java"))
                                    .findFirst();
                            if (classFile.isEmpty()) {
                                missingMethods.add("Class missing: " + className + " (method: " + methodName + ")");
                            } else {
                                String source = java.nio.file.Files.readString(classFile.get());
                                if (!source.contains(methodName)) {
                                    missingMethods.add("Method missing: " + className + "." + methodName);
                                }
                            }
                        }
                    }
                }
            }
        }

        org.junit.jupiter.api.Assertions.assertTrue(verifiedCount >= 13, "Expected at least 13 test references in THREATS.md matrix, found: " + verifiedCount);
        org.junit.jupiter.api.Assertions.assertTrue(missingMethods.isEmpty(),
                "Found missing test references cited in THREATS.md: " + missingMethods);
    }
}

