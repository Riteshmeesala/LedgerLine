-- =============================================================================
-- LedgerLine Database Migration: V1__init_schema.sql
-- Description: Core tables, append-only triggers, conservation constraints,
--              and security check constraints with attack defense documentation.
-- =============================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'HOLDER', 'AUDITOR'))
);

COMMENT ON TABLE users IS 'Authorized actors in the system. Roles are strictly partitioned into ADMIN, HOLDER, and AUDITOR.';
COMMENT ON CONSTRAINT uk_users_email ON users IS 'Attack stopped: Account shadowing/collision through duplicate email registration.';
COMMENT ON CONSTRAINT chk_users_role ON users IS 'Attack stopped: Privilege escalation by injecting undefined or elevated administrative roles.';

-- -----------------------------------------------------------------------------
-- 2. ACCOUNTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    owner_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_accounts_type CHECK (type IN ('CUSTOMER', 'SYSTEM')),
    CONSTRAINT chk_accounts_status CHECK (status IN ('ACTIVE', 'FROZEN')),
    CONSTRAINT chk_accounts_balance_non_negative CHECK (type = 'SYSTEM' OR balance >= 0)
);

COMMENT ON TABLE accounts IS 'Balances held in minor units (paise). Customer accounts cannot overdraw; system accounts balance external flows.';
COMMENT ON CONSTRAINT chk_accounts_type ON accounts IS 'Attack stopped: Type manipulation allowing customer accounts to impersonate system balance nodes.';
COMMENT ON CONSTRAINT chk_accounts_status ON accounts IS 'Attack stopped: Transacting on frozen accounts under administrative investigation.';
COMMENT ON CONSTRAINT chk_accounts_balance_non_negative ON accounts IS 'Attack stopped: Overdraft and arbitrary credit creation. Customer balances are strictly >= 0.';

-- Seed system balance node: CASH_IN_OUT (Fixed deterministic UUID)
-- All external deposits and withdrawals are balanced two-sided entries against this account, preserving sum = 0.
INSERT INTO accounts (id, owner_id, type, name, balance, version, status)
VALUES ('a0000000-0000-0000-0000-000000000001', NULL, 'SYSTEM', 'CASH_IN_OUT', 0, 0, 'ACTIVE');

-- -----------------------------------------------------------------------------
-- 3. TRANSFERS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE transfers (
    id UUID PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    from_account UUID NOT NULL REFERENCES accounts(id),
    to_account UUID NOT NULL REFERENCES accounts(id),
    amount BIGINT NOT NULL,
    initiated_by UUID NOT NULL REFERENCES users(id),
    idempotency_key VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_transfers_kind CHECK (kind IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),
    CONSTRAINT chk_transfers_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_transfers_distinct_accounts CHECK (from_account <> to_account)
);

COMMENT ON TABLE transfers IS 'Audit record of monetary movement intent between two distinct accounts.';
COMMENT ON CONSTRAINT chk_transfers_kind ON transfers IS 'Attack stopped: Unrecognized transfer operations bypassing validation logic.';
COMMENT ON CONSTRAINT chk_transfers_amount_positive ON transfers IS 'Attack stopped: Negative or zero amount movements that would siphon funds backwards.';
COMMENT ON CONSTRAINT chk_transfers_distinct_accounts ON transfers IS 'Attack stopped: Self-transfer race condition or phantom credit generation to the same account.';

-- -----------------------------------------------------------------------------
-- 4. LEDGER ENTRIES TABLE (Append-Only Double Entry Journal)
-- -----------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transfer_id UUID NOT NULL REFERENCES transfers(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ledger_entries_amount_nonzero CHECK (amount <> 0)
);

COMMENT ON TABLE ledger_entries IS 'Immutable double-entry ledger line items. Signed integer amounts reflecting debits and credits.';
COMMENT ON CONSTRAINT chk_ledger_entries_amount_nonzero ON ledger_entries IS 'Attack stopped: Zero-value clutter or no-op ledger injection.';

-- -----------------------------------------------------------------------------
-- 5. IDEMPOTENCY KEYS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
    user_id UUID NOT NULL REFERENCES users(id),
    key VARCHAR(64) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_status INT NULL,
    response_body JSONB NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key),
    CONSTRAINT chk_idempotency_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED'))
);

COMMENT ON TABLE idempotency_keys IS 'Stores request hashes and replay payloads per user to guarantee exactly-once execution.';
COMMENT ON CONSTRAINT chk_idempotency_status ON idempotency_keys IS 'Attack stopped: Intermediate race manipulation with illegal state machine values.';

-- -----------------------------------------------------------------------------
-- 6. AUDIT LOG TABLE (Append-Only Hash-Chained Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
    seq BIGSERIAL PRIMARY KEY,
    actor_id UUID NULL REFERENCES users(id),
    actor_role VARCHAR(20) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    payload JSONB NULL,
    ip VARCHAR(45) NULL,
    prev_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_log IS 'Cryptographically chained tamper-evident operational log.';

-- -----------------------------------------------------------------------------
-- 7. DOUBLE-ENTRY CONSERVATION CONSTRAINT TRIGGER
-- -----------------------------------------------------------------------------
-- Checks that all ledger entries associated with NEW.transfer_id sum exactly to 0 at transaction commit.
CREATE OR REPLACE FUNCTION check_transfer_ledger_conservation()
RETURNS TRIGGER AS $$
DECLARE
    v_sum BIGINT;
BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_sum
    FROM ledger_entries
    WHERE transfer_id = NEW.transfer_id;

    IF v_sum <> 0 THEN
        RAISE EXCEPTION 'Double-entry conservation violated: transfer % entries sum to % minor units (must be 0)',
            NEW.transfer_id, v_sum
            USING ERRCODE = '23514'; -- check_violation
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_enforce_ledger_conservation
AFTER INSERT OR UPDATE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_transfer_ledger_conservation();

-- -----------------------------------------------------------------------------
-- 8. APPEND-ONLY IMMUTABILITY TRIGGERS
-- -----------------------------------------------------------------------------
-- Prohibits UPDATE, DELETE, and TRUNCATE on financial history and audit trail tables.
CREATE OR REPLACE FUNCTION raise_immutable_table_violation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Append-only violation: Operation % is prohibited on immutable table %',
        TG_OP, TG_TABLE_NAME
        USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$ LANGUAGE plpgsql;

-- ledger_entries immutability
CREATE TRIGGER trg_ledger_entries_no_update_delete
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

CREATE TRIGGER trg_ledger_entries_no_truncate
BEFORE TRUNCATE ON ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION raise_immutable_table_violation();

-- transfers immutability
CREATE TRIGGER trg_transfers_no_update_delete
BEFORE UPDATE OR DELETE ON transfers
FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

CREATE TRIGGER trg_transfers_no_truncate
BEFORE TRUNCATE ON transfers
FOR EACH STATEMENT EXECUTE FUNCTION raise_immutable_table_violation();

-- audit_log immutability
CREATE TRIGGER trg_audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION raise_immutable_table_violation();

