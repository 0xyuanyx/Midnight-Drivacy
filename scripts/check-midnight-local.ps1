param(
  [string]$WslDistribution = 'midnight-ubuntu',
  [switch]$CompileOnly
)
$ErrorActionPreference = 'Stop'
$probeRoot = Split-Path -Parent $PSScriptRoot
$probeHarness = Join-Path ([System.IO.Path]::GetTempPath()) ('drivacy-state-probe-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeHarness | Out-Null
Copy-Item -LiteralPath (Join-Path $probeRoot 'contracts/state-probe.compact') -Destination $probeHarness
Copy-Item -LiteralPath (Join-Path $probeRoot 'packages/midnight/probe/local-probe.ts') -Destination $probeHarness
Write-Output "MIDNIGHT_PROBE_HARNESS=$probeHarness"

# Compile through WSL; pass paths as arguments rather than interpolated shell code.
$probeWindowsPath = $probeHarness.Replace('\', '/')
$probePathOutput = & wsl.exe -d $WslDistribution -- wslpath -a -u $probeWindowsPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve harness path in WSL' }
$probeWslPath = ($probePathOutput | Out-String).Trim()
& wsl.exe -d $WslDistribution -- /root/.local/bin/compact compile +0.31.1 "$probeWslPath/state-probe.compact" "$probeWslPath/managed/state-probe"
if ($LASTEXITCODE -ne 0) { throw 'Compact full compilation failed' }

$probePackage = @'
{
  "name": "drivacy-state-probe-harness", "private": true, "type": "module",
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.16.0",
    "@midnight-ntwrk/midnight-js-contracts": "4.1.1",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider": "4.1.1",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "4.1.1",
    "@midnight-ntwrk/midnight-js-level-private-state-provider": "4.1.1",
    "@midnight-ntwrk/midnight-js-network-id": "4.1.1",
    "@midnight-ntwrk/midnight-js-node-zk-config-provider": "4.1.1",
    "@midnight-ntwrk/midnight-js-protocol": "4.1.1",
    "@midnight-ntwrk/midnight-js-types": "4.1.1",
    "@midnight-ntwrk/wallet-sdk": "1.2.0", "rxjs": "7.8.2", "ws": "8.21.1"
  },
  "devDependencies": { "tsx": "4.23.1", "typescript": "7.0.2", "@types/node": "24.13.5", "@types/ws": "8.18.1" },
  "overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
}
'@
[System.IO.File]::WriteAllText((Join-Path $probeHarness 'package.json'), $probePackage)
Push-Location -LiteralPath $probeHarness
try {
  & npm.cmd install --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Probe dependencies failed to install' }
  & npm.cmd dedupe --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Probe runtime dependency deduplication failed' }
  & ./node_modules/.bin/tsc.cmd --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext local-probe.ts
  if ($LASTEXITCODE -ne 0) { throw 'Probe typecheck failed' }
  if ($CompileOnly) { Write-Output 'FULL_COMPILE_AND_TYPECHECK_PASSED'; return }
  & docker.exe compose -f (Join-Path $probeRoot 'infra/midnight/local-probe.yml') up -d --wait --wait-timeout 240
  if ($LASTEXITCODE -ne 0) { throw 'Local node/indexer/proof-server startup failed; no E2E success claimed' }
  & ./node_modules/.bin/tsx.cmd local-probe.ts
  if ($LASTEXITCODE -ne 0) { throw "Live probe failed; inspect $probeHarness/probe-evidence.json" }
  Write-Output "LIVE_PROBE_EVIDENCE=$probeHarness/probe-evidence.json"
} finally { Pop-Location }
