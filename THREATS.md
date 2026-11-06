# LedgerLine — Threat Model & Security Architecture (THREATS.md)

LedgerLine is a high-integrity financial ledger system designed to enforce:
> *"Move money so the books always balance and the same request never pays twice."*

This document tracks all identified threat vectors, attack mechanics, architectural defenses, database constraints, and the corresponding security tests proving resistance.

---

## Evaluation Criteria & Core Defenses

| Threat Vector | Attack Scenario | Defense Implementation | Verifying Test |
| :--- | :--- | :--- | :--- |
| **T-01: Replay & Double-Spend** | Submitting the same transfer or withdrawal request concurrently or sequentially to move funds multiple times. | Atomic idempotency lock on `(user_id, idempotency_key)` using `INSERT ... ON CONFLICT DO NOTHING` + row-level lock in the same DB transaction. | `TransfersIdempotencyTest.testConcurrentReplayPaysExactlyOnce` |
| **T-02: Negative Balance / Overdraft** | Attempting to withdraw or transfer more minor units than available, or race conditions exploiting uncommitted reads. | Pessimistic `SELECT ... FOR UPDATE` ordered by ascending account ID + DB check constraint `(type='SYSTEM' OR balance >= 0)` + `Math.subtractExact`. | `AccountsSecurityTest.testOverdraftRejectedAtDomainAndDatabase` |
| **T-03: Double-Entry Imbalance** | System credits an account without matching debit, or a partial write succeeds during node failure. | All money movements require symmetric ledger entries summing to 0 per transfer, enforced by DB trigger `DEFERRABLE INITIALLY DEFERRED` at commit time. | `LedgerConservationTest.testUnbalancedLedgerFailsAtCommit` |
| **T-04: Float Precision Drift** | Floating-point rounding errors causing fractional paisa leaks or balance discrepancy. | All monetary values are strictly `BIGINT` minor units (paise). JSON integer format strictly required; no float/double/BigDecimal in domain or API path. | `MoneyFormatValidationTest.testFloatingPointAndDecimalRejected` |
| **T-05: Ledger Tampering & Record Deletion** | Malicious insider or compromised application credential updates or deletes historical transactions. | Database triggers `BEFORE UPDATE OR DELETE OR TRUNCATE` on `ledger_entries`, `transfers`, and `audit_log` unconditionally raise exceptions (append-only DB). | `LedgerImmutabilityTest.testUpdateDeleteTruncateFails` |
| **T-06: Insecure Direct Object Reference (IDOR)** | Authenticated holder attempts to read or mutate another user's account details or balance. | `AccountAccessPolicy` ownership validation. Returns HTTP 404 (never 403) to prevent resource enumeration. | `AccountAccessSecurityTest.testHolderAccessingForeignAccountReturns404` |
| **T-07: Privilege Escalation** | Client passes `"role": "ADMIN"` or `"role": "AUDITOR"` in registration or account creation payload. | Server-side role assignment; registration DTO ignores/rejects role field and unconditionally assigns `HOLDER`. `@PreAuthorize` default-deny. | `AuthRoleSecurityTest.testRegisterCannotSetRole` |
| **T-08: Token Tampering & Alg None** | Attacker modifies JWT header to `alg: "none"` or modifies claims without valid secret signature. | Strict JJWT parser with minimum 256-bit HMAC secret; rejects `alg: none` and validates signature, expiry, and enabled user status on every request. | `JwtAuthenticationSecurityTest.testAlgNoneAndTamperedSignatureRejected` |
| **T-09: User Enumeration & Brute Force** | Probing `/api/auth/login` to discover valid emails or brute-forcing accounts. | Constant-time password verification; generic error response `Invalid credentials`; account lockout for 15 minutes after 5 consecutive failed attempts. | `AuthBruteForceSecurityTest.testLockoutAfterFiveFailedLoginsAndNoEnumeration` |
| **T-10: Audit Trail Tampering** | Adversary attempts to alter historical audit logs without detection. | Append-only cryptographically linked audit trail (`hash = SHA256(prev_hash + seq + actor_id + action + payload + timestamp)`). | `AuditTrailIntegrityTest.testAuditLogHashChainVerification` |

