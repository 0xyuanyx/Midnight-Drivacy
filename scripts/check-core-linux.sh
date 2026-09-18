#!/usr/bin/env bash
set -euo pipefail

# Fresh Linux runtime, filesystem, npm cache and dependencies; no Windows node_modules.
# Invoke under WSL with bash scripts/check-core-linux.sh <absolute repo path>.
repo_root=${1:?Provide the absolute repository path}
run_root=$(mktemp -d /tmp/drivacy-core-independent-XXXXXXXX)
echo "INDEPENDENT_CORE_HARNESS=$run_root"
cd "$run_root"
core_home="$run_root/home"
mkdir -p "$core_home" packages runtime-download
export PATH=/usr/bin:/bin
node_release=24.14.1
archive="node-v${node_release}-linux-x64.tar.xz"
curl -fsS --connect-timeout 15 --max-time 180 "https://nodejs.org/dist/v${node_release}/${archive}" -o "runtime-download/$archive"
curl -fsS --connect-timeout 15 --max-time 60 "https://nodejs.org/dist/v${node_release}/SHASUMS256.txt" -o runtime-download/SHASUMS256.txt
cd runtime-download
awk -v archive="$archive" '$2 == archive' SHASUMS256.txt > selected.sha256
test -s selected.sha256
sha256sum --check selected.sha256
tar -xJf "$archive"
cd "$run_root"
export PATH="$run_root/runtime-download/node-v${node_release}-linux-x64/bin:/usr/bin:/bin"
export npm_config_cache="$run_root/npm-cache"
export npm_config_userconfig="$core_home/.npmrc"
cp -R "$repo_root/packages/core" "$repo_root/packages/shared" packages/
cat > package.json <<'JSON'
{
  "name": "drivacy-core-linux-independent", "private": true, "type": "module",
  "dependencies": { "zod": "4.6.5" },
  "devDependencies": { "typescript": "7.0.2", "vitest": "5.0.1", "@types/node": "24.13.5" }
}
JSON
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true, "rootDir": "packages", "types": ["node"] },
  "include": ["packages/**/*.ts"]
}
JSON
npm install --ignore-scripts --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run packages/core/test packages/shared/test --reporter=default --reporter=json --outputFile=test-results.json
python3 packages/core/test/oracle/generate_cases.py > oracle-cases.json
node node_modules/typescript/bin/tsc --outDir build
node build/core/test/oracle/differential.js
node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("test-results.json","utf8"));if(r.numFailedTests||r.numPassedTests!==53)process.exit(1);fs.writeFileSync("environment-evidence.json",JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,os:require("node:os").release(),npmCache:process.env.npm_config_cache,testsPassed:r.numPassedTests,typecheck:"passed",freshRuntime:true,freshDependencies:true},null,2))'
sha256sum packages/core/src/calculation.ts packages/core/test/calculation.test.ts packages/shared/src/bc-contract.ts packages/shared/test/bc-contract.test.ts packages/core/test/oracle/generate_cases.py packages/core/test/oracle/differential.ts > tested-sources.sha256
echo "INDEPENDENT_CORE_EVIDENCE=$run_root"
