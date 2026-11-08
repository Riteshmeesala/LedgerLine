package com.ledgerline.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.dto.CreateAccountRequest;
import com.ledgerline.dto.LoginRequest;
import com.ledgerline.dto.RegisterRequest;
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
import org.springframework.test.web.servlet.MvcResult;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class AccountMovementsAndConcurrencyTest {

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
    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        holderId = UUID.randomUUID();
        String email = "holder-" + holderId + "@engine.com";
        registerUser(email, "Password123!");
        holderToken = loginUser(email, "Password123!");
        accountId = createAccount(holderToken, "Primary Checking");

        UUID adminId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, enabled, failed_logins, created_at) VALUES (?, ?, '$2a$12$e8xL4hM45cIuR7w2xK5.4.mE9oQ31L8mS5vU3kL6yY7zW9x1v2b3u', 'ADMIN', TRUE, 0, ?)",
                adminId, "admin-" + adminId + "@engine.com", Timestamp.from(Instant.now())
        );
        adminToken = jwtService.generateToken(adminId, UserRole.ADMIN);
    }

    @Test
    @DisplayName("Security Rule: Overdraft rejected when balance is insufficient")
    void overdrawRejectedWhenBalanceIsInsufficient() throws Exception {
        // 1. Initial Deposit: 5000 paise (INR 50.00)
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "deposit-key-1001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 5000}"))
                .andExpect(status().isOk());

        // 2. Attempt Overdraft: 5001 paise (exceeds 5000 balance)
        mockMvc.perform(post("/api/accounts/" + accountId + "/withdrawals")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "withdraw-overdraw-1001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 5001}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.title").value("Insufficient Funds"));

        // Verify balance remained untouched at 5000
        Long balance = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountId);
        assertThat(balance).isEqualTo(5000L);
    }

    @Test
    @DisplayName("Security Rule: Bad amounts rejected (decimals, strings, null, zero, negative, above limit)")
    void badAmountsRejected() throws Exception {
        String testKeyPrefix = "bad-amount-key-";

        // 1. Float / Decimal rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "decimal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 10.50}"))
                .andExpect(status().isUnprocessableEntity());

        // 2. String rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "string")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": \"5000\"}"))
                .andExpect(status().isUnprocessableEntity());

        // 3. Null rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "null")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": null}"))
                .andExpect(status().isUnprocessableEntity());

        // 4. Zero rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "zero")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 0}"))
                .andExpect(status().isUnprocessableEntity());

        // 5. Negative rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "negative")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": -100}"))
                .andExpect(status().isUnprocessableEntity());

        // 6. Above 100,000,000 minor units rejected
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", testKeyPrefix + "above-limit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 100000001}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("Security Rule: Frozen account rejected from transacting (deposits and withdrawals)")
    void frozenAccountRejectedFromTransacting() throws Exception {
        // Freeze account via Admin endpoint
        mockMvc.perform(post("/api/admin/accounts/" + accountId + "/freeze")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"Suspicious activity under review\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FROZEN"));

        // Attempt deposit on frozen account
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "frozen-dep-1001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 1000}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Account is frozen and cannot transact."));

        // Attempt withdrawal on frozen account
        mockMvc.perform(post("/api/accounts/" + accountId + "/withdrawals")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "frozen-with-1001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 500}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Account is frozen and cannot transact."));
    }

    @Test
    @DisplayName("Security Rule: Double-entry conservation sum remains exactly 0 across operations")
    void conservationStaysZeroAcrossOperations() throws Exception {
        // Execute multiple deposits and withdrawals
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "cons-dep-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 25000}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/accounts/" + accountId + "/withdrawals")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "cons-with-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 7000}"))
                .andExpect(status().isOk());

        // Verify total conservation across all ledger entries in DB is 0
        Long sum = jdbcTemplate.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM ledger_entries", Long.class);
        assertThat(sum).isEqualTo(0L);
    }

    @Test
    @DisplayName("Security Rule: 100 parallel withdrawals never overdraw and final balance is exact")
    void hundredParallelWithdrawalsNeverOverdrawAndFinalBalanceIsExact() throws Exception {
        // Starting balance: 10,000 paise
        mockMvc.perform(post("/api/accounts/" + accountId + "/deposits")
                        .header("Authorization", "Bearer " + holderToken)
                        .header("Idempotency-Key", "deposit-10k-initial")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 10000}"))
                .andExpect(status().isOk());

        int totalThreads = 100;
        long withdrawalAmount = 200L; // 100 * 200 = 20,000 attempted, exactly 50 can succeed (50 * 200 = 10,000)

        ExecutorService executor = Executors.newFixedThreadPool(totalThreads);
        CountDownLatch readyLatch = new CountDownLatch(totalThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(totalThreads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger insufficientFundsCount = new AtomicInteger(0);

        for (int i = 0; i < totalThreads; i++) {
            final int index = i;
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    MvcResult result = mockMvc.perform(post("/api/accounts/" + accountId + "/withdrawals")
                                    .header("Authorization", "Bearer " + holderToken)
                                    .header("Idempotency-Key", "parallel-withdraw-key-" + index)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"amountMinor\": " + withdrawalAmount + "}"))
                            .andReturn();

                    int statusCode = result.getResponse().getStatus();
                    if (statusCode == 200) {
                        successCount.incrementAndGet();
                    } else if (statusCode == 422) {
                        insufficientFundsCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // unexpected
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        readyLatch.await();
        startLatch.countDown(); // Release all 100 threads simultaneously
        boolean completed = doneLatch.await(30, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(completed).isTrue();
        // Exactly 50 withdrawals succeeded (50 * 200 = 10,000)
        assertThat(successCount.get()).isEqualTo(50);
        // Exactly 50 withdrawals were rejected due to insufficient funds
        assertThat(insufficientFundsCount.get()).isEqualTo(50);

        // Final balance must be EXACTLY 0 minor units
        Long finalBalance = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountId);
        assertThat(finalBalance).isEqualTo(0L);

        // Double-entry ledger conservation across entire system must remain strictly 0
        Long totalLedgerSum = jdbcTemplate.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM ledger_entries", Long.class);
        assertThat(totalLedgerSum).isEqualTo(0L);
    }

    private void registerUser(String email, String password) throws Exception {
        RegisterRequest request = new RegisterRequest(email, password);
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private String loginUser(String email, String password) throws Exception {
        LoginRequest request = new LoginRequest(email, password);
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> map = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        return (String) map.get("token");
    }

    private UUID createAccount(String token, String name) throws Exception {
        CreateAccountRequest request = new CreateAccountRequest(name);
        MvcResult result = mockMvc.perform(post("/api/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<?, ?> map = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        return UUID.fromString((String) map.get("id"));
    }
}

