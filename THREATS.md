# LedgerLine — Threat Model & Security Architecture (THREATS.md)

LedgerLine is a high-integrity financial ledger system designed to enforce:
> *"Move money so the books always balance and the same request never pays twice."*

This document tracks all 13 evaluated threat vectors, attack mechanics, architectural defenses, database constraints, verifying test methods, and inherent architectural limitations.

---

## Threat Matrix & Defense Specifications

| ID | Threat Vector | Attack Scenario | Defense Implementation | Verifying Test Method | Architectural Limitations & Trade-Offs |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T-01** | **Double-Spend** | Adversary initiates concurrent transfers or withdrawals exceeding their total balance by firing requests simultaneously before balance deduction commits. | Deterministic pessimistic row-level locking (`SELECT ... FOR UPDATE` ordered by ascending UUID) + domain check + DB constraint `(balance >= 0)`. Transactions execute sequentially per account. | `AccountMovementsAndConcurrencyTest.hundredParallelWithdrawalsNeverOverdrawAndFinalBalanceIsExact` | Lock contention reduces throughput under high concurrent access to a single hot account. |
| **T-02** | **Race Condition (Balance Mutex)** | Multiple client threads attempt to transfer funds from Account A to Account B simultaneously, racing between read and balance write. | Strict database-level row locking inside single `@Transactional(isolation = Isolation.READ_COMMITTED)` boundary. Balance updates use atomic arithmetic (`Math.subtractExact` / `Math.addExact`). | `TransfersAndIdempotencyHostileTest.fiftyParallelIdenticalRequestsGiveExactlyOneTransferAnd49Replays` | Relies on database row lock manager; requires active database transaction for duration of lock. |
| **T-03** | **Replay Attack** | Intercepting a valid signed request and re-submitting it across the network to duplicate the monetary effect. | Mandatory `Idempotency-Key` header bound to `user_id`. Key row inserted with `ON CONFLICT DO NOTHING` and locked `FOR UPDATE`. Second execution detects existing key and replays stored response without touching balances. | `TransfersAndIdempotencyHostileTest.fiftyParallelIdenticalRequestsGiveExactlyOneTransferAnd49Replays` | Replays require database storage of response payloads for the retention period (default 24h). |
| **T-04** | **Duplicate Request (Payload Mismatch)** | Attacker intercepts a valid `Idempotency-Key` and attaches it to a different payload (e.g., higher amount or different recipient) hoping to hijack the execution token. | Request payload canonical hash (SHA-256) is stored with the idempotency record. Replays verify that the incoming payload hash matches the stored hash; mismatch raises HTTP 422 Unprocessable Entity. | `TransfersAndIdempotencyHostileTest.sameKeyWithDifferentPayloadGives422Conflict` | Client applications must ensure proper UUID generation per distinct user intent. |
| **T-05** | **Insecure Direct Object Reference (IDOR)** | Authenticated holder tries to view, withdraw from, or transfer out of another holder's account by guessing or enumerating account UUIDs. | `AccountAccessPolicy` strictly validates account ownership against the authenticated JWT subject. Accessing a foreign account unconditionally returns HTTP 404 Not Found (never 403), masking existence. | `AuthAndAuthorizationSecurityTest.idorMatrixHolderGets404OnEveryAccountScopedRouteForAnotherHoldersAccount` | Requires joining account ownership checks on all path-variable account identifiers. |
| **T-06** | **Privilege Escalation** | Regular `HOLDER` sends requests to administrative endpoints (`/api/admin/*`) or audit logs (`/api/audit/*`). | Method-level security with `@PreAuthorize("hasRole('ADMIN')")` and `@PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")`. Spring Security filter chain defaults to deny-all. | `AuditAndStatementsSecurityTest.auditorCanReadEverythingButGets403OnEveryWriteRoute` | Requires rigorous annotation on all sensitive controller methods and strict role assignment. |
| **T-07** | **Role Tampering via Register** | Malicious user supplies `"role": "ADMIN"` or `"role": "AUDITOR"` in `/api/auth/register` payload to gain elevated privileges during signup. | Registration DTO (`RegisterRequest`) contains only `email`, `password`. The service unconditionally binds `UserRole.HOLDER`. Any client-supplied role field is rejected with HTTP 422. | `AuthAndAuthorizationSecurityTest.registerCannotSetRoleAndRejectsClientSuppliedRole` | Administrative users must be provisioned via secure seed scripts or authenticated `/api/admin/users` by existing Admins. |
| **T-08** | **Audit Trail Tampering** | Rogue DBA or compromised backend service modifies, deletes, or truncates audit logs to conceal fraudulent activity. | 1. Database trigger `trg_audit_log_append_only` raises SQLSTATE `55000` on `UPDATE`, `DELETE`, `TRUNCATE`.<br>2. Cryptographic hash chain: $\text{hash} = \text{SHA-256}(\text{prev\_hash} \parallel \text{seq} \parallel \dots)$. Verification flags exact broken sequence. | `AuditAndStatementsSecurityTest.tamperedRowReportsExactBrokenSeq` | A superuser with permission to disable triggers (`ALTER TABLE DISABLE TRIGGER`) can alter data, but cannot forge the SHA-256 cryptographic chain without invalidating `/api/audit/verify`. |
| **T-09** | **JWT Forgery & alg:none** | Attacker crafts an unsigned token (`{"alg":"none"}`) or signs token with an arbitrary symmetric key. | Strict JJWT parser requires HMAC-SHA256 with minimum 256-bit secret. Explicitly rejects unsigned tokens and verifies signature, expiration, and database user status on every request. | `AuthAndAuthorizationSecurityTest.algNoneTokenIsRejectedWith401Unauthorized` | Key rotation requires centralized coordination or dual-key verification window. |
| **T-10** | **Brute-Force Attack** | Automated script attempts to guess user passwords via high-frequency `/api/auth/login` requests. | In-memory `RateLimitService` tracks consecutive failed login attempts. 5 failed attempts locks the account for 15 minutes. Password comparison uses BCrypt with cost factor 12. | `AuthAndAuthorizationSecurityTest.loginLockoutAfterFiveFailedAttempts` | In-memory lockouts reset on application restart; production clustering requires distributed Redis store. |
| **T-11** | **User Enumeration** | Attacker probes `/api/auth/login` with various emails to discover registered users based on differing response times or error messages. | Login failures return identical generic HTTP 401 Problem Details (`"Invalid credentials"`). BCrypt dummy verification runs on non-existent users to maintain constant-time response. | `AuthAndAuthorizationSecurityTest.loginReturnsGenericInvalidCredentialsPreventingUserEnumeration` | Timing differences below ~5ms could theoretically exist on low-power hardware, though BCrypt calculation dominates. |
| **T-12** | **Integer Overflow & Rounding Leaks** | Attacker inputs fractional paise (e.g. `10.555`), negative amounts, or values exceeding $2^{63}-1$ to cause arithmetic overflows or fractional currency creation. | 1. Monetary inputs strictly accept integer minor units (`BIGINT` paise). Floating-point parsing is completely rejected.<br>2. All balance calculations use `Math.addExact` and `Math.subtractExact`, throwing `ArithmeticException` on overflow.<br>3. DB check constraint `amount > 0`. | `AccountMovementsAndConcurrencyTest.badAmountsRejected` | Maximum single account balance capped at `Long.MAX_VALUE` paise ($\approx 9.22 \times 10^{16}$ paise or $\approx ₹922$ trillion). |
| **T-13** | **Deadlock in Bidirectional Transfers** | Thread 1 transfers $A \to B$ while Thread 2 transfers $B \to A$ simultaneously, leading to circular wait and database deadlock. | Deterministic locking order: accounts are always locked in ascending UUID order (`firstLock = from.compareTo(to) < 0 ? from : to`). Thread 2 waits for Thread 1's locks before proceeding. | `TransfersAndIdempotencyHostileTest.opposingTransferStormsFinishWithoutDeadlock` | Adds minimal CPU overhead for UUID comparison prior to query execution. |
| **T-14** | **Forensic Trace Enumeration & Unauthorized Inspection** | Adversary or non-privileged customer (`HOLDER`) attempts to probe arbitrary transfer IDs via `GET /api/audit/transfers/{transferId}` to inspect counterparty balance positions, system accounts, and audit hashes. | Spring Security method-level RBAC `@PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")` rejects non-privileged callers with HTTP 403 Forbidden. Unknown transfers return RFC 7807 404 Not Found without stack traces. Malformed UUIDs return 422. | `AuditAndStatementsSecurityTest.transferTraceReturns403ForHolderRole` & `AuditAndStatementsSecurityTest.transferTraceSucceedsForAuditorAndAdminWithEntriesAndAuditHashes` | Auditors and Admins have supervisory read access to full transfer traces; relies on safeguarding auditor and administrator credentials. |
| **T-15** | **Unjournaled Balance Manipulation & Skimming** | A rogue administrator or compromised query performs an out-of-band `UPDATE accounts SET balance = balance + X` without inserting corresponding double-entry `ledger_entries`, attempting to siphon funds unnoticed. | `GET /api/ledger/reconciliation` performs an independent aggregate vertical audit: compares `accounts.balance` against `COALESCE(SUM(ledger_entries.amount), 0)` per account. Any non-zero difference flags `reconciled = false` and `overallHealthy = false`. Capped at 100 items per page; restricted to `AUDITOR` and `ADMIN`. | `AuditAndStatementsSecurityTest.reconciliationReportDetectsTamperedBalanceDiscrepancy` & `AuditAndStatementsSecurityTest.reconciliationReportSucceedsForAuditorAndAdminWithSystemAccounts` | Aggregating historical ledger items runs snapshot read query; pagination capped at 100 avoids memory exhaustion. |
| **T-16** | **CSV Formula Injection & Log Exfiltration** | Attacker injects malicious spreadsheet formulas (`=CMD|...`, `+`, `-`, `@`, `\t`, `\r`) into user input, entity IDs, or audit payloads hoping that when an Auditor/Admin exports `GET /api/audit/export` to Excel/LibreOffice, formula execution or exfiltration triggers. | Cell sanitization routine (`sanitizeCsvCell`) detects values beginning with `= `, `+`, `-`, `@`, `\t`, or `\r` and prepends an apostrophe `'` before RFC 4180 quoting, neutralizing spreadsheet formula execution. Endpoint enforces `@PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")` with strict export limit (capped at max 1,000 rows). | `AuditAndStatementsSecurityTest.auditCsvExportReturnsSanitizedFileGuardingAgainstFormulaInjection` & `AuditAndStatementsSecurityTest.auditCsvExportIsCappedAt1000Rows` | Exported cells starting with formula symbols display a leading apostrophe in spreadsheet viewers. |
| **T-17** | **Unaccountable Account Freeze & Audit Evasion** | Rogue or compromised administrator sends empty or arbitrary freeze/unfreeze requests to disable customer accounts without giving regulatory justification, or sends out-of-bounds payload strings. | Controller strictly enforces mandatory reason bounded between 3 and 200 characters. Missing, blank, or out-of-bounds reasons unconditionally return RFC 7807 HTTP 400 Bad Request Problem Details. Every status change logs an immutable audit entry containing the exact reason, previous status, and actor UUID into the SHA-256 hash chain. | `AuthAndAuthorizationSecurityTest.freezeAccountWithoutReasonReturns400BadRequest`, `AuthAndAuthorizationSecurityTest.freezeAccountWithReasonUnder3CharsReturns400BadRequest`, `AuthAndAuthorizationSecurityTest.freezeAccountWithReasonOver200CharsReturns400BadRequest`, & `AuthAndAuthorizationSecurityTest.freezeAndUnfreezeWithValidReasonRecordsAuditLogRowWithReason` | Relies on administrator authentication and truthfulness of the submitted rationale string. |

---

## Cryptographic Hash-Chain Integrity Specification

The audit trail forms a linear cryptographic hash chain. Each audit entry calculates its hash over:
$$\text{hash}_n = \text{SHA-256}(\text{hash}_{n-1} \parallel \text{seq} \parallel \text{actor\_id} \parallel \text{action} \parallel \text{entity\_type} \parallel \text{entity\_id} \parallel \text{canonical\_json}(\text{payload}) \parallel \text{created\_at\_iso})$$

- **Genesis Block**: The initial audit record ($seq = 1$) uses a genesis previous hash consisting of 64 hexadecimal zeros:
  `0000000000000000000000000000000000000000000000000000000000000000`
- **Advisory Serialization Lock**: To guarantee that concurrent transactions do not fork the chain or compute hashes out of order, every append operation acquires a PostgreSQL transaction-scoped advisory lock:
  ```sql
  SELECT pg_advisory_xact_lock(74291847129);
  ```
- **Failed Attempt Logging**: Security-relevant failures (403 Forbidden, 404 Not Found on sensitive resources, validation errors, insufficient funds) are logged via a dedicated `AuditService` method executing in a `Propagation.REQUIRES_NEW` transaction. If the main monetary transaction rolls back, the audit evidence remains permanently recorded.

---

## Immutability Triggers (Defense-in-Depth)

The database enforces append-only semantics independently of application security rules:

```sql
CREATE OR REPLACE FUNCTION fn_prevent_tamper()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only. UPDATE, DELETE, and TRUNCATE are prohibited.', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfers_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON transfers
    FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_tamper();

CREATE TRIGGER trg_ledger_entries_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_entries
    FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_tamper();

CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_tamper();
```
