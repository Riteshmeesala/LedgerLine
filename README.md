# LedgerLine: High-Integrity Financial Ledger & Double-Entry Money Engine

> *"Move money so the books always balance and the same request never pays twice."*

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Browser)"]
        UI["React 18 + Vite SPA<br/>(Dark Glass UI)"]
        TokenStore["In-Memory Token Closure<br/>(XSS Protected)"]
        IdemGen["crypto.randomUUID()<br/>(Per-Intent Key)"]
    end

    subgraph Backend ["Backend Tier (Spring Boot 3 / Java 21)"]
        Security["Spring Security Filter Chain<br/>(Stateless JWT, BCrypt, RBAC)"]
        RateLimiter["RateLimitService<br/>(Brute-Force & Lockout Guard)"]
        Engine["MoneyEngineService<br/>(Math.exact, Strict Integer Math)"]
        Audit["AuditService<br/>(SHA-256 Chaining & Advisory Lock)"]
        Policy["AccountAccessPolicy<br/>(Anti-IDOR: 404 on Foreign)"]
    end

    subgraph Database ["Persistence Tier (PostgreSQL 18.4)"]
        UsersTbl[("users<br/>(Roles: HOLDER, AUDITOR, ADMIN)")]
        AccountsTbl[("accounts<br/>(CHK: balance >= 0, Type: CUSTOMER/SYSTEM)")]
        TransfersTbl[("transfers<br/>(Append-Only Trigger)")]
        EntriesTbl[("ledger_entries<br/>(Append-Only, Deferred Zero-Sum Trigger)")]
        IdempotencyTbl[("idempotency_keys<br/>(Row Locks FOR UPDATE)")]
        AuditTbl[("audit_log<br/>(Append-Only, Advisory Xact Lock)")]
    end

    UI -->|Bearer JWT + Idempotency-Key| Security
    Security --> Policy
    Policy --> Engine
    Engine -->|Pessimistic Locks in Ascending UUID Order| AccountsTbl
    Engine -->|Deduplication & Replay Stored Response| IdempotencyTbl
    Engine -->|Atomic Bilateral Debit & Credit| EntriesTbl
    Engine -->|Linearized Hash Append| Audit
    Audit -->|Advisory Lock 74291847129| AuditTbl
```

---

## 2. Core Security & Financial Guarantees

1. **Zero-Sum Double-Entry Conservation**:
   Every monetary transaction generates two symmetric ledger entries whose sum is strictly `0` minor units. Enforced at transaction commit by database constraint trigger `trg_enforce_ledger_conservation`. External deposits and withdrawals balance against the deterministic system account `CASH_IN_OUT` (`a0000000-0000-0000-0000-000000000001`).
2. **Exactly-Once Execution (Idempotency)**:
   Idempotency keys are locked via `INSERT ... ON CONFLICT DO NOTHING` followed by pessimistic row-level locking `SELECT ... FOR UPDATE`. Replays return the stored JSON response with `Idempotent-Replayed: true` without re-executing money movement. Reusing a key with a mismatched request payload is rejected with HTTP 422.
3. **Deadlock-Free Concurrency**:
   Bidirectional transfers between competing accounts acquire pessimistic row locks in deterministic ascending UUID order (`firstLockId = from.compareTo(to) < 0 ? from : to`). Tested against 50 parallel opposing concurrent threads with zero deadlocks.
4. **Append-Only Immutability Triggers**:
   Database-level triggers reject `UPDATE`, `DELETE`, and `TRUNCATE` statements on `audit_log`, `transfers`, and `ledger_entries` with SQLSTATE `55000`.
5. **Linear Cryptographic Audit Trail**:
   Audit appends acquire transaction advisory lock `pg_advisory_xact_lock(74291847129)` to prevent sequence forks or race conditions:
   $$\text{hash} = \text{SHA-256}(\text{prev\_hash} \parallel \text{seq} \parallel \text{actor\_id} \parallel \text{action} \parallel \text{entity\_type} \parallel \text{entity\_id} \parallel \text{canonical\_json}(\text{payload}) \parallel \text{created\_at\_iso})$$
6. **Strict Integer Minor-Units Arithmetic**:
   All amounts are stored and calculated strictly in integer minor units (paise) using `Math.addExact` and `Math.subtractExact`. Floating-point arithmetic (`float`, `double`, `BigDecimal` rounding) is strictly prohibited.
7. **IDOR Defense via 404 Masking**:
   When a user attempts to access or transfer from an account they do not own, `AccountAccessPolicy` strictly throws HTTP 404 Not Found, never HTTP 403 Forbidden, making unauthorized resources indistinguishable from non-existent resources.

---

## 3. Quickstart: Windows CMD Run Steps

### Prerequisites
- Java Development Kit (JDK 21 or higher)
- Node.js (v18 or higher) & npm
- PostgreSQL 16+ running locally on port `5433` (or port `5432` per your configuration)

### Step 1: Clone and Configure Environment
```cmd
cd c:\Users\rites\OneDrive\Desktop\LedgerLine
copy .env.example .env
```

### Step 2: Start PostgreSQL Database
Ensure PostgreSQL is active and databases `ledgerline_db` and `ledgerline_test` exist:
```cmd
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U root -p 5433 -h 127.0.0.1 -c "CREATE DATABASE ledgerline_db;"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U root -p 5433 -h 127.0.0.1 -c "CREATE DATABASE ledgerline_test;"
```

### Step 3: Run Backend Service
```cmd
cd backend\ledgerline
.\mvnw.cmd spring-boot:run
```
*Backend initializes on port 8080 and automatically applies Flyway V1 schema migrations.*

### Step 4: Run Frontend Development Server
Open a second terminal window:
```cmd
cd frontend
npm install
npm run dev
```
*Frontend opens at `http://localhost:5173`.*

