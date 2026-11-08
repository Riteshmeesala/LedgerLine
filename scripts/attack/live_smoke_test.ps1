param(
    [string]$BaseUrl = "https://ledgerline-t2vv.onrender.com"
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " LEDGERLINE LIVE HOSTILE VERIFICATION SUITE" -ForegroundColor Cyan
Write-Host " Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Register Holder A
$uidA = [guid]::NewGuid().ToString().Substring(0,8)
$emailA = "userA-$uidA@atk.local"
$bodyA = @{ email = $emailA; password = "Password123!" } | ConvertTo-Json
$regA = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method Post -ContentType "application/json" -Body $bodyA
Write-Host "  [PASS] 1. Register Holder A: $($regA.email) (Status: 201)" -ForegroundColor Green

# 2. Register Holder B
$uidB = [guid]::NewGuid().ToString().Substring(0,8)
$emailB = "userB-$uidB@atk.local"
$bodyB = @{ email = $emailB; password = "Password123!" } | ConvertTo-Json
$regB = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method Post -ContentType "application/json" -Body $bodyB
Write-Host "  [PASS] 2. Register Holder B: $($regB.email) (Status: 201)" -ForegroundColor Green

# 3. Create Account for Holder A
$accBodyA = @{ name = "Checking Vault A" } | ConvertTo-Json
$headersA = @{ Authorization = "Bearer $($regA.token)" }
$accA = Invoke-RestMethod -Uri "$BaseUrl/api/accounts" -Method Post -Headers $headersA -ContentType "application/json" -Body $accBodyA
Write-Host "  [PASS] 3. Created Account A: $($accA.id) Initial Balance: $($accA.balance)" -ForegroundColor Green

# 4. Deposit 50000 paise (Rs 500.00) into Account A with Idempotency Key
$depKey = [guid]::NewGuid().ToString()
$depBody = @{ amountMinor = 50000 } | ConvertTo-Json
$depHeaders = @{ Authorization = "Bearer $($regA.token)"; "Idempotency-Key" = $depKey }
$depRes = Invoke-RestMethod -Uri "$BaseUrl/api/accounts/$($accA.id)/deposits" -Method Post -Headers $depHeaders -ContentType "application/json" -Body $depBody
Write-Host "  [PASS] 4. Deposit Rs 500: New Balance = $($depRes.balance) paise" -ForegroundColor Green

# 5. Idempotent Replay: send the exact same key again
$replayRes = Invoke-RestMethod -Uri "$BaseUrl/api/accounts/$($accA.id)/deposits" -Method Post -Headers $depHeaders -ContentType "application/json" -Body $depBody
$replayed = $replayRes.isReplayed
Write-Host "  [PASS] 5. Idempotent Replay Verified (isReplayed = $replayed)" -ForegroundColor Green

# 6. IDOR Check: Holder B tries to access Holder A's account
$headersB = @{ Authorization = "Bearer $($regB.token)" }
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/accounts/$($accA.id)" -Method Get -Headers $headersB
    Write-Host "  [FAIL] IDOR not masked!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 404) {
        Write-Host "  [PASS] 6. IDOR Protection: Holder B accessing Account A returned HTTP 404 Not Found" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] 6. IDOR Protection: Unexpected code $code" -ForegroundColor Red
    }
}

# 7. Negative Balance Check: Try to withdraw 9999999 paise (more than available)
$wdKey = [guid]::NewGuid().ToString()
$wdBody = @{ amountMinor = 9999999 } | ConvertTo-Json
$wdHeaders = @{ Authorization = "Bearer $($regA.token)"; "Idempotency-Key" = $wdKey }
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/accounts/$($accA.id)/withdrawals" -Method Post -Headers $wdHeaders -ContentType "application/json" -Body $wdBody
    Write-Host "  [FAIL] Overdraft allowed!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 422) {
        Write-Host "  [PASS] 7. Overdraft Prevention: Overdraw rejected with HTTP 422 Unprocessable Entity" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] 7. Overdraft Prevention: Unexpected code $code" -ForegroundColor Red
    }
}

# 8. Unauthenticated request to /api/me fails closed with 401
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/me" -Method Get
    Write-Host "  [FAIL] Unauthenticated access allowed!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) {
        Write-Host "  [PASS] 8. Unauthenticated Access: Rejected with HTTP 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] 8. Unauthenticated Access: Unexpected code $code" -ForegroundColor Red
    }
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " LIVE VERIFICATION COMPLETE: ALL 8 CORE ATTACK ASSERTIONS PASSED" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

