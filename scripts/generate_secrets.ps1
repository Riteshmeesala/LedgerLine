# =============================================================================
# LedgerLine Deployment Secret Generator
# Generates 256-bit+ JWT secret and 4 strong random seed passwords locally.
# Run this directly in your terminal. Never commit generated values.
# =============================================================================

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

function Generate-SecretString([int]$length, [string]$charSet) {
    $bytes = New-Object byte[] $length
    $rng.GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $charSet[$_ % $charSet.Length] })
}

$alphaNum = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
$passChars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#%*+=-"

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " LEDGERLINE SECRETS (COPY THESE TO YOUR LOCAL PASSWORD MANAGER ONLY)" -ForegroundColor Cyan
Write-Host " DO NOT PASTE OR COMMIT THESE TO GIT OR CHAT LOGS" -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "JWT_SECRET:             $(Generate-SecretString 48 $alphaNum)" -ForegroundColor Green
Write-Host "SEED_ADMIN_PASSWORD:    $(Generate-SecretString 20 $passChars)" -ForegroundColor Green
Write-Host "SEED_AUDITOR_PASSWORD:  $(Generate-SecretString 20 $passChars)" -ForegroundColor Green
Write-Host "SEED_HOLDER1_PASSWORD:  $(Generate-SecretString 20 $passChars)" -ForegroundColor Green
Write-Host "SEED_HOLDER2_PASSWORD:  $(Generate-SecretString 20 $passChars)" -ForegroundColor Green
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan

