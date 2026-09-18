#!/usr/bin/env bash
set -euo pipefail
# Windows 하네스의 runtime/npm 캐시/생성 코드에 의존하지 않는 회로 검사다.
repo_root=${1:?Provide the absolute repository path}
run_root=$(mktemp -d /tmp/drivacy-driving-independent-XXXXXXXX)
echo "INDEPENDENT_DRIVING_HARNESS=$run_root"
cd "$run_root"
mkdir -p runtime-download packages/midnight/managed
archive=node-v24.14.1-linux-x64.tar.xz
curl -fsS --connect-timeout 15 --max-time 180 "https://nodejs.org/dist/v24.14.1/$archive" -o "runtime-download/$archive"
curl -fsS --connect-timeout 15 --max-time 60 https://nodejs.org/dist/v24.14.1/SHASUMS256.txt -o runtime-download/SHASUMS256.txt
(cd runtime-download; awk -v a="$archive" '$2==a' SHASUMS256.txt > selected.sha256; test -s selected.sha256; sha256sum -c selected.sha256; tar -xJf "$archive")
export PATH="$run_root/runtime-download/node-v24.14.1-linux-x64/bin:/usr/bin:/bin"
export npm_config_cache="$run_root/npm-cache"
export npm_config_userconfig="$run_root/fixture.npmrc"
cp "$repo_root/tsconfig.base.json" .
cp -R "$repo_root/packages/shared" "$repo_root/packages/core" packages/
cp -R "$repo_root/packages/midnight/src" "$repo_root/packages/midnight/test" packages/midnight/
mkdir -p packages/midnight/probe
cp "$repo_root/packages/midnight/probe/driving-fixtures.ts" packages/midnight/probe/
cp "$repo_root/contracts/driving-state.compact" .
/root/.local/bin/compact compile +0.31.1 --skip-zk driving-state.compact packages/midnight/managed/driving-state
cat > package.json <<'JSON'
{"name":"drivacy-driving-independent","private":true,"type":"module","dependencies":{"@midnight-ntwrk/compact-runtime":"0.16.0","zod":"4.6.5"},"devDependencies":{"typescript":"7.0.2","vitest":"5.0.1","@types/node":"24.13.5"}}
JSON
cat > tsconfig.json <<'JSON'
{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noUncheckedIndexedAccess":true,"skipLibCheck":true,"rootDir":"packages","types":["node"]},"include":["packages/**/*.ts"]}
JSON
npm install --ignore-scripts --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run packages/core/test packages/shared/test packages/midnight/test --reporter=default --reporter=json --outputFile=test-results.json
python3 packages/core/test/oracle/generate_cases.py > oracle-cases.json
node node_modules/typescript/bin/tsc --outDir build
node build/core/test/oracle/differential.js
node -e 'const fs=require("node:fs"); const r=JSON.parse(fs.readFileSync("test-results.json")); if(r.numFailedTests||r.numPassedTests!==102)process.exit(1); fs.writeFileSync("environment-evidence.json",JSON.stringify({node:process.version,platform:process.platform,testsPassed:r.numPassedTests,freshRuntime:true,freshDependencies:true,freshNpmCache:true,zkKeysGenerated:false},null,2))'
sha256sum driving-state.compact packages/midnight/src/*.ts packages/midnight/test/*.ts > tested-sources.sha256
echo "INDEPENDENT_DRIVING_EVIDENCE=$run_root"
