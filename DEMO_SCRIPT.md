# LedgerLine — Evaluation Presentation & Demo Script (DEMO_SCRIPT.md)

**Target Duration**: 5 to 7 Minutes  
**Audience**: Technical Evaluators, Architects, Security Reviewers  
**Theme**: *"Move money so the books always balance and the same request never pays twice."*

---

## Preparation Checklist Before Starting

1. **Backend Running**: `.\mvnw.cmd spring-boot:run` on `http://localhost:8080`.
2. **Frontend Running**: `npm run dev` on `http://localhost:5173`.
3. **Database Active**: PostgreSQL 18.4 with migrations applied.
4. **Browser Windows**:
   - Window 1: Holder Dashboard (`holder1@ledgerline.local` / `HolderOnePass123!`)
   - Window 2 (Incognito): Auditor Dashboard (`auditor@ledgerline.local` / `AuditorSecurePass123!`)
   - Window 3: Terminal ready for `curl` and `psql` demonstration.

---

## Detailed Minute-by-Minute Walkthrough

### [0:00 – 1:00] Introduction & Core Architecture

**Action**:
Display the LedgerLine landing screen in dark-glass UI. Point out the zero-trust banner.

**Spoken Script**:
> "Good morning. This is LedgerLine — a high-integrity double-entry financial ledger and money engine built from the ground up to solve two fundamental risks in payment engineering: balance drift and duplicate execution.
>
> In LedgerLine, money is never stored as floating-point decimals. Every calculation is performed in integer minor units (paise) using Java's `Math.addExact` and `Math.subtractExact`.
>
> On the client side, our React 18 interface stores the JWT strictly in an in-memory closure — never in `localStorage` or `sessionStorage` — neutralizing persistent XSS token theft. Every monetary submission automatically generates a fresh `crypto.randomUUID()` as an `Idempotency-Key` that is locked and tracked in the database before execution."

---

### [1:00 – 2:15] Security Baseline & Anti-Enumeration Lockout

**Action**:
1. Open the Login screen.
2. Enter `holder1@ledgerline.local` and deliberately enter an incorrect password 5 times in succession.
3. Observe the lockout message.

**Spoken Script**:
> "Let's first test our authentication and brute-force defenses. I'll attempt to log in as Holder 1 with an incorrect password.
>
> Notice that failed attempts return a constant-time generic HTTP 401 Problem Details with 'Invalid credentials' — completely preventing user enumeration.
>
> On the 5th consecutive failed attempt, the application locks the account for 15 minutes. Even if an attacker now guesses the correct password, access is denied with a clear lockout message.
>
> Now, let's log in with valid credentials and proceed into the Holder Dashboard."

---

### [2:15 – 3:30] Exactly-Once Money Engine & Idempotency Demo

**Action**:
1. Log in as `holder1@ledgerline.local`.
2. Deposit ₹2,500 (250,000 paise). Show balance updating from ₹0 to ₹2,500.00.
3. Open the Transfer panel: transfer ₹500.00 to Holder 2 (`c2000000-0000-0000-0000-000000000002`).
4. Show the transfer confirmation card displaying the generated `Idempotency-Key` UUID.
5. Click the **"Retry same request"** button to resend the exact same `Idempotency-Key`.
6. Highlight the neon badge: **"Replayed, no double charge"** (`Idempotent-Replayed: true`).
7. Point out that the balance remains exactly ₹2,000.00 — zero double charge.

**Spoken Script**:
> "Here on the Holder Dashboard, I deposit ₹2,500. Under the hood, this generates two symmetric double-entry rows: debiting the central `CASH_IN_OUT` clearing account and crediting Holder 1.
>
> Now I execute a peer-to-peer transfer of ₹500 to Holder 2.
>
> Notice this UUID displayed on screen: `d8a2...`. That is our unique `Idempotency-Key`. To simulate a mobile network drop or aggressive client retry, I click 'Retry same request' with the exact same key.
>
> Look at the response: a neon badge appears stating 'Replayed, no double charge'. The server returned `Idempotent-Replayed: true` and the cached response from our pessimistic idempotency lock. The recipient was NOT paid a second time, and the sender's balance was NOT deducted again."

---