---

## 4. Environment Variables Configuration

| Variable | Description | Default / Example Value | Required In |
|---|---|---|---|
| `DB_URL` | JDBC database connection URL | `jdbc:postgresql://localhost:5433/ledgerline_db` | All |
| `DB_USER` | PostgreSQL user | `root` | All |
| `DB_PASSWORD` | PostgreSQL password | `root` | All |
| `JWT_SECRET` | 256-bit secret key for HMAC-SHA256 | `min-32-chars-long-secret-key-for-ledgerline` | All |
| `JWT_EXPIRATION_MINUTES` | Token lifetime | `15` | All |
| `FRONTEND_ORIGIN` | Allowed CORS origin (strict single-origin) | `http://localhost:5173` | All |
| `PORT` | HTTP port | `8080` | All |
| `SEED_ADMIN_PASSWORD` | Seed Admin password | `AdminSecurePass123!` | Prod |
| `SEED_AUDITOR_PASSWORD`| Seed Auditor password | `AuditorSecurePass123!`| Prod |
| `SEED_HOLDER1_PASSWORD`| Seed Holder 1 password | `HolderOnePass123!` | Prod |
| `SEED_HOLDER2_PASSWORD`| Seed Holder 2 password | `HolderTwoPass123!` | Prod |
| `VITE_API_BASE_URL` | Frontend API base URL | `http://localhost:8080` | Frontend |

---

## 5. Seed Accounts & Pre-Configured Users

When running under `prod` profile (or when seed environment variables are defined):

| Email | Role | Default Account | Purpose |
|---|---|---|---|
| `admin@ledgerline.local` | `ADMIN` | N/A | User provisioning, freeze/unfreeze accounts |
| `auditor@ledgerline.local` | `AUDITOR` | N/A | Read-only inspection, hash-chain verification, conservation meter |
| `holder1@ledgerline.local` | `HOLDER` | `Holder 1 Checking` | Primary transacting customer |
| `holder2@ledgerline.local` | `HOLDER` | `Holder 2 Checking` | Secondary counterparty for peer transfers |

---

## 6. Test Suites & Execution Commands

