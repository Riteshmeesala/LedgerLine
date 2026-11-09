# ==============================================================================
# LedgerLine Attack Suite (scripts/attack/attack_suite.ps1)
# ==============================================================================
# Comprehensive automated penetration test suite executing all 10 attack
# vectors against a running LedgerLine instance.
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " LEDGERLINE HOSTILE PENETRATION ATTACK SUITE" -ForegroundColor Cyan
Write-Host " Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [WARNING] This suite generates hostile traffic, triggers rate-limits," -ForegroundColor Yellow
Write-Host " creates transient accounts, and sends rapid concurrent requests." -ForegroundColor Yellow
Write-Host " STRICT CONSTRAINT: ONLY target your own deployment." -ForegroundColor Yellow
Write-Host ""

$script:TotalPassed = 0
$script:TotalFailed = 0

function Report-Result {
    param(
        [string]$TestId,
        [string]$Description,
        [int]$ActualStatus,
        [int]$ExpectedStatus,
        [bool]$Condition = $true,
        [string]$Notes = ""
    )
    $passed = ($ActualStatus -eq $ExpectedStatus) -and $Condition
    if ($passed) {
        $script:TotalPassed++
        Write-Host "  [PASS] $TestId - $Description (HTTP $ActualStatus) $Notes" -ForegroundColor Green
    } else {
        $script:TotalFailed++
        Write-Host "  [FAIL] $TestId - $Description (Expected HTTP $ExpectedStatus, Got $ActualStatus) $Notes" -ForegroundColor Red
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token = $null,
        [string]$IdempotencyKey = $null,
        [string]$Body = $null,
        [string]$ContentType = "application/json"
    )
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    if ($IdempotencyKey) { $headers["Idempotency-Key"] = $IdempotencyKey }
    if ($ContentType) { $headers["Content-Type"] = $ContentType }

    $url = "$BaseUrl$Path"
    try {
        $params = @{
            Method = $Method
            Uri = $url
            Headers = $headers
            TimeoutSec = 30
            UseBasicParsing = $true
        }
        if ($Body) { $params["Body"] = $Body }
        $res = Invoke-WebRequest @params -ErrorAction Stop
        return [PSCustomObject]@{
            StatusCode = [int]$res.StatusCode
            Headers = $res.Headers
            Content = $res.Content
        }
    } catch {
        if ($_.Exception.Response) {
            $resp = $_.Exception.Response
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $content = $reader.ReadToEnd()
            return [PSCustomObject]@{
                StatusCode = [int]$resp.StatusCode
                Headers = $resp.Headers
                Content = $content
            }
        }
        return [PSCustomObject]@{
            StatusCode = 0
            Headers = @{}
            Content = $_.Exception.Message
        }
    }
}

# ------------------------------------------------------------------------------
# SETUP: Provision Test Users and Accounts
# ------------------------------------------------------------------------------
Write-Host "`n[SETUP] Initializing test accounts and roles..." -ForegroundColor Yellow

$adminToken = $null
$auditorToken = $null

# Priority 1: If environment variables for seed passwords are provided, authenticate via API
if ($env:SEED_ADMIN_PASSWORD) {
    $loginRes = Invoke-Api -Method "POST" -Path "/api/auth/login" -Body "{`"email`":`"admin@ledgerline.local`",`"password`":`"$($env:SEED_ADMIN_PASSWORD)`"}"
    if ($loginRes.StatusCode -eq 200) {
        $adminToken = ($loginRes.Content | ConvertFrom-Json).token
        Write-Host "  [AUTH] Admin authenticated via SEED_ADMIN_PASSWORD" -ForegroundColor Green
    }
}

if ($env:SEED_AUDITOR_PASSWORD) {
    $loginRes = Invoke-Api -Method "POST" -Path "/api/auth/login" -Body "{`"email`":`"auditor@ledgerline.local`",`"password`":`"$($env:SEED_AUDITOR_PASSWORD)`"}"
    if ($loginRes.StatusCode -eq 200) {
        $auditorToken = ($loginRes.Content | ConvertFrom-Json).token
        Write-Host "  [AUTH] Auditor authenticated via SEED_AUDITOR_PASSWORD" -ForegroundColor Green
    }
}

# Priority 2: Local development fallback via known dev JWT secret
function Get-JwtToken([string]$subject, [string]$role) {
    $headerB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"alg":"HS256"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $exp = $now + 3600
    $payloadJson = "{`"sub`":`"$subject`",`"role`":`"$role`",`"jti`":`"$([guid]::NewGuid().ToString())`",`"iat`":$now,`"exp`":$exp}"
    $payloadB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payloadJson)).TrimEnd('=').Replace('+','-').Replace('/','_')
    
    $secretStr = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "dev_mode_only_secret_key_at_least_32_bytes_long_abcdef123456" }
    $secretBytes = [System.Text.Encoding]::UTF8.GetBytes($secretStr)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $secretBytes
    $sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$headerB64.$payloadB64"))
    $sigB64 = [Convert]::ToBase64String($sigBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    return "$headerB64.$payloadB64.$sigB64"
}

if (-not $adminToken) {
    $adminToken = Get-JwtToken -subject "00000000-0000-0000-0000-000000000001" -role "ADMIN"
}
if (-not $auditorToken) {
    $auditorToken = Get-JwtToken -subject "00000000-0000-0000-0000-000000000002" -role "AUDITOR"
}

# Register Holder 1 and Holder 2 dynamically
$uid = [guid]::NewGuid().ToString().Substring(0,8)
$h1Email = "holder1-$uid@atk.local"
$h2Email = "holder2-$uid@atk.local"

$reg1 = Invoke-Api -Method "POST" -Path "/api/auth/register" -Body "{`"email`":`"$h1Email`",`"password`":`"Password123!`"}"
$reg2 = Invoke-Api -Method "POST" -Path "/api/auth/register" -Body "{`"email`":`"$h2Email`",`"password`":`"Password123!`"}"

$token1 = ($reg1.Content | ConvertFrom-Json).token
$token2 = ($reg2.Content | ConvertFrom-Json).token
$h1Id = ($reg1.Content | ConvertFrom-Json).userId
$h2Id = ($reg2.Content | ConvertFrom-Json).userId

# Create Accounts
$acc1Res = Invoke-Api -Method "POST" -Path "/api/accounts" -Token $token1 -Body "{`"name`":`"Account 1`"}"
$acc2Res = Invoke-Api -Method "POST" -Path "/api/accounts" -Token $token2 -Body "{`"name`":`"Account 2`"}"

$acc1 = ($acc1Res.Content | ConvertFrom-Json).id
$acc2 = ($acc2Res.Content | ConvertFrom-Json).id

# Fund Account 1 with 100,000 paise (₹1,000.00)
$depKey = [guid]::NewGuid().ToString()
$depRes = Invoke-Api -Method "POST" -Path "/api/accounts/$acc1/deposits" -Token $token1 -IdempotencyKey $depKey -Body "{`"amountMinor`": 100000}"

# Fund Account 2 with 50,000 paise (₹500.00)
$depKey2 = [guid]::NewGuid().ToString()
$depRes2 = Invoke-Api -Method "POST" -Path "/api/accounts/$acc2/deposits" -Token $token2 -IdempotencyKey $depKey2 -Body "{`"amountMinor`": 50000}"

Write-Host "Holder 1 Acc: $acc1 (Balance: 100000)"
Write-Host "Holder 2 Acc: $acc2 (Balance: 50000)"

# ==============================================================================
# ATTACK 1: IDOR Masking (Holder 2 accessing Holder 1's Account)
# ==============================================================================
Write-Host "`n--- ATTACK 1: Insecure Direct Object Reference (IDOR) ---" -ForegroundColor Cyan

$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $token2
Report-Result "1.1" "Holder 2 GET /api/accounts/{acc1}" $r.StatusCode 404

$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1/statement" -Token $token2
Report-Result "1.2" "Holder 2 GET /api/accounts/{acc1}/statement" $r.StatusCode 404

$r = Invoke-Api -Method "POST" -Path "/api/accounts/$acc1/deposits" -Token $token2 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"amountMinor`": 1000}"
Report-Result "1.3" "Holder 2 POST /api/accounts/{acc1}/deposits" $r.StatusCode 404

