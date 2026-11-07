# LedgerLine — API Reference & Concrete cURL Manual (API.md)

This document provides production-ready, copy-pasteable `curl` commands for all 15 endpoints exposed by LedgerLine.

---

## Global Headers & Standards

- **Base URL**: `http://localhost:8080` (or `https://ledgerline-backend.onrender.com`)
- **Authentication**: `Authorization: Bearer <JWT_TOKEN>` (stateless HMAC-SHA256)
- **Content Type**: `Content-Type: application/json`
- **Error Standard**: RFC 7807 Problem Details (`application/problem+json`)
- **Idempotency Key**: `Idempotency-Key: <UUID>` (generated once per user intent, reused on retries)
- **Monetary Representation**: Strictly integer minor units (paise; ₹1.00 = `100`).

---

## 1. Authentication Endpoints

### 1.1 Register New Account (`POST /api/auth/register`)
Unconditionally creates an account with role `HOLDER`. Any client-supplied role is ignored.

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "fullName": "Alice Johnson"
  }'
```

**Response (HTTP 201 Created)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "c56a4180-65aa-42ec-a945-5fd21dec0538",
  "email": "user@example.com",
  "role": "HOLDER"
}
```

---

### 1.2 User Login (`POST /api/auth/login`)
Returns a signed JWT. Locks account for 15 minutes after 5 consecutive failed attempts.

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "holder1@ledgerline.local",
    "password": "HolderOnePass123!"
  }'
```

**Response (HTTP 200 OK)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "11111111-1111-1111-1111-111111111111",
  "email": "holder1@ledgerline.local",
  "role": "HOLDER"
}
```

---

### 1.3 Get Current User (`GET /api/me`)
Retrieves authenticated user profile from token claims and database verification.

```bash
curl -X GET http://localhost:8080/api/me \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "email": "holder1@ledgerline.local",
  "role": "HOLDER",
  "enabled": true
}
```

---

## 2. Account Management Endpoints

### 2.1 List Accounts (`GET /api/accounts`)
Returns accounts owned by authenticated HOLDER, or all accounts for ADMIN / AUDITOR.

```bash
curl -X GET http://localhost:8080/api/accounts \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
[
  {
    "id": "c1000000-0000-0000-0000-000000000001",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "type": "CUSTOMER",
    "name": "Holder 1 Checking",
    "balance": 150000,
    "status": "ACTIVE",
    "createdAt": "2026-11-07T12:00:00Z"
  }
]
```

---

### 2.2 Create Account (`POST /api/accounts`)
Creates a new customer checking/savings account owned by the authenticated user.

```bash
curl -X POST http://localhost:8080/api/accounts \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Savings Account"
  }'
```

**Response (HTTP 201 Created)**:
```json
{
  "id": "8d3e2189-9831-4c74-a690-e2cb4a48509c",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "type": "CUSTOMER",
  "name": "My Savings Account",
  "balance": 0,
  "status": "ACTIVE",
  "createdAt": "2026-11-07T12:30:00Z"
}
```

---

### 2.3 Get Account by ID (`GET /api/accounts/{id}`)
Fetches account details. Masked with HTTP 404 Not Found if user is not the owner (anti-IDOR).

```bash
curl -X GET http://localhost:8080/api/accounts/c1000000-0000-0000-0000-000000000001 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "id": "c1000000-0000-0000-0000-000000000001",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "type": "CUSTOMER",
  "name": "Holder 1 Checking",
  "balance": 150000,
  "status": "ACTIVE",
  "createdAt": "2026-11-07T12:00:00Z"
}
```

---

## 3. Money Movement Endpoints

### 3.1 External Deposit (`POST /api/accounts/{id}/deposits`)
Credits customer account and symmetrically debits `CASH_IN_OUT` system account.

```bash
curl -X POST http://localhost:8080/api/accounts/c1000000-0000-0000-0000-000000000001/deposits \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: e8c67926-2bb4-4cf5-9610-ea04803db2ec" \
  -H "Content-Type: application/json" \
  -d '{
    "amountMinor": 250000
  }'
```

