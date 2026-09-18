$ErrorActionPreference = 'Stop'
$drivacyRoot = Split-Path -Parent $PSScriptRoot
$contractHarness = Join-Path ([System.IO.Path]::GetTempPath()) ('drivacy-bc-contract-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $contractHarness | Out-Null
Copy-Item -LiteralPath (Join-Path $drivacyRoot 'packages/shared') -Destination (Join-Path $contractHarness 'shared') -Recurse

# Isolated validation dependencies; no repository workspace/lockfile changes.
$contractPackage = @'
{
  "name": "drivacy-bc-contract-harness", "private": true, "type": "module",
  "dependencies": { "zod": "4.6.5" },
  "devDependencies": { "typescript": "7.0.2", "vitest": "5.0.1", "@types/node": "24.13.5" },
  "scripts": { "test": "vitest run shared/test", "typecheck": "tsc --noEmit" }
}
'@
$contractTsconfig = @'
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
    "ignoreDeprecations": "6.0"
  },
  "include": ["shared/**/*.ts"]
}
'@
[System.IO.File]::WriteAllText((Join-Path $contractHarness 'package.json'), $contractPackage)
[System.IO.File]::WriteAllText((Join-Path $contractHarness 'tsconfig.json'), $contractTsconfig)
Write-Output "CONTRACT_HARNESS=$contractHarness"
Push-Location -LiteralPath $contractHarness
try {
  & npm.cmd install --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Contract harness dependency installation failed' }
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Contract typecheck failed' }
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Contract tests failed' }
} finally { Pop-Location }