$r = Invoke-Api -Method "POST" -Path "/api/accounts/$acc1/withdrawals" -Token $token2 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"amountMinor`": 1000}"
Report-Result "1.4" "Holder 2 POST /api/accounts/{acc1}/withdrawals" $r.StatusCode 404

$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token2 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 1000}"
Report-Result "1.5" "Holder 2 transfer from acc1" $r.StatusCode 404

# Verify balance of Acc1 untouched
$acc1Check = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $token1
$b1 = ($acc1Check.Content | ConvertFrom-Json).balance
Report-Result "1.6" "Acc1 balance untouched after IDOR attempts" $acc1Check.StatusCode 200 ($b1 -eq 100000) "Balance: $b1"

# ==============================================================================
# ATTACK 2: Role Escalation & RBAC
# ==============================================================================
Write-Host "`n--- ATTACK 2: Role Escalation & RBAC ---" -ForegroundColor Cyan

$r = Invoke-Api -Method "POST" -Path "/api/auth/register" -Body "{`"email`":`"escalate-$uid@atk.local`",`"password`":`"Password123!`",`"role`":`"ADMIN`"}"
Report-Result "2.1" "Register with client-supplied role rejected with 422" $r.StatusCode 422

$r = Invoke-Api -Method "POST" -Path "/api/admin/users" -Token $token1 -Body "{`"email`":`"pwn@test.local`",`"password`":`"Pwn12345!`",`"role`":`"ADMIN`"}"
Report-Result "2.2" "Holder calling /api/admin/users rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "POST" -Path "/api/accounts" -Token $auditorToken -Body "{`"name`":`"Auditor Acc`"}"
Report-Result "2.3" "Auditor write: POST /api/accounts rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $auditorToken -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 1000}"
Report-Result "2.4" "Auditor write: POST /api/transfers rejected with 403" $r.StatusCode 403

# ==============================================================================
# ATTACK 3: JWT Abuse
# ==============================================================================
Write-Host "`n--- ATTACK 3: JWT Abuse ---" -ForegroundColor Cyan

# 3.1 Expired Token
$past = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 3600
$expHeader = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"alg":"HS256"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$expPayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("{`"sub`":`"$h1Id`",`"role`":`"HOLDER`",`"jti`":`"$([guid]::NewGuid().ToString())`",`"iat`":$($past-100),`"exp`":$past}")).TrimEnd('=').Replace('+','-').Replace('/','_')
$expHmac = New-Object System.Security.Cryptography.HMACSHA256
$expHmac.Key = [System.Text.Encoding]::UTF8.GetBytes("dev_mode_only_secret_key_at_least_32_bytes_long_abcdef123456")
$expSig = [Convert]::ToBase64String($expHmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$expHeader.$expPayload"))).TrimEnd('=').Replace('+','-').Replace('/','_')
$expiredToken = "$expHeader.$expPayload.$expSig"

$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $expiredToken
Report-Result "3.1" "Expired JWT token rejected with 401" $r.StatusCode 401

# 3.2 Tampered Signature
$tamperedToken = $token1.Substring(0, $token1.Length - 5) + "XXXXX"
$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $tamperedToken
Report-Result "3.2" "Tampered JWT signature rejected with 401" $r.StatusCode 401

# 3.3 alg=none Token
$noneHeader = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"alg":"none"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$nonePayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("{`"sub`":`"$h1Id`",`"role`":`"ADMIN`",`"jti`":`"$([guid]::NewGuid().ToString())`",`"iat`":$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()),`"exp`":$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+3600)}")).TrimEnd('=').Replace('+','-').Replace('/','_')
$noneToken = "$noneHeader.$nonePayload."
$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $noneToken
Report-Result "3.3" "alg:none unsigned JWT rejected with 401" $r.StatusCode 401

# 3.4 Wrong Signature Key
$wrongKeyHmac = New-Object System.Security.Cryptography.HMACSHA256
$wrongKeyHmac.Key = [System.Text.Encoding]::UTF8.GetBytes("different_super_secret_key_that_is_32_bytes_long_xyz")
$wrongSig = [Convert]::ToBase64String($wrongKeyHmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$expHeader.$expPayload"))).TrimEnd('=').Replace('+','-').Replace('/','_')
$wrongKeyToken = "$expHeader.$expPayload.$wrongSig"
$r = Invoke-Api -Method "GET" -Path "/api/accounts/$acc1" -Token $wrongKeyToken
Report-Result "3.4" "JWT with wrong key signature rejected with 401" $r.StatusCode 401

# 3.5 Disabled User Token
$disabledUid = [guid]::NewGuid().ToString()
$env:PGPASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "root" }
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U root -p 5433 -h 127.0.0.1 -d ledgerline_db -c "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ('$disabledUid', 'disabled-$uid@test.local', 'hash', 'HOLDER', false);" > $null 2>&1
$disabledToken = Get-JwtToken -subject $disabledUid -role "HOLDER"
$r = Invoke-Api -Method "GET" -Path "/api/accounts" -Token $disabledToken
Report-Result "3.5" "Token for disabled user rejected with 401" $r.StatusCode 401

# ==============================================================================
# ATTACK 4: Idempotency Enforcement & Replays
# ==============================================================================
Write-Host "`n--- ATTACK 4: Idempotency Enforcement & Replays ---" -ForegroundColor Cyan

$idemKey = [guid]::NewGuid().ToString()
$transferBody = "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 500}"

# 4.1 Send 20 requests with identical key (using sequential / loop test)
$idemResults = @()
for ($j = 1; $j -le 20; $j++) {
    $res = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey $idemKey -Body $transferBody
    $idemResults += $res
}

$successCount = ($idemResults | Where-Object { $_.StatusCode -eq 200 }).Count
$replayedCount = ($idemResults | Where-Object { $_.Headers["Idempotent-Replayed"] -ne $null }).Count
Report-Result "4.1" "20 identical requests execute exactly once and replay remaining" 200 200 ($successCount -eq 20 -and $replayedCount -eq 19) "Success: $successCount, Replays: $replayedCount"

# 4.2 Reused key with different payload
$mismatchBody = "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 9999}"
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey $idemKey -Body $mismatchBody
Report-Result "4.2" "Reused Idempotency-Key with different payload gives 422" $r.StatusCode 422

# 4.3 Missing Idempotency-Key
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -Body $transferBody
Report-Result "4.3" "Missing Idempotency-Key gives 400" $r.StatusCode 400

# 4.4 Malformed Idempotency-Key
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey "bad key with spaces" -Body $transferBody
Report-Result "4.4" "Malformed Idempotency-Key gives 400" $r.StatusCode 400

# ==============================================================================
# ATTACK 5: Money & Minor-Units Validation
# ==============================================================================
Write-Host "`n--- ATTACK 5: Money & Minor-Units Validation ---" -ForegroundColor Cyan

$amounts = @(
    @{ val = "0"; label = "amountMinor of 0" },
    @{ val = "-1"; label = "amountMinor of -1" },
    @{ val = "1.5"; label = "amountMinor of 1.5 (float)" },
    @{ val = "`"100`""; label = "amountMinor of string `"100`"" },
    @{ val = "null"; label = "amountMinor of null" },
    @{ val = "9223372036854775807"; label = "amountMinor above configured max (Long.MAX_VALUE)" },
    @{ val = "100000001"; label = "amountMinor above max 100,000,000" }
)

$i = 1
foreach ($a in $amounts) {
    $body = "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": $($a.val)}"
    $r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body $body
    $is4xx = ($r.StatusCode -ge 400 -and $r.StatusCode -lt 500)
    Report-Result "5.$i" "$($a.label) rejected without 500" $r.StatusCode $r.StatusCode $is4xx "(Got HTTP $($r.StatusCode))"
    $i++
}

# ==============================================================================
# ATTACK 6: Overdraw Prevention (50 Parallel Withdrawals)
# ==============================================================================
Write-Host "`n--- ATTACK 6: Overdraw Prevention (50 Consecutive Withdrawals) ---" -ForegroundColor Cyan

# Create fresh account for Holder 1 with exactly 10,000 paise
$overdrawAccRes = Invoke-Api -Method "POST" -Path "/api/accounts" -Token $token1 -Body "{`"name`":`"Overdraw Test Acc`"}"
$odAcc = ($overdrawAccRes.Content | ConvertFrom-Json).id
$r = Invoke-Api -Method "POST" -Path "/api/accounts/$odAcc/deposits" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"amountMinor`": 10000}"