**Response (HTTP 200 OK)**:
```json
{
  "transferId": "48b28f74-d4b7-4977-b8db-4e78ea9df4cb",
  "sourceAccountId": "a0000000-0000-0000-0000-000000000001",
  "destinationAccountId": "c1000000-0000-0000-0000-000000000001",
  "amountMinor": 250000,
  "type": "DEPOSIT",
  "status": "COMPLETED",
  "createdAt": "2026-11-07T12:35:10.123Z",
  "replayed": false
}
```

---

### 3.2 External Withdrawal (`POST /api/accounts/{id}/withdrawals`)
Debits customer account and symmetrically credits `CASH_IN_OUT` system account. Rejects overdrafts.

```bash
curl -X POST http://localhost:8080/api/accounts/c1000000-0000-0000-0000-000000000001/withdrawals \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: f9a78120-1bb3-4ef5-8910-fa04803db3aa" \
  -H "Content-Type: application/json" \
  -d '{
    "amountMinor": 50000
  }'
```

**Response (HTTP 200 OK)**:
```json
{
  "transferId": "87c38f12-e4b7-4977-b8db-5e78ea9df5ef",
  "sourceAccountId": "c1000000-0000-0000-0000-000000000001",
  "destinationAccountId": "a0000000-0000-0000-0000-000000000001",
  "amountMinor": 50000,
  "type": "WITHDRAWAL",
  "status": "COMPLETED",
  "createdAt": "2026-11-07T12:36:12.456Z",
  "replayed": false
}
```

---

### 3.3 Peer-to-Peer Transfer (`POST /api/transfers`)
Transfers funds between two customer accounts. Acquires row locks in ascending UUID order to prevent deadlocks.

```bash
curl -X POST http://localhost:8080/api/transfers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: 7a57fa75-43a9-46e3-a604-5fca3b3df0bb" \
  -H "Content-Type: application/json" \
  -d '{
    "fromAccountId": "c1000000-0000-0000-0000-000000000001",
    "toAccountId": "c2000000-0000-0000-0000-000000000002",
    "amountMinor": 10000
  }'
```

**Response (HTTP 200 OK)**:
```json
{
  "transferId": "91d38f12-e4b7-4977-b8db-5e78ea9df511",
  "sourceAccountId": "c1000000-0000-0000-0000-000000000001",
  "destinationAccountId": "c2000000-0000-0000-0000-000000000002",
  "amountMinor": 10000,
  "type": "TRANSFER",
  "status": "COMPLETED",
  "createdAt": "2026-11-07T12:37:00.789Z",
  "replayed": false
}
```

**Replay Response (when sending identical `Idempotency-Key`)**:
*Notice header `Idempotent-Replayed: true` and identical body.*
```http
HTTP/1.1 200 OK
Idempotent-Replayed: true
Content-Type: application/json

{
  "transferId": "91d38f12-e4b7-4977-b8db-5e78ea9df511",
  "sourceAccountId": "c1000000-0000-0000-0000-000000000001",
  "destinationAccountId": "c2000000-0000-0000-0000-000000000002",
  "amountMinor": 10000,
  "type": "TRANSFER",
  "status": "COMPLETED",
  "createdAt": "2026-11-07T12:37:00.789Z",
  "replayed": true
}
```

---

## 4. Statements & Ledger Verification

### 4.1 Account Statement (`GET /api/accounts/{id}/statement`)
Returns paginated ledger entries, opening balance, closing balance, and mathematical reconciliation (`reconciled = true`).

```bash
curl -X GET "http://localhost:8080/api/accounts/c1000000-0000-0000-0000-000000000001/statement?from=2026-11-01T00:00:00Z&to=2026-11-07T23:59:59Z&page=0&size=20" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "accountId": "c1000000-0000-0000-0000-000000000001",
  "openingBalance": 0,
  "closingBalance": 190000,
  "entriesSum": 190000,
  "reconciled": true,
  "entries": [
    {
      "entryId": "b1000000-0000-0000-0000-000000000001",
      "transferId": "48b28f74-d4b7-4977-b8db-4e78ea9df4cb",
      "amountMinor": 250000,
      "direction": "CREDIT",
      "createdAt": "2026-11-07T12:35:10.123Z"
    },
    {
      "entryId": "b1000000-0000-0000-0000-000000000002",
      "transferId": "87c38f12-e4b7-4977-b8db-5e78ea9df5ef",
      "amountMinor": 50000,
      "direction": "DEBIT",
      "createdAt": "2026-11-07T12:36:12.456Z"
    },
    {
      "entryId": "b1000000-0000-0000-0000-000000000003",
      "transferId": "91d38f12-e4b7-4977-b8db-5e78ea9df511",
      "amountMinor": 10000,
      "direction": "DEBIT",
      "createdAt": "2026-11-07T12:37:00.789Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 3,
  "totalPages": 1
}
```

---

### 4.2 Conservation Verification (`GET /api/ledger/conservation`)
Verifies system-wide mathematical equilibrium across all ledger entries and account balances (`AUDITOR` or `ADMIN`).

```bash
curl -X GET http://localhost:8080/api/ledger/conservation \
  -H "Authorization: Bearer <AUDITOR_TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "sumOfEntries": 0,
  "sumOfBalances": 0,
  "imbalancedTransfersCount": 0,
  "conserved": true
}
```

---

## 5. Audit Trail & Cryptographic Verification

### 5.1 List Audit Log (`GET /api/audit`)
Retrieves paginated audit log entries with SHA-256 block hashes (`AUDITOR` or `ADMIN`).

```bash
curl -X GET "http://localhost:8080/api/audit?page=0&size=20" \
  -H "Authorization: Bearer <AUDITOR_TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "content": [
    {
      "seq": 1,
      "actorId": "11111111-1111-1111-1111-111111111111",
      "action": "DEPOSIT",
      "entityType": "TRANSFER",
      "entityId": "48b28f74-d4b7-4977-b8db-4e78ea9df4cb",
      "payload": "{\"amountMinor\":250000,\"fromAccountId\":\"a0000000-0000-0000-0000-000000000001\",\"toAccountId\":\"c1000000-0000-0000-0000-000000000001\"}",
      "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "createdAt": "2026-11-07T12:35:10.123Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

---

### 5.2 Verify Cryptographic Hash Chain (`GET /api/audit/verify`)
Re-computes and walks the entire SHA-256 chain from genesis block to tip. Reports broken sequence if tampered.

```bash
curl -X GET http://localhost:8080/api/audit/verify \
  -H "Authorization: Bearer <AUDITOR_TOKEN>"
```

**Response (Valid Chain)**:
```json
{
  "valid": true,
  "checkedRows": 42,
  "firstBrokenSeq": null
}
```

**Response (Tampered Chain)**:
```json
{
  "valid": false,
  "checkedRows": 42,
  "firstBrokenSeq": 17
}
```

---

## 6. Administrative Operations

### 6.1 Provision User (`POST /api/admin/users`)
Enables an administrator to create users with any designated role (`HOLDER`, `AUDITOR`, `ADMIN`).

```bash
curl -X POST http://localhost:8080/api/admin/users \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newauditor@ledgerline.local",
    "password": "TemporarySecurePass123!",
    "role": "AUDITOR"
  }'
```

**Response (HTTP 201 Created)**:
```json
{
  "id": "e45a2100-34fa-42ec-a945-5fd21dec0599",
  "email": "newauditor@ledgerline.local",
  "role": "AUDITOR",
  "enabled": true
}
```

---

### 6.2 Freeze Account (`POST /api/admin/accounts/{id}/freeze`)
Prevents all subsequent debits or credits on the specified account.

```bash
curl -X POST http://localhost:8080/api/admin/accounts/c1000000-0000-0000-0000-000000000001/freeze \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "id": "c1000000-0000-0000-0000-000000000001",
  "status": "FROZEN"
}
```

---

### 6.3 Unfreeze Account (`POST /api/admin/accounts/{id}/unfreeze`)
Restores an account to active status.

```bash
curl -X POST http://localhost:8080/api/admin/accounts/c1000000-0000-0000-0000-000000000001/unfreeze \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Response (HTTP 200 OK)**:
```json
{
  "id": "c1000000-0000-0000-0000-000000000001",
  "status": "ACTIVE"
}
```

---

## 7. Health & Monitoring

### 7.1 System Health (`GET /api/health`)
Unauthenticated endpoint for load balancer, Docker, and Render orchestration health checks.

```bash
curl -X GET http://localhost:8080/api/health
```

**Response (HTTP 200 OK)**:
```json
{
  "status": "UP",
  "timestamp": "2026-11-07T12:45:00.123Z"
}
```

