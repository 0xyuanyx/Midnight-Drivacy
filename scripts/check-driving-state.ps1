param(
  [string]$WslDistribution = 'midnight-ubuntu',
  [switch]$SkipZk,
  [switch]$Live,
  [switch]$BrowserIntegration
)
$ErrorActionPreference = 'Stop'
if ($SkipZk -and $Live) { throw 'Live verification requires full ZK compilation' }
if ($BrowserIntegration -and -not $Live) { throw 'Browser integration requires Live' }
$drivingRoot = Split-Path -Parent $PSScriptRoot
$drivingHarness = Join-Path ([System.IO.Path]::GetTempPath()) ('drivacy-driving-state-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $drivingHarness 'packages/midnight/managed') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $drivingRoot 'packages/shared') -Destination (Join-Path $drivingHarness 'packages/shared') -Recurse
Copy-Item -LiteralPath (Join-Path $drivingRoot 'packages/core') -Destination (Join-Path $drivingHarness 'packages/core') -Recurse
foreach ($drivingPart in @('src','test','probe','browser')) {
  Copy-Item -LiteralPath (Join-Path $drivingRoot "packages/midnight/$drivingPart") -Destination (Join-Path $drivingHarness "packages/midnight/$drivingPart") -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $drivingHarness 'apps/backend/src'),(Join-Path $drivingHarness 'db') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $drivingRoot 'apps/backend/src/chain-state') -Destination (Join-Path $drivingHarness 'apps/backend/src/chain-state') -Recurse
Copy-Item -LiteralPath (Join-Path $drivingRoot 'apps/backend/src/errors') -Destination (Join-Path $drivingHarness 'apps/backend/src/errors') -Recurse
Copy-Item -LiteralPath (Join-Path $drivingRoot 'db/migrations') -Destination (Join-Path $drivingHarness 'db/migrations') -Recurse
Copy-Item -LiteralPath (Join-Path $drivingRoot 'contracts/driving-state.compact') -Destination $drivingHarness
if (Test-Path -LiteralPath (Join-Path $drivingRoot 'tsconfig.base.json')) {
  Copy-Item -LiteralPath (Join-Path $drivingRoot 'tsconfig.base.json') -Destination $drivingHarness
}
Write-Output "DRIVING_STATE_HARNESS=$drivingHarness"
$drivingWslPathOutput = & wsl.exe -d $WslDistribution -- wslpath -a -u $drivingHarness.Replace('\','/')
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve driving harness path in WSL' }
$drivingWslPath = ($drivingWslPathOutput | Out-String).Trim()
$drivingCompilerOptions = @()
if ($SkipZk) { $drivingCompilerOptions += '--skip-zk' }
& wsl.exe -d $WslDistribution -- /root/.local/bin/compact compile +0.31.1 @drivingCompilerOptions "$drivingWslPath/driving-state.compact" "$drivingWslPath/packages/midnight/managed/driving-state"
if ($LASTEXITCODE -ne 0) { throw 'Driving-state compilation failed' }

$drivingPackage = @'
{
  "name": "drivacy-driving-state-harness", "private": true, "type": "module",
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
    "@midnight-ntwrk/wallet-sdk": "1.2.0", "rxjs": "7.8.2", "ws": "8.21.1", "zod": "4.6.5",
    "@drivacy/shared": "file:./packages/shared", "pg": "8.23.0", "@types/pg": "8.23.1",
    "esbuild": "0.28.2", "playwright": "1.63.0", "esbuild-plugin-polyfill-node": "0.3.0"
  },
  "devDependencies": {
    "tsx": "4.23.1", "typescript": "7.0.2", "vitest": "5.0.1", "@types/node": "24.13.5", "@types/ws": "8.18.1"
  },
  "overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
}
'@
$drivingTsconfig = @'
{
  "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true, "types": ["node"] },
  "include": ["packages/shared/**/*.ts", "packages/core/**/*.ts", "packages/midnight/src/**/*.ts",
    "packages/midnight/test/**/*.ts", "packages/midnight/probe/driving-*.ts",
    "packages/midnight/probe/browser-wallet.ts", "packages/midnight/probe/backend-local.ts",
    "packages/midnight/browser/**/*.ts", "apps/backend/src/chain-state/**/*.ts"]
}
'@
[System.IO.File]::WriteAllText((Join-Path $drivingHarness 'package.json'), $drivingPackage)
[System.IO.File]::WriteAllText((Join-Path $drivingHarness 'tsconfig.json'), $drivingTsconfig)
Push-Location -LiteralPath $drivingHarness
try {
  & npm.cmd install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-timeout=30000 --fetch-retries=1
  if ($LASTEXITCODE -ne 0) { throw 'Driving harness dependencies failed to install' }
  & npm.cmd dedupe --ignore-scripts --no-audit --no-fund --prefer-offline
  if ($LASTEXITCODE -ne 0) { throw 'Driving runtime deduplication failed' }
  & ./node_modules/.bin/tsc.cmd -p packages/shared/tsconfig.json
  if ($LASTEXITCODE -ne 0) { throw 'Shared package build failed' }
  & ./node_modules/.bin/tsc.cmd --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'Driving harness strict typecheck failed' }
  & ./node_modules/.bin/vitest.cmd run packages/core/test packages/shared/test packages/midnight/test --reporter=default --reporter=json --outputFile=test-results.json
  if ($LASTEXITCODE -ne 0) { throw "Driving tests failed; inspect $drivingHarness/test-results.json" }
  if (-not $Live) {
    if ($SkipZk) { Write-Output 'GENERATED_CIRCUIT_TESTS_PASSED_WITHOUT_ZK_KEYS' }
    else { Write-Output 'FULL_COMPILE_TYPECHECK_AND_CIRCUIT_TESTS_PASSED' }
    return
  }
  & docker.exe compose -f (Join-Path $drivingRoot 'infra/midnight/local-probe.yml') up -d --wait --wait-timeout 240
  if ($LASTEXITCODE -ne 0) { throw 'Local driving verification services failed to start' }
  if ($BrowserIntegration) {
    # 고정 loopback fixture DB만 만든다. 기존 컨테이너/원격 DB에는 migration을 적용하지 않는다.
    $drivingDbContainer = 'drivacy-integration-' + [guid]::NewGuid().ToString('N')
    & docker.exe run -d --name $drivingDbContainer -p 127.0.0.1:55439:5432 -e POSTGRES_PASSWORD=Public-Local-Fixture-Only -e POSTGRES_DB=drivacy_integration postgres@sha256:67f41722b7a8cbdb868a44a4995c846eddfdc2973bccb291ce937dce88ad5675
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated fixture DB; inspect loopback port 55439' }
    try {
      for ($drivingTry=0; $drivingTry -lt 30; $drivingTry++) {
        & docker.exe exec $drivingDbContainer pg_isready -U postgres 2>$null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
      }
      & ./node_modules/.bin/playwright.cmd install chromium
      if ($LASTEXITCODE -ne 0) { throw 'Fixture Chromium install failed' }
      $env:DRIVACY_BROWSER_INTEGRATION = '1'
      & ./node_modules/.bin/tsx.cmd packages/midnight/probe/driving-local.ts
      if ($LASTEXITCODE -ne 0) { throw "Browser/DB integration failed; inspect $drivingHarness/driving-evidence.json" }
    } finally { Remove-Item Env:DRIVACY_BROWSER_INTEGRATION -ErrorAction SilentlyContinue; & docker.exe rm -f $drivingDbContainer | Out-Null }
  } else { & ./node_modules/.bin/tsx.cmd packages/midnight/probe/driving-local.ts }
  if ($LASTEXITCODE -ne 0) { throw "Live driving verification failed; inspect $drivingHarness/driving-evidence.json" }
  Write-Output "LIVE_DRIVING_EVIDENCE=$drivingHarness/driving-evidence.json"
} finally { Pop-Location }
