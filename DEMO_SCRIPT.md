# LedgerLine — 3-Minute Verification Demo Script (DEMO_SCRIPT.md)

**Target Duration**: Exactly 3 Minutes  
**Audience**: Technical Evaluators, Architects, Security Reviewers  
**Theme**: *"Move money so the books always balance and the same request never pays twice."*

---

## Pre-Demo Setup Checklist (30 seconds before start)

1. **Backend Running**: Spring Boot active on `http://localhost:8080`.
2. **Frontend Running**: React 18 SPA active on `http://localhost:5173`.
3. **Database Running**: PostgreSQL running on port `5433` (databases `ledgerline_db` and `ledgerline_test`).
4. **Browser Windows**:
   - Window 1: Customer Holder (`http://localhost:5173`)
   - Window 2: Auditor (`http://localhost:5173` in Incognito window)
   - Window 3: Terminal open to repo root for `tamper_proof_demo.sql`.

---

## 3-Minute Walkthrough Timeline

### [0:00 – 0:40] 1. Anti-Brute-Force Login Lockout & Authentication
- **Action**:
  1. Open Login page at `http://localhost:5173`.
  2. Enter `holder1@ledgerline.local` with an incorrect password 5 consecutive times.
  3. Point to the generic `Invalid credentials` error (anti-enumeration). On the 5th attempt, show the account lockout banner.
  4. Refresh and log in with valid credentials (`holder1@ledgerline.local` / `<your-holder1-password>`).
- **Spoken Script**:
  > *"LedgerLine enforces security from the perimeter. Five failed login attempts immediately trigger a 15-minute account lockout, returning constant-time generic 401 Problem Details to eliminate username enumeration. Now let's log in with valid credentials."*

---

### [0:40 – 1:20] 2. Deposit, Peer Transfer & Idempotent Replay Badge
- **Action**:
  1. Click **Deposit**, enter ₹1,000.00 (`100000` minor units). Balance updates immediately to ₹1,000.00.
  2. Click **Transfer**, select Holder 2, enter ₹250.00 (`25000` minor units), and submit.
  3. Point to the returned transaction and its unique `Idempotency-Key` UUID.
  4. Click the **"Retry same request"** button to simulate a network retry with the identical key.
  5. Point to the neon badge: **"Replayed, no double charge"** (`Idempotent-Replayed: true`).
  6. Point out the balance remains exactly ₹750.00 — zero money deducted on replay.
- **Spoken Script**:
  > *"All monetary math uses strict 64-bit integer minor units — paise — with `Math.addExact` and `Math.subtractExact`. Here we deposit ₹1,000, then transfer ₹250 to Holder 2.
  > If a network timeout occurs and the client retries with the exact same `Idempotency-Key`, our server detects the row-locked key and returns the cached response with the `Idempotent-Replayed: true` header. Notice the neon badge: the operation was not executed twice."*

---

### [1:20 – 2:05] 3. Statement Reconciliation & Auditor Conservation Meter
- **Action**:
  1. In the Holder dashboard, open the **Statements** tab.
  2. Highlight the mathematical reconciliation formula at the bottom:
     $$\text{Closing Balance} = \text{Opening Balance} + \sum \text{Entries}$$
     Showing green checkmark: `reconciled: true`.
  3. Switch to Window 2 (Incognito) logged in as `auditor@ledgerline.local`.
  4. Note that all write buttons (deposit, transfer) are hidden in UI and blocked by `@PreAuthorize` on the server.
  5. Point to the **Conservation Meter**:
     - Sum of all entries: `0`
     - Sum of all balances: `0`
     - Imbalanced transfers: `0`
     - Status: `healthy: true` (Solid Green).
- **Spoken Script**:
  > *"In the customer statement, opening balance plus the sum of all debits and credits strictly equals the closing balance.
  > Switching to the Auditor view, all write endpoints are rejected with 403 Forbidden. On the Auditor dashboard, the Conservation Meter queries `/api/ledger/conservation`. The sum of all ledger entries across the entire database is strictly zero, and all account balances balance against clearing account `CASH_IN_OUT`."*

---

### [2:05 – 2:45] 4. SHA-256 Hash-Chain Verification & Immutability Triggers
- **Action**:
  1. On the Auditor dashboard, scroll to the **Hash-Chain Visualizer**.
  2. Click **"Verify Chain"**. Show the verification response: `valid: true`, `firstBrokenSeq: null`.
  3. Switch to Terminal (Window 3) and execute the tamper demonstration script:
     ```cmd
     psql -U root -p 5433 -h 127.0.0.1 -d ledgerline_test -f backend\ledgerline\scripts\tamper_proof_demo.sql
     ```
  4. Point to PostgreSQL rejecting the `UPDATE` and `DELETE` attempts with SQLSTATE `55000` (append-only trigger).
- **Spoken Script**:
  > *"Every audit log entry is linked in a linear SHA-256 hash chain serialized via database advisory lock `pg_advisory_xact_lock`. Clicking 'Verify Chain' recalculates all hashes from genesis, confirming zero tampering.
  > Even if an insider with direct database access attempts an `UPDATE` or `DELETE`, PostgreSQL engine triggers immediately abort the query with SQLSTATE 55000. Immutability is enforced at the database level."*

---

### [2:45 – 3:00] 5. Automated Attack Suite Verification (0 Failures) & Closing
- **Action**:
  1. Show terminal output of the automated hostile attack suite:
     ```cmd
     powershell.exe -ExecutionPolicy Bypass -File scripts\attack\attack_suite.ps1
     ```
  2. Highlight: **TOTAL PASSED: 39, TOTAL FAILED: 0**.
- **Spoken Script**:
  > *"Every security guarantee is verified by our automated hostile penetration suite: IDOR masking, JWT tamper rejection, 50-thread concurrent overdraw protection, opposing transfer storms, and 64KB payload caps. All 39 hostile attack vectors pass with zero failures. Thank you."*

---

## Quick Q&A Reference (Evaluation Defense)

| Question | Answer |
|---|---|
| **Why deterministic ascending UUID locks?** | Thread 1 transferring A→B and Thread 2 transferring B→A acquire locks in identical UUID order ($\min(A,B)$, then $\max(A,B)$), eliminating cyclic lock waits and deadlocks. |
| **Why in-memory JWT storage?** | Tokens in `localStorage` or `sessionStorage` are accessible to XSS attacks. Storing tokens strictly in memory closures neutralizes persistent token theft. |
| **Why HTTP 404 instead of 403 on foreign accounts?** | Returning 403 Forbidden confirms the existence of a target account. Returning 404 Not Found masks foreign accounts as indistinguishable from non-existent accounts. |