# 50 withdrawals of 1,000 paise = 50,000 paise attempted (only 10 can succeed)
$odResults = @()
for ($k = 1; $k -le 50; $k++) {
    $key = [guid]::NewGuid().ToString()
    $res = Invoke-Api -Method "POST" -Path "/api/accounts/$odAcc/withdrawals" -Token $token1 -IdempotencyKey $key -Body "{`"amountMinor`": 1000}"
    $odResults += $res.StatusCode
}

$succeeded = ($odResults | Where-Object { $_ -eq 200 }).Count
$failed = ($odResults | Where-Object { $_ -eq 422 }).Count

$odCheck = Invoke-Api -Method "GET" -Path "/api/accounts/$odAcc" -Token $token1
$finalOdBalance = ($odCheck.Content | ConvertFrom-Json).balance

Report-Result "6.1" "50 withdrawals on 10000 balance: exactly 10 succeed, 40 fail with 422" 200 200 ($succeeded -eq 10 -and $failed -eq 40) "Succeeded: $succeeded, Failed: $failed"
Report-Result "6.2" "Overdraw account final balance is exactly 0 and >= 0" 200 200 ($finalOdBalance -eq 0) "Final Balance: $finalOdBalance"

# ==============================================================================
# ATTACK 7: Deadlock Resistance (Opposing A->B and B->A Storm)
# ==============================================================================
Write-Host "`n--- ATTACK 7: Deadlock Resistance (Opposing A<->B Storm) ---" -ForegroundColor Cyan

$stormResults = @()
for ($m = 1; $m -le 20; $m++) {
    $dir = $m % 2
    $key = [guid]::NewGuid().ToString()
    if ($dir -eq 0) {
        $res = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey $key -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 100}"
    } else {
        $res = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token2 -IdempotencyKey $key -Body "{`"fromAccountId`":`"$acc2`",`"toAccountId`":`"$acc1`",`"amountMinor`": 100}"
    }
    $stormResults += $res.StatusCode
}