### [3:30 – 4:30] Statement Reconciliation & The Conservation Meter

**Action**:
1. Switch to the **Statements** view for Holder 1.
2. Point out the bottom reconciliation line: `Closing Balance = Opening Balance + Sum of Entries` with green checkmark.
3. Switch to the Incognito window logged in as `auditor@ledgerline.local`.
4. Open the **Conservation Meter**.

**Spoken Script**:
> "Let's examine the accounting books. Under the Statement view, every ledger debit and credit is displayed with timestamp and direction. Notice the reconciliation line: our closing balance is mathematically validated against the opening balance plus the sum of all entries.
>
> Now I switch to our Auditor window. Notice that all write controls — deposits, withdrawals, transfers — are completely removed from the UI. But as our codebase comments state: hiding controls is cosmetic. The real security boundary is Spring Security's `@PreAuthorize` default-deny.
>
> On the Auditor Dashboard, look at the **Conservation Meter**. It queries `/api/ledger/conservation`. The sum of all entries in the entire system is strictly `0`. The sum of all balances across customer and system accounts is strictly `0`. The count of imbalanced transfers is `0`. The conservation ring is solid green."

---

### [4:30 – 5:45] Cryptographic Hash-Chain & Tamper-Proof Triggers

**Action**:
1. In the Auditor Dashboard, scroll to the **Hash-Chain Visualizer**.
2. Click the **"Verify Chain"** button. The chain validates and glows neon green.
3. Switch to Terminal and run the local tamper demo script:
   ```cmd
   psql -U root -p 5433 -h 127.0.0.1 -d ledgerline_test -f backend\ledgerline\scripts\tamper_proof_demo.sql
   ```
4. Show the terminal output raising SQLSTATE `55000` (tampering rejected).

**Spoken Script**:
> "Now let's verify our cryptographic audit trail. Every single state change is recorded in `audit_log` with an SHA-256 hash chaining back to the genesis block of 64 zeros. Every append acquires a PostgreSQL transaction advisory lock `pg_advisory_xact_lock(74291847129)` to guarantee strict linearity.
>
> I click 'Verify Chain'. The server walks all blocks from block 1 to tip, verifying every SHA-256 hash. The result: 'valid: true'.
>
> What happens if a malicious insider with direct database access attempts an `UPDATE` or `DELETE` on the ledger or audit log? Let's run our tamper demonstration script in `psql`.
>
> As you can see on the terminal, PostgreSQL immediately aborts the transaction with SQLSTATE 55000: 'Table audit_log is strictly append-only'. The database enforces immutability at the engine level."

---

### [5:45 – 7:00] Penetration Test Review & Concluding Defense

**Action**:
1. Switch to terminal and show the results of `.\mvnw.cmd test` (57 tests passing) and `npm test` (13 tests passing).
2. Conclude the presentation.

**Spoken Script**:
> "To prove these guarantees under real-world hostility, Phase G subjected LedgerLine to a comprehensive penetration test suite covering 11 vulnerability categories:
> - IDOR via 404 masking
> - High-concurrency race condition testing (100 parallel threads competing for 500 minor units)
> - Deadlock-free bidirectional transfer storms across 50 competing threads
> - Alg:none and forged JWT rejection
> - Privilege escalation and role tampering defense
>
> Across 57 backend integration tests and 13 frontend tests, 100% of tests pass with 0 failures and 0 errors.
>
> Thank you. I am now ready for any technical questions or architectural deep-dives."

---

## Quick Q&A Cheat Sheet

| Question | Answer Summary |
|---|---|
| *Why deterministic ascending UUID locks?* | If Thread 1 locks A then B, and Thread 2 locks B then A, a deadlock occurs. Ordering locks by UUID ensures all threads acquire locks in the exact same order, mathematically eliminating deadlocks. |
| *Why in-memory token storage?* | Tokens in `localStorage` or `sessionStorage` are vulnerable to persistent XSS theft. Storing the token in a JavaScript variable closure guarantees it cannot be extracted by malicious third-party scripts. |
| *Why 404 instead of 403 on IDOR?* | Returning 403 Forbidden confirms to an attacker that the targeted account ID exists. Returning 404 Not Found makes foreign accounts indistinguishable from non-existent accounts. |

