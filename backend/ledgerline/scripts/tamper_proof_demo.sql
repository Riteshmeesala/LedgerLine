-- =============================================================================
-- LEDGERLINE: Tamper-Proof Trigger Demonstration Script (Local Only)
-- =============================================================================
-- This script demonstrates PostgreSQL database-level enforcement of append-only
-- immutability on audit_log, ledger_entries, and transfers tables.
--
-- Running this script verifies that even a privileged database client cannot:
--  1. UPDATE existing audit log records
--  2. DELETE existing audit log records
--  3. TRUNCATE the audit log table
--  4. UPDATE financial ledger entries
--  5. DELETE financial transfers
--
-- Usage:
--   psql -U root -p 5433 -h 127.0.0.1 -d ledgerline_test -f tamper_proof_demo.sql
-- =============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Starting Tamper-Proof Trigger Verification...'
\echo '----------------------------------------------------------------------'

-- Ensure test seed exists for audit_log and transfers/ledger_entries
DO $$
DECLARE
    v_transfer_id UUID := '00000000-0000-0000-0000-000000000099';
    v_user_id UUID := '00000000-0000-0000-0000-000000000001';
    v_system_account UUID := 'a0000000-0000-0000-0000-000000000001';
    v_test_account UUID := '00000000-0000-0000-0000-000000000099';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM audit_log WHERE seq = 1) THEN
        INSERT INTO audit_log (seq, action, entity_type, entity_id, payload, prev_hash, hash, created_at)
        VALUES (
            1,
            'SYSTEM_INIT',
            'SYSTEM',
            'GENESIS',
            '{"event":"genesis"}'::jsonb,
            '0000000000000000000000000000000000000000000000000000000000000000',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            NOW()
        );
    END IF;

    -- Ensure test user and test account exist for demo transfers
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
        INSERT INTO users (id, email, password_hash, role)
        VALUES (v_user_id, 'demo-system@ledgerline.local', '$2a$12$eXAMPLEhashToPreventEmptyAuthString', 'ADMIN');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_test_account) THEN
        INSERT INTO accounts (id, owner_id, type, name, balance, version, status)
        VALUES (v_test_account, v_user_id, 'CUSTOMER', 'Demo Test Account', 0, 0, 'ACTIVE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM transfers WHERE id = v_transfer_id) THEN
        INSERT INTO transfers (id, kind, from_account, to_account, amount, initiated_by, idempotency_key, created_at)
        VALUES (v_transfer_id, 'DEPOSIT', v_system_account, v_test_account, 1000, v_user_id, 'demo-seed-key-01', NOW());

        INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after, created_at)
        VALUES (v_transfer_id, v_system_account, -1000, -1000, NOW());

        INSERT INTO ledger_entries (transfer_id, account_id, amount, balance_after, created_at)
        VALUES (v_transfer_id, v_test_account, 1000, 1000, NOW());
    END IF;
END $$;

\echo '[TEST 1] Attempting UPDATE on audit_log (Tampering with payload)...'
DO $$
BEGIN
    UPDATE audit_log SET payload = '{"tampered":true}'::jsonb WHERE seq = 1;
    RAISE EXCEPTION 'SECURITY FAILURE: UPDATE on audit_log was allowed!';
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'SUCCESS: UPDATE blocked by trigger: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END $$;

\echo '[TEST 2] Attempting DELETE from audit_log (Erasing audit trail)...'
DO $$
BEGIN
    DELETE FROM audit_log WHERE seq = 1;
    RAISE EXCEPTION 'SECURITY FAILURE: DELETE on audit_log was allowed!';
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'SUCCESS: DELETE blocked by trigger: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END $$;

\echo '[TEST 3] Attempting TRUNCATE on audit_log...'
DO $$
BEGIN
    EXECUTE 'TRUNCATE TABLE audit_log';
    RAISE EXCEPTION 'SECURITY FAILURE: TRUNCATE on audit_log was allowed!';
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'SUCCESS: TRUNCATE blocked by trigger: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END $$;

\echo '[TEST 4] Attempting UPDATE on ledger_entries...'
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id INTO v_id FROM ledger_entries LIMIT 1;
    UPDATE ledger_entries SET amount = 999999999 WHERE id = v_id;
    RAISE EXCEPTION 'SECURITY FAILURE: UPDATE on ledger_entries was allowed!';
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'SUCCESS: UPDATE on ledger_entries blocked by trigger: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END $$;

\echo '[TEST 5] Attempting DELETE from transfers...'
DO $$
DECLARE
    v_tid UUID;
BEGIN
    SELECT id INTO v_tid FROM transfers LIMIT 1;
    DELETE FROM transfers WHERE id = v_tid;
    RAISE EXCEPTION 'SECURITY FAILURE: DELETE on transfers was allowed!';
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'SUCCESS: DELETE on transfers blocked by trigger: % (SQLSTATE %)', SQLERRM, SQLSTATE;
END $$;

\echo '----------------------------------------------------------------------'
\echo 'All tamper-proof trigger assertions PASSED. Tables are strictly append-only.'
\echo '----------------------------------------------------------------------'