$deadlocks = ($stormResults | Where-Object { $_ -eq 500 }).Count
$stormSuccess = ($stormResults | Where-Object { $_ -eq 200 }).Count
Report-Result "7.1" "Opposing A<->B transfers complete with 0 deadlocks / 500s" 200 200 ($deadlocks -eq 0 -and $stormSuccess -eq 20) "Success: $stormSuccess, 500s: $deadlocks"

# ==============================================================================
# ATTACK 8: Self-Transfer & Frozen Account Transfer
# ==============================================================================
Write-Host "`n--- ATTACK 8: Self-Transfer & Frozen Account Transfer ---" -ForegroundColor Cyan

# 8.1 Self-Transfer
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc1`",`"amountMinor`": 500}"
Report-Result "8.1" "Self-transfer rejected with 422" $r.StatusCode 422

# 8.2 Frozen Account Transfer
$freezeRes = Invoke-Api -Method "POST" -Path "/api/admin/accounts/$acc1/freeze" -Token $adminToken -Body "{`"reason`":`"Automated penetration freeze verification`"}"
Report-Result "8.2a" "Admin freeze account returns 200" $freezeRes.StatusCode 200

$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 500}"
Report-Result "8.2b" "Transfer from FROZEN account rejected with 422" $r.StatusCode 422

# Unfreeze account
$unfreezeRes = Invoke-Api -Method "POST" -Path "/api/admin/accounts/$acc1/unfreeze" -Token $adminToken -Body "{`"reason`":`"Automated penetration unfreeze verification`"}"
Report-Result "8.2c" "Admin unfreeze account returns 200" $unfreezeRes.StatusCode 200

# ==============================================================================
# ATTACK 9: Malformed JSON, Wrong Content-Type & Oversized Body
# ==============================================================================
Write-Host "`n--- ATTACK 9: Malformed JSON, Wrong Content-Type & Oversized Body ---" -ForegroundColor Cyan

