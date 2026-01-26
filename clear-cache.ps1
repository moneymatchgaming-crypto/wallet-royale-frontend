# Clear Next.js cache and restart dev server
Write-Host "Clearing .next cache..."
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next
    Write-Host "✓ Cache cleared"
} else {
    Write-Host "✓ No cache to clear"
}

Write-Host "`nStarting dev server..."
npm run dev