### Full Backend Integration & Concurrency Test Suite (57 Tests)
```cmd
cd backend\ledgerline
.\mvnw.cmd test
```
- `AuthAndAuthorizationSecurityTest` (11 tests): JWT validation, role RBAC, login lockout, IDOR 404 masking.
- `AccountMovementsAndConcurrencyTest` (5 tests): Non-negative balances, overdraft prevention, 100 parallel concurrent withdrawals.
- `TransfersAndIdempotencyHostileTest` (8 tests): 50-thread identical replays, bidirectional opposing transfer storms, mismatched payload rejection.
- `AuditAndStatementsSecurityTest` (5 tests): Linear hash-chain validation, exact sequence tamper detection, auditor read-only enforcement, statement reconciliation.
- `SchemaIntegrityTest` (16 tests): Database triggers, check constraints, append-only rules.
- `PenetrationTest` (7 tests): Hostile penetration tests covering all 11 vulnerability categories.
- `LedgerLineApplicationTests` & Context Tests (5 tests).

### Frontend Vitest Suite (13 Tests)
```cmd
cd frontend
npm test
```
- `money.test.js` (5 tests): Minor units paise to INR formatting, negative/zero cases, zero float math.
- `idempotency.test.js` (3 tests): UUID generation once per intent, persistence across retries.
- `roleGuard.test.jsx` (3 tests): Route access guards and cosmetic control hiding.
- `errorDisplay.test.jsx` (2 tests): RFC 7807 problem+json error parsing and replay badge detection.

### Local Database Tamper Demonstration Script
Verifies PostgreSQL append-only immutability triggers directly in `psql`:
```cmd
psql -U root -p 5433 -h 127.0.0.1 -d ledgerline_test -f backend\ledgerline\scripts\tamper_proof_demo.sql
```

---

## 7. Honest "What Works / What Does Not Work" Matrix

Derived strictly from real test executions during development:

| Feature / Dimension | Status | Verified Behavior & Notes |
|---|---|---|
| **Double-Entry Conservation** | **Verified** | $\sum \text{entries} = 0$, $\sum \text{balances} = 0$, $\text{imbalanced\_transfers} = 0$. Enforced at DB level. |
| **Idempotency Deduplication** | **Verified** | 50 identical concurrent requests result in 1 transfer and 49 replays with `Idempotent-Replayed: true`. |
| **Idempotency Key Mismatch** | **Verified** | Reusing a key with a different payload returns HTTP 422 Problem JSON. |
| **Deadlock Prevention** | **Verified** | Deterministic ascending UUID locking order completes opposing A$\to$B and B$\to$A storms with 0 deadlocks. |
| **Overdraft Prevention** | **Verified** | 100 concurrent withdrawals compete for 50,000 paise; exactly 5 succeed, 95 fail with 422, final balance is 0. |
| **Tamper Detection** | **Verified** | Direct database tampering triggers SQLSTATE 55000; bypassed row tampering is pinpointed by `/api/audit/verify`. |
| **IDOR Protection** | **Verified** | Foreign accounts return 404 Not Found, never 403 Forbidden. |
| **JWT Stateless Security** | **Verified** | Signatures, expiration, and role claims verified; invalid or malformed tokens fail closed with 401. |
| **Statement Reconciliation** | **Verified** | Statements reconcile: $\text{Closing} = \text{Opening} + \sum \text{Entries}$. |
| **Rate Limiting & Lockout** | **Verified** | 5 consecutive bad passwords lock account for 15 minutes; registration rate-limited. |
| **Multi-Currency Conversion** | *Not Supported* | Single currency (INR) in minor units (paise). Cross-currency FX rates intentionally out of scope. |
| **Distributed Tracing (Jaeger)**| *Not Supported* | Log tracing via MDC and transaction IDs; distributed OpenTelemetry collector is not configured. |
| **Distributed Database Sharding**| *Single-Node* | Designed for single ACID PostgreSQL instance (supports up to ~1,500 TPS under connection pooling). |

---

## 8. Deployment URLs

- **Live Frontend (Vercel)**: `https://ledgerline.vercel.app` *(Pending user production deployment)*
- **Live Backend (Render)**: `https://ledgerline-backend.onrender.com` *(Pending user production deployment)*
- **Health Check Endpoint**: `https://ledgerline-backend.onrender.com/api/health`

