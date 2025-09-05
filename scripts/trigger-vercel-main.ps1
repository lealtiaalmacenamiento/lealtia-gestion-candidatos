param(
  [Parameter(Mandatory = $false)][string]$HookUrl = $env:VERCEL_DEPLOY_HOOK_MAIN
)

if (-not $HookUrl -or $HookUrl.Trim().Length -eq 0) {
  Write-Error "Provide the Vercel Deploy Hook URL via -HookUrl or VERCEL_DEPLOY_HOOK_MAIN env var."
  exit 1
}

try {
  $resp = Invoke-WebRequest -Method POST -Uri $HookUrl -UseBasicParsing
  Write-Output "Deploy hook triggered. HTTP $($resp.StatusCode)"
} catch {
  Write-Error "Failed to trigger hook: $($_.Exception.Message)"
  exit 1
}