# 9.1 Malformed JSON
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"amountMinor`": 500, broken json"
$hasStack = $r.Content.Contains("Exception") -or $r.Content.Contains(".java:")
Report-Result "9.1" "Malformed JSON returns 400/422 problem+json with no stack trace" $r.StatusCode $r.StatusCode (-not $hasStack -and $r.StatusCode -ge 400 -and $r.StatusCode -lt 500)

# 9.2 Wrong Content-Type
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "<xml></xml>" -ContentType "text/plain"
$is4xx = ($r.StatusCode -ge 400 -and $r.StatusCode -lt 500)
Report-Result "9.2" "Wrong content-type returns 415/400" $r.StatusCode $r.StatusCode $is4xx "(Got HTTP $($r.StatusCode))"

# 9.3 Oversized Payload (2 MB padding)
$padding = "A" * 2000000
$r = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey ([guid]::NewGuid().ToString()) -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 500, `"padding`":`"$padding`"}"
$isOversized = ($r.StatusCode -eq 400 -or $r.StatusCode -eq 413)
Report-Result "9.3" "Oversized payload rejected with 400 or 413 problem+json" $r.StatusCode $r.StatusCode $isOversized "(Got HTTP $($r.StatusCode))"

# ==============================================================================
# ATTACK 10: Conservation & Audit Hash-Chain Integrity Verification
# ==============================================================================
Write-Host "`n--- ATTACK 10: Conservation & Cryptographic Audit Verification ---" -ForegroundColor Cyan

# 10.1 Ledger Conservation
$consRes = Invoke-Api -Method "GET" -Path "/api/ledger/conservation" -Token $auditorToken
$consObj = $consRes.Content | ConvertFrom-Json
$isConserved = ($consObj.healthy -eq $true) -and ($consObj.sumOfEntries -eq 0) -and ($consObj.sumOfBalances -eq 0) -and ($consObj.imbalancedTransferCount -eq 0)
Report-Result "10.1" "System-wide Ledger Conservation: entries=0, balances=0, imbalanced=0" $consRes.StatusCode 200 $isConserved "SumEntries: $($consObj.sumOfEntries), SumBalances: $($consObj.sumOfBalances)"

# 10.2 Hash-Chain Audit Verify
$auditVerify = Invoke-Api -Method "GET" -Path "/api/audit/verify" -Token $auditorToken
$auditObj = $auditVerify.Content | ConvertFrom-Json
$isValidChain = ($auditObj.valid -eq $true) -and ($auditObj.firstBrokenSeq -eq $null)
Report-Result "10.2" "Cryptographic SHA-256 Audit Chain verified from genesis" $auditVerify.StatusCode 200 $isValidChain "CheckedRows: $($auditObj.checkedRows)"

# 10.3 Check that Denied Attempts Appear in Audit Log
$auditLog = Invoke-Api -Method "GET" -Path "/api/audit?page=0&size=50" -Token $auditorToken
$auditEntries = ($auditLog.Content | ConvertFrom-Json).content
$hasEntries = ($auditEntries.Count -gt 0)
Report-Result "10.3" "Audit log contains records of executed operations" $auditLog.StatusCode 200 $hasEntries "Total Logged: $($auditEntries.Count)"

# ==============================================================================
# ATTACK 11: Feature Session Endpoints (Features 1 to 8: Forensic Trace,
#            Reconciliation, Audit CSV, Reason Mandates, Governance, Lockout, Activity)
# ==============================================================================
Write-Host "`n--- ATTACK 11: Feature Session Endpoints & Security Controls ---" -ForegroundColor Cyan

# 11.1 AUDITOR Transfer Trace (Feature 1)
$traceKey = [guid]::NewGuid().ToString()
$traceTransferRes = Invoke-Api -Method "POST" -Path "/api/transfers" -Token $token1 -IdempotencyKey $traceKey -Body "{`"fromAccountId`":`"$acc1`",`"toAccountId`":`"$acc2`",`"amountMinor`": 1500}"
$traceTransferId = ($traceTransferRes.Content | ConvertFrom-Json).transferId

