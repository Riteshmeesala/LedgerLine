package com.ledgerline.schema;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
public class SchemaIntegrityTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private UUID testUserId;
    private UUID customerAccountId1;
    private UUID customerAccountId2;
    private final UUID cashInOutSystemAccountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");

    @BeforeEach
    void setUp() {
        testUserId = UUID.randomUUID();
        customerAccountId1 = UUID.randomUUID();
        customerAccountId2 = UUID.randomUUID();

        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
                testUserId, "holder-" + testUserId + "@example.com", "hash", "HOLDER"
        );

        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status) VALUES (?, ?, 'CUSTOMER', 'Checking 1', 100000, 0, 'ACTIVE')",
                customerAccountId1, testUserId
        );

        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status) VALUES (?, ?, 'CUSTOMER', 'Checking 2', 50000, 0, 'ACTIVE')",
                customerAccountId2, testUserId
        );
    }

    @Test
    @DisplayName("Security Rule: Negative customer balance fails database check constraint (no overdraft)")
    void negativeCustomerBalanceFailsDatabaseCheckConstraint() {
        UUID overdrawnAccountId = UUID.randomUUID();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status) VALUES (?, ?, 'CUSTOMER', 'Overdrawn', -1, 0, 'ACTIVE')",
                overdrawnAccountId, testUserId
        ))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("chk_accounts_balance_non_negative");
    }

    @Test
    @DisplayName("Security Rule: System accounts are permitted to have negative balance to balance cash flows")
    void systemAccountsArePermittedToHaveNegativeBalance() {
        UUID systemAccId = UUID.randomUUID();

        jdbcTemplate.update(
                "INSERT INTO accounts (id, owner_id, type, name, balance, version, status) VALUES (?, NULL, 'SYSTEM', 'TEST_SYSTEM', -50000, 0, 'ACTIVE')",
                systemAccId
        );

        Long balance = jdbcTemplate.queryForObject(
                "SELECT balance FROM accounts WHERE id = ?", Long.class, systemAccId
        );
        assertThat(balance).isEqualTo(-50000L);
    }

    @Test
    @DisplayName("Security Rule: Unbalanced double-entry ledger fails deferred constraint trigger at commit")
    void unbalancedDoubleEntryLedgerFailsDeferredConstraintTriggerAtCommit() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID transferId = UUID.randomUUID();

        assertThatThrownBy(() -> tx.execute(status -> {
            jdbcTemplate.update(
                    "INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key) VALUES (?, 'TRANSFER', ?, ?, 1000, ?, 'idem-unbalanced-1')",
                    transferId, customerAccountId1, customerAccountId2, testUserId
            );

            // Insert single-sided credit (+1000) with NO matching debit
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, 1000, 51000)",
                    transferId, customerAccountId2
            );

            // Attempting to commit here will fire trg_enforce_ledger_conservation
            return null;
        }))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Double-entry conservation violated");
    }

    @Test
    @DisplayName("Security Rule: Balanced double-entry ledger commits successfully with zero sum")
    void balancedDoubleEntryLedgerCommitsSuccessfullyWithZeroSum() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID transferId = UUID.randomUUID();

        tx.execute(status -> {
            jdbcTemplate.update(
                    "INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key) VALUES (?, 'TRANSFER', ?, ?, 1000, ?, 'idem-balanced-1')",
                    transferId, customerAccountId1, customerAccountId2, testUserId
            );

            // Debit from_account (-1000)
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, -1000, 99000)",
                    transferId, customerAccountId1
            );

            // Credit to_account (+1000) -> Sum is exactly 0
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, 1000, 51000)",
                    transferId, customerAccountId2
            );
            return null;
        });

        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries WHERE transfer_id = ?", Long.class, transferId
        );
        assertThat(count).isEqualTo(2L);
    }

    @Test
    @DisplayName("Security Rule: Duplicate idempotency key for same user fails primary key constraint")
    void duplicateIdempotencyKeyForSameUserFailsPrimaryKeyConstraint() {
        String key = "idempotency-key-alpha";

        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (user_id, key, request_hash, status) VALUES (?, ?, 'hash1', 'IN_PROGRESS')",
                testUserId, key
        );

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO idempotency_keys (user_id, key, request_hash, status) VALUES (?, ?, 'hash2', 'IN_PROGRESS')",
                testUserId, key
        ))
        .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("Security Rule: Different users can use identical idempotency key string without collision")
    void differentUsersCanUseIdenticalIdempotencyKeyStringWithoutCollision() {
        UUID secondUser = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'HOLDER')",
                secondUser, "second-" + secondUser + "@example.com"
        );

        String sharedKey = "shared-idempotency-key-" + UUID.randomUUID();

        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (user_id, key, request_hash, status) VALUES (?, ?, 'hashA', 'COMPLETED')",
                testUserId, sharedKey
        );

        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (user_id, key, request_hash, status) VALUES (?, ?, 'hashB', 'COMPLETED')",
                secondUser, sharedKey
        );

        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM idempotency_keys WHERE key = ?", Long.class, sharedKey
        );
        assertThat(count).isEqualTo(2L);
    }

    @Test
    @DisplayName("Security Rule: Self-transfer fails distinct accounts check constraint")
    void selfTransferFailsDistinctAccountsCheckConstraint() {
        UUID transferId = UUID.randomUUID();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key) VALUES (?, 'TRANSFER', ?, ?, 500, ?, 'idem-self-1')",
                transferId, customerAccountId1, customerAccountId1, testUserId
        ))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("chk_transfers_distinct_accounts");
    }

    @Test
    @DisplayName("Security Rule: Update on ledger_entries table fails append-only trigger")
    void updateOnLedgerEntriesTableFailsAppendOnlyTrigger() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID transferId = createTestTransfer();
        tx.execute(status -> {
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, -100, 99900)",
                    transferId, customerAccountId1
            );
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, 100, 50100)",
                    transferId, customerAccountId2
            );
            return null;
        });

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE ledger_entries SET amount = 9999 WHERE transfer_id = ?", transferId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Delete on ledger_entries table fails append-only trigger")
    void deleteOnLedgerEntriesTableFailsAppendOnlyTrigger() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID transferId = createTestTransfer();
        tx.execute(status -> {
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, -200, 99800)",
                    transferId, customerAccountId1
            );
            jdbcTemplate.update(
                    "INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after) VALUES (?, ?, 200, 50200)",
                    transferId, customerAccountId2
            );
            return null;
        });

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM ledger_entries WHERE transfer_id = ?", transferId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Truncate on ledger_entries table fails append-only trigger")
    void truncateOnLedgerEntriesTableFailsAppendOnlyTrigger() {
        assertThatThrownBy(() -> jdbcTemplate.execute("TRUNCATE TABLE ledger_entries CASCADE"))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Update on transfers table fails append-only trigger")
    void updateOnTransfersTableFailsAppendOnlyTrigger() {
        UUID transferId = createTestTransfer();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE transfers SET amount = 9999 WHERE id = ?", transferId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Delete on transfers table fails append-only trigger")
    void deleteOnTransfersTableFailsAppendOnlyTrigger() {
        UUID transferId = createTestTransfer();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM transfers WHERE id = ?", transferId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Truncate on transfers table fails append-only trigger")
    void truncateOnTransfersTableFailsAppendOnlyTrigger() {
        assertThatThrownBy(() -> jdbcTemplate.execute("TRUNCATE TABLE transfers CASCADE"))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Update on audit_log table fails append-only trigger")
    void updateOnAuditLogTableFailsAppendOnlyTrigger() {
        jdbcTemplate.update(
                "INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, prev_hash, hash) VALUES (?, 'HOLDER', 'LOGIN', 'USER', '1', '0', 'h1')",
                testUserId
        );

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE audit_log SET action = 'ALTERED' WHERE actor_id = ?", testUserId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Delete on audit_log table fails append-only trigger")
    void deleteOnAuditLogTableFailsAppendOnlyTrigger() {
        jdbcTemplate.update(
                "INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, prev_hash, hash) VALUES (?, 'HOLDER', 'LOGIN', 'USER', '2', '0', 'h2')",
                testUserId
        );

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM audit_log WHERE actor_id = ?", testUserId
        ))
        .isInstanceOf(Exception.class)
        .hasMessageContaining("Append-only violation");
    }

    @Test
    @DisplayName("Security Rule: Truncate on audit_log table fails append-only trigger")
    void truncateOnAuditLogTableFailsAppendOnlyTrigger() {
        assertThatThrownBy(() -> jdbcTemplate.execute("TRUNCATE TABLE audit_log"))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("Append-only violation");
    }

    private UUID createTestTransfer() {
        UUID transferId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key) VALUES (?, 'TRANSFER', ?, ?, 100, ?, ?)",
                transferId, customerAccountId1, customerAccountId2, testUserId, "transfer-" + transferId
        );
        return transferId;
    }
}

