$ErrorActionPreference = 'Stop'
$coreRoot = Split-Path -Parent $PSScriptRoot
$coreHarness = Join-Path ([System.IO.Path]::GetTempPath()) ('drivacy-core-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $coreHarness 'packages') | Out-Null
Copy-Item -LiteralPath (Join-Path $coreRoot 'packages/shared') -Destination (Join-Path $coreHarness 'packages/shared') -Recurse
Copy-Item -LiteralPath (Join-Path $coreRoot 'packages/core') -Destination (Join-Path $coreHarness 'packages/core') -Recurse
$corePackage = @'
{
  "name": "drivacy-core-harness", "private": true, "type": "module",
  "dependencies": { "zod": "4.6.5" },
  "devDependencies": { "typescript": "7.0.2", "vitest": "5.0.1", "@types/node": "24.13.5" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run packages/core/test packages/shared/test --reporter=default --reporter=json --outputFile=test-results.json" }
}
'@
$coreTsconfig = @'
{
  "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true, "types": ["node"] },
  "include": ["packages/**/*.ts"]
}
'@
[System.IO.File]::WriteAllText((Join-Path $coreHarness 'package.json'), $corePackage)
[System.IO.File]::WriteAllText((Join-Path $coreHarness 'tsconfig.json'), $coreTsconfig)
Write-Output "CORE_HARNESS=$coreHarness"
Push-Location -LiteralPath $coreHarness
try {
  & npm.cmd install --ignore-scripts --no-audit --no-fund --prefer-offline --fetch-timeout=30000 --fetch-retries=1
  if ($LASTEXITCODE -ne 0) { throw 'Core dependencies failed to install' }
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Core typecheck failed' }
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw "Core tests failed; inspect $coreHarness/test-results.json" }
  Write-Output "CORE_TEST_EVIDENCE=$coreHarness/test-results.json"
} finally { Pop-Location }