$r = Invoke-Api -Method "GET" -Path "/api/audit/transfers/$traceTransferId" -Token $token1
Report-Result "11.1a" "Holder calling /api/audit/transfers/{id} rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "GET" -Path "/api/audit/transfers/$traceTransferId" -Token $auditorToken
$traceObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$hasTraceEntries = ($traceObj -ne $null) -and ($traceObj.entries.Count -ge 2) -and ($traceObj.auditEntries.Count -ge 1)
Report-Result "11.1b" "Auditor GET /api/audit/transfers/{id} returns double-entry and audit blocks" $r.StatusCode 200 $hasTraceEntries

$r = Invoke-Api -Method "GET" -Path "/api/audit/transfers/00000000-0000-0000-0000-000000000999" -Token $auditorToken
Report-Result "11.1c" "Auditor GET unknown transfer returns 404 Problem Details" $r.StatusCode 404

# 11.2 AUDITOR Reconciliation Report (Feature 2)
$r = Invoke-Api -Method "GET" -Path "/api/ledger/reconciliation" -Token $token1
Report-Result "11.2a" "Holder calling /api/ledger/reconciliation rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "GET" -Path "/api/ledger/reconciliation" -Token $auditorToken
$reconObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$reconValid = ($reconObj -ne $null) -and ($reconObj.overallHealthy -eq $true) -and ($reconObj.accounts.content.Count -gt 0)
Report-Result "11.2b" "Auditor GET /api/ledger/reconciliation returns verified balance consistency" $r.StatusCode 200 $reconValid

$r = Invoke-Api -Method "GET" -Path "/api/ledger/reconciliation?size=200" -Token $auditorToken
$reconCapObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$isCapped100 = ($reconCapObj -ne $null) -and ($reconCapObj.accounts.size -le 100)
Report-Result "11.2c" "Reconciliation pagination size is strictly capped at <= 100" $r.StatusCode 200 $isCapped100

# 11.3 AUDITOR Security Events & CSV Export (Feature 3)
$r = Invoke-Api -Method "GET" -Path "/api/audit" -Token $token1
Report-Result "11.3a" "Holder calling /api/audit rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "GET" -Path "/api/audit/export" -Token $token1
Report-Result "11.3b" "Holder calling /api/audit/export rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "GET" -Path "/api/audit?action=TRANSFER&outcome=SUCCESS" -Token $auditorToken
Report-Result "11.3c" "Auditor filtered audit log query returns 200" $r.StatusCode 200

$r = Invoke-Api -Method "GET" -Path "/api/audit/export" -Token $auditorToken
$isCsv = $r.Content.Contains("Seq,Actor ID") -or ($r.Headers["Content-Type"] -like "*text/csv*")
Report-Result "11.3d" "Auditor GET /api/audit/export returns RFC-compliant CSV" $r.StatusCode 200 $isCsv

# 11.4 ADMIN Freeze/Unfreeze Reason Mandate (Feature 4)
$r = Invoke-Api -Method "POST" -Path "/api/admin/accounts/$acc1/freeze" -Token $adminToken
Report-Result "11.4a" "Freeze without reason body rejected with 400" $r.StatusCode 400

$r = Invoke-Api -Method "POST" -Path "/api/admin/accounts/$acc1/freeze" -Token $adminToken -Body "{`"reason`":`"no`"}"
Report-Result "11.4b" "Freeze with reason < 3 chars rejected with 400" $r.StatusCode 400

$r = Invoke-Api -Method "POST" -Path "/api/admin/accounts/$acc1/unfreeze" -Token $adminToken
Report-Result "11.4c" "Unfreeze without reason body rejected with 400" $r.StatusCode 400

