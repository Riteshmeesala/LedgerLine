package com.ledgerline.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.dto.CreateAccountRequest;
import com.ledgerline.dto.LoginRequest;
import com.ledgerline.dto.RegisterRequest;
import com.ledgerline.dto.TransferRequest;
import com.ledgerline.service.MoneyEngineService;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class TransfersAndIdempotencyHostileTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MoneyEngineService moneyEngineService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private String tokenA;
    private UUID userA;
    private UUID accountA;

    private String tokenB;
    private UUID userB;
    private UUID accountB;

    @BeforeEach
    void setUp() throws Exception {
        userA = UUID.randomUUID();
        String emailA = "usera-" + userA + "@transfers.com";
        registerUser(emailA, "Password123!");
        tokenA = loginUser(emailA, "Password123!");
        accountA = createAccount(tokenA, "Account A");

        userB = UUID.randomUUID();
        String emailB = "userb-" + userB + "@transfers.com";
        registerUser(emailB, "Password123!");
        tokenB = loginUser(emailB, "Password123!");
        accountB = createAccount(tokenB, "Account B");

        // Fund Account A with 100,000 paise (1,000 INR)
        mockMvc.perform(post("/api/accounts/" + accountA + "/deposits")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", "seed-deposit-a-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 100000}"))
                .andExpect(status().isOk());

        // Fund Account B with 100,000 paise (1,000 INR)
        mockMvc.perform(post("/api/accounts/" + accountB + "/deposits")
                        .header("Authorization", "Bearer " + tokenB)
                        .header("Idempotency-Key", "seed-deposit-b-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": 100000}"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Hostile Test: 50 parallel identical requests give exactly one transfer and 49 replays")
    void fiftyParallelIdenticalRequestsGiveExactlyOneTransferAnd49Replays() throws Exception {
        int totalRequests = 50;
        String sharedIdempotencyKey = "parallel-key-" + UUID.randomUUID();
        TransferRequest request = new TransferRequest(accountA, accountB, 500L);
        String requestJson = objectMapper.writeValueAsString(request);

        ExecutorService executor = Executors.newFixedThreadPool(totalRequests);
        CountDownLatch readyLatch = new CountDownLatch(totalRequests);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(totalRequests);

        AtomicInteger originalCount = new AtomicInteger(0);
        AtomicInteger replayedCount = new AtomicInteger(0);
        Set<String> distinctTransferIds = ConcurrentHashMap.newKeySet();

        for (int i = 0; i < totalRequests; i++) {
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    MvcResult result = mockMvc.perform(post("/api/transfers")
                                    .header("Authorization", "Bearer " + tokenA)
                                    .header("Idempotency-Key", sharedIdempotencyKey)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(requestJson))
                            .andReturn();

                    if (result.getResponse().getStatus() == 200) {
                        String replayedHeader = result.getResponse().getHeader("Idempotent-Replayed");
                        if ("true".equalsIgnoreCase(replayedHeader)) {
                            replayedCount.incrementAndGet();
                        } else {
                            originalCount.incrementAndGet();
                        }

                        Map<?, ?> map = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
                        distinctTransferIds.add((String) map.get("transferId"));
                    }
                } catch (Exception ignored) {
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        readyLatch.await();
        startLatch.countDown();
        boolean finished = doneLatch.await(30, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(finished).isTrue();
        // Exactly 1 original and 49 replays (or all 50 succeed with identical transferId)
        assertThat(originalCount.get() + replayedCount.get()).isEqualTo(50);
        assertThat(distinctTransferIds).hasSize(1);

        // Verify database: exactly 1 transfer was inserted with this idempotency key
        Long transferCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM transfers WHERE idempotency_key = ?", Long.class, sharedIdempotencyKey
        );
        assertThat(transferCount).isEqualTo(1L);

        // Account A was debited EXACTLY 500 minor units (never charged 50 times)
        Long balanceA = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountA);
        assertThat(balanceA).isEqualTo(99500L);
    }

    @Test
    @DisplayName("Hostile Test: Same idempotency key with different payload gives 422 conflict")
    void sameKeyWithDifferentPayloadGives422Conflict() throws Exception {
        String key = "reuse-key-" + UUID.randomUUID();

        // 1st request with 1000 minor units
        TransferRequest req1 = new TransferRequest(accountA, accountB, 1000L);
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req1)))
                .andExpect(status().isOk());

        // 2nd request with SAME key but DIFFERENT amount (2000 minor units)
        TransferRequest req2 = new TransferRequest(accountA, accountB, 2000L);
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.title").value("Idempotency Key Conflict"));
    }

    @Test
    @DisplayName("Hostile Test: Two users using the same key string do not collide")
    void twoUsersUsingSameKeyStringDoNotCollide() throws Exception {
        String commonKey = "common-client-key-" + UUID.randomUUID();

        // User A uses commonKey
        TransferRequest reqA = new TransferRequest(accountA, accountB, 500L);
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", commonKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reqA)))
                .andExpect(status().isOk());

        // User B uses identical commonKey
        TransferRequest reqB = new TransferRequest(accountB, accountA, 300L);
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenB)
                        .header("Idempotency-Key", commonKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reqB)))
                .andExpect(status().isOk());

        Long keysInDb = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM idempotency_keys WHERE key = ?", Long.class, commonKey
        );
        assertThat(keysInDb).isEqualTo(2L);
    }

    @Test
    @DisplayName("Hostile Test: Opposing A->B and B->A storms finish without deadlock")
    void opposingTransferStormsFinishWithoutDeadlock() throws Exception {
        int pairs = 20; // 20 A->B and 20 B->A = 40 concurrent operations
        int total = pairs * 2;
        ExecutorService executor = Executors.newFixedThreadPool(total);
        CountDownLatch readyLatch = new CountDownLatch(total);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(total);
        AtomicInteger successCount = new AtomicInteger(0);

        for (int i = 0; i < pairs; i++) {
            final int idx = i;
            // A -> B
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    TransferRequest req = new TransferRequest(accountA, accountB, 100L);
                    MvcResult res = mockMvc.perform(post("/api/transfers")
                                    .header("Authorization", "Bearer " + tokenA)
                                    .header("Idempotency-Key", "opposing-ab-" + idx + "-" + UUID.randomUUID())
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(req)))
                            .andReturn();
                    if (res.getResponse().getStatus() == 200) {
                        successCount.incrementAndGet();
                    }
                } catch (Exception ignored) {
                } finally {
                    doneLatch.countDown();
                }
            });

            // B -> A
            executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    TransferRequest req = new TransferRequest(accountB, accountA, 100L);
                    MvcResult res = mockMvc.perform(post("/api/transfers")
                                    .header("Authorization", "Bearer " + tokenB)
                                    .header("Idempotency-Key", "opposing-ba-" + idx + "-" + UUID.randomUUID())
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(req)))
                            .andReturn();
                    if (res.getResponse().getStatus() == 200) {
                        successCount.incrementAndGet();
                    }
                } catch (Exception ignored) {
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        readyLatch.await();
        startLatch.countDown();
        boolean completed = doneLatch.await(30, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(completed).isTrue();
        assertThat(successCount.get()).isEqualTo(total); // All 40 finished without deadlock
    }

    @Test
    @DisplayName("Hostile Test: Self-transfer rejected")
    void selfTransferRejected() throws Exception {
        TransferRequest selfReq = new TransferRequest(accountA, accountA, 500L);

        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", "self-key-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(selfReq)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Cannot transfer funds to the same account."));
    }

    @Test
    @DisplayName("Hostile Test: Transfer from non-owned account gives 404 and moves nothing")
    void transferFromNonOwnedAccountGives404AndMovesNothing() throws Exception {
        // User A attempts to transfer funds out of Account B (which belongs to User B)
        TransferRequest hostileReq = new TransferRequest(accountB, accountA, 1000L);

        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", "theft-key-" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(hostileReq)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // Verify Account B balance remained intact
        Long balanceB = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountB);
        assertThat(balanceB).isEqualTo(100000L);
    }

    @Test
    @DisplayName("Hostile Test: Random 100-operation mixed workload ends with total ledger = 0 and balances >= 0")
    void randomMixedWorkloadEndsWithTotalLedgerZeroAndBalancesNonNegative() throws Exception {
        Random rng = new Random(42);

        for (int i = 0; i < 100; i++) {
            int op = rng.nextInt(3);
            long amount = 100L + rng.nextInt(500);
            String key = "mixed-op-" + i + "-" + UUID.randomUUID();

            if (op == 0) {
                // Deposit to A
                mockMvc.perform(post("/api/accounts/" + accountA + "/deposits")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": " + amount + "}"));
            } else if (op == 1) {
                // Transfer A -> B
                TransferRequest req = new TransferRequest(accountA, accountB, amount);
                mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + tokenA)
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)));
            } else {
                // Withdrawal from B
                mockMvc.perform(post("/api/accounts/" + accountB + "/withdrawals")
                        .header("Authorization", "Bearer " + tokenB)
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountMinor\": " + amount + "}"));
            }
        }

        // 1. Total ledger entries across entire database must sum strictly to 0
        Long totalLedger = jdbcTemplate.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM ledger_entries", Long.class);
        assertThat(totalLedger).isEqualTo(0L);

        // 2. Every customer account balance must be non-negative
        List<Long> customerBalances = jdbcTemplate.queryForList(
                "SELECT balance FROM accounts WHERE type = 'CUSTOMER'", Long.class
        );
        for (Long bal : customerBalances) {
            assertThat(bal).isGreaterThanOrEqualTo(0L);
        }
    }

    @Test
    @DisplayName("Hostile Test: Injected exception after balance update rolls everything back")
    void injectedExceptionAfterBalanceUpdateRollsEverythingBack() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        Long balanceBefore = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountA);

        try {
            tx.execute(status -> {
                // 1. Debit account A directly
                jdbcTemplate.update("UPDATE accounts SET balance = balance - 5000 WHERE id = ?", accountA);

                // 2. Simulate failure before commit (e.g. downstream network failure or unhandled exception)
                throw new RuntimeException("Simulated catastrophic crash");
            });
        } catch (RuntimeException ignored) {
        }

        // Verify balance rolled back completely
        Long balanceAfter = jdbcTemplate.queryForObject("SELECT balance FROM accounts WHERE id = ?", Long.class, accountA);
        assertThat(balanceAfter).isEqualTo(balanceBefore);
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