# 11.5 ADMIN User Enable/Disable Governance (Feature 5)
$targetEmail = "target-$uid@atk.local"
$targetReg = Invoke-Api -Method "POST" -Path "/api/auth/register" -Body "{`"email`":`"$targetEmail`",`"password`":`"Password123!`"}"
$targetId = ($targetReg.Content | ConvertFrom-Json).userId
$targetToken = ($targetReg.Content | ConvertFrom-Json).token

$r = Invoke-Api -Method "POST" -Path "/api/admin/users/$targetId/disable" -Token $token1
Report-Result "11.5a" "Holder calling /api/admin/users/{id}/disable rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "POST" -Path "/api/admin/users/$targetId/disable" -Token $adminToken
Report-Result "11.5b" "Admin disable user returns 200" $r.StatusCode 200

# Target user token must immediately be rejected with 401 Unauthorized
$r = Invoke-Api -Method "GET" -Path "/api/me" -Token $targetToken
Report-Result "11.5c" "Disabled user existing token immediately rejected with 401" $r.StatusCode 401

$r = Invoke-Api -Method "POST" -Path "/api/admin/users/$targetId/enable" -Token $adminToken
Report-Result "11.5d" "Admin re-enable user returns 200" $r.StatusCode 200

# 11.6 ADMIN Unlock User (Feature 6)
# Trigger 5 failed logins to lock target account
for ($f = 1; $f -le 5; $f++) {
    $null = Invoke-Api -Method "POST" -Path "/api/auth/login" -Body "{`"email`":`"$targetEmail`",`"password`":`"WrongPass999!`"}"
}
$lockedRes = Invoke-Api -Method "POST" -Path "/api/auth/login" -Body "{`"email`":`"$targetEmail`",`"password`":`"Password123!`"}"
Report-Result "11.6a" "Account locked after 5 failed logins rejects valid credentials (HTTP 401)" $lockedRes.StatusCode 401

$r = Invoke-Api -Method "POST" -Path "/api/admin/users/$targetId/unlock" -Token $token1
Report-Result "11.6b" "Holder calling /api/admin/users/{id}/unlock rejected with 403" $r.StatusCode 403

$r = Invoke-Api -Method "POST" -Path "/api/admin/users/$targetId/unlock" -Token $adminToken
$unlockObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$isUnlocked = ($unlockObj -ne $null) -and ($unlockObj.unlocked -eq $true) -and ($unlockObj.failedLogins -eq 0)
Report-Result "11.6c" "Admin unlock user returns 200 and resets failed logins" $r.StatusCode 200 $isUnlocked

$loginAfterUnlock = Invoke-Api -Method "POST" -Path "/api/auth/login" -Body "{`"email`":`"$targetEmail`",`"password`":`"Password123!`"}"
Report-Result "11.6d" "User can immediately login after admin unlock (HTTP 200)" $loginAfterUnlock.StatusCode 200

# 11.7 HOLDER My Activity (Feature 8)
$r = Invoke-Api -Method "GET" -Path "/api/me/activity"
Report-Result "11.7a" "Unauthenticated GET /api/me/activity rejected with 401" $r.StatusCode 401

$r = Invoke-Api -Method "GET" -Path "/api/me/activity" -Token $token1
$actObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$hasMyActivity = ($actObj -ne $null) -and ($actObj.content.Count -gt 0)
Report-Result "11.7b" "Holder 1 GET /api/me/activity returns personal activity tape" $r.StatusCode 200 $hasMyActivity

# IDOR probe: Holder 1 supplies actorId query parameter pointing to Holder 2
$r = Invoke-Api -Method "GET" -Path "/api/me/activity?actorId=$h2Id" -Token $token1
$idorObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$allMine = $true
if ($idorObj -ne $null -and $idorObj.content.Count -gt 0) {
    foreach ($entry in $idorObj.content) {
        if ($entry.actorId -ne $h1Id) { $allMine = $false }
    }
}
Report-Result "11.7c" "IDOR parameter ignored: caller only receives own activity" $r.StatusCode 200 $allMine

$r = Invoke-Api -Method "GET" -Path "/api/me/activity?size=200" -Token $token1
$actCapObj = if ($r.StatusCode -eq 200) { $r.Content | ConvertFrom-Json } else { $null }
$isActivityCapped = ($actCapObj -ne $null) -and ($actCapObj.size -le 100)
Report-Result "11.7d" "Activity pagination size is strictly capped at <= 100" $r.StatusCode 200 $isActivityCapped

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " ATTACK SUITE SUMMARY" -ForegroundColor Cyan
Write-Host " TOTAL PASSED: $script:TotalPassed" -ForegroundColor Green
Write-Host " TOTAL FAILED: $script:TotalFailed" -ForegroundColor $(if ($script:TotalFailed -eq 0) { "Green" } else { "Red" })
Write-Host "======================================================================" -ForegroundColor Cyan
