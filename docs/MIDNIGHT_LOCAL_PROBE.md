# C 2단계: 실제 Compact·증명·로컬 체인 경로

작은 상태 전이 계약으로 실제 도구 연결을 먼저 확인한다. 이후 보험 산식과
Merkle를 연결할 때 계산 오류와 환경 연결 오류를 구분할 수 있기 때문이다.

## 고정한 기술 검증 조합

공식 `midnightntwrk/create-mn-app`의 hello-world 템플릿
`bdc86733d2a9d2e381cb050aec4fdde7b33559b4`를 참고했다.

| 구성 | 버전 |
| --- | --- |
| Compact compiler | 0.31.1 |
| Compact runtime | 0.16.0 |
| onchain-runtime-v3 | 3.0.0 (override로 단일 버전 고정) |
| Midnight.js | 4.1.1 |
| Wallet SDK | 1.2.0 |
| 로컬 node | 1.0.0 |
| indexer-standalone | 4.3.3 |
| proof-server | 8.1.0 |

이 조합은 로컬 기술 검증용이다. Preprod 검증이나 실제 가입자 월렛 연결을
완료했다는 뜻이 아니다. 실제 Rule·State·Dataset의 해시/회로 인코딩은
후속 회로 구현에서 별도로 고정한다.

실제 첫 갱신에서 `expected instance of StateValue`가 발생했다. npm이
Compact runtime의 `^3.0.0`에는 onchain-runtime 3.1.1을, Midnight.js
protocol에는 정확히 3.0.0을 설치해 두 WASM 런타임 객체가 섞였다.
하네스는 protocol의 3.0.0으로 override하고 npm dedupe를 실행한다.
같은 버전의 중복 설치도 서로 다른 WASM 클래스를 만들 수 있으므로,
배포 전에 Compact와 protocol의 StateValue 클래스가 동일한지 확인한다.
버전 선언만으로 호환성을 판단하지 않고 실제 상태 갱신으로 재검증한다.

## 실제 검증 결과 — 2026-09-17

새 임시 폴더에서 `./scripts/check-midnight-local.ps1` 전체 실행이 성공했다.
Compact 전체 컴파일과 strict TypeScript 검사 후 세 로컬 서비스가 healthy였고,
계약 배포와 두 상태 갱신 모두 `SucceedEntirely`로 체인에 반영됐다.
revision 2와 두 번째 커밋먼트를 indexed 상태에서 확인했다. 오래된 상태 요청은
거부됐고 proof 요청·체인 제출 횟수가 증가하지 않았으며 ledger도 그대로였다.
계약 재연결도 성공했다. 실제 계약 proof 요청 3회, 계약 트랜잭션 제출 3회다.

공개 트랜잭션 ID·블록·검증 결과는
[실행 증거](evidence/midnight-local-probe-2026-09-17.json)에 보관한다.
이 증거는 로컬 `undeployed` 실행이며 Preprod·브라우저·보험 계산 증명이 아니다.
독립 Codex 검토에서도 이 기술 검증 범위에 치명적인 문제는 확인되지 않았다.

## 실행

Windows Node.js 24, npm, Docker Desktop Linux engine, WSL2가 필요하다.
기본 WSL 배포판은 `midnight-ubuntu`이며 해당 배포판에 Compact CLI와
compiler 0.31.1이 `/root/.local/bin/compact`를 통해 설치돼 있어야 한다.
패키지·Docker 이미지 설치에 인터넷이 필요하다.

```powershell
# 실제 proving/verifying key까지 컴파일하고 SDK 타입 검사
./scripts/check-midnight-local.ps1 -CompileOnly

# 컴파일 + 타입 검사 + 로컬 서비스 + 실제 배포/상태 전이
./scripts/check-midnight-local.ps1

# 다른 WSL 배포판을 사용할 때
./scripts/check-midnight-local.ps1 -WslDistribution <배포판명>

# 로컬 서비스 중지 (체인 데이터 삭제 명령 아님)
docker compose -f infra/midnight/local-probe.yml stop
```

하네스는 출력된 `MIDNIGHT_PROBE_HARNESS` 임시 폴더에서 실행한다.
저장소 루트 workspace와 lockfile을 만들지 않는다. `probe-evidence.json`에는
검증 단계, 공개 계약 주소·트랜잭션 정보와 성공/실패 결과를 남긴다.
로컬 서비스는 localhost 9945·8089·6301을 사용하므로 기존 서비스와 충돌하면
그 서비스를 임의로 종료하지 말고 실행 구성을 조정해야 한다.

## 확인하는 것과 한계

- `state-probe.compact`를 실제 컴파일한다. 현재 커밋먼트와 일치하는 이전
  커밋먼트를 받아 신규 커밋먼트로 바꾸고 revision을 증가시킨다.
- 공개된 로컬 genesis 테스트 계정으로 실제 개발 월렛을 초기화한다.
  가입자 키를 읽거나 저장하지 않는다.
- node/indexer/proof-server의 접근 가능 여부를 먼저 확인한다. 실제 계약
  proof 요청의 성공 횟수와 체인 반영 후 indexed 상태를 확인한다.
- 계약을 배포하고 두 차례 상태 갱신 후 revision 2와 신규 커밋먼트를
  확인한다. 오래된 이전 상태는 제출 전 회로 실행에서 거부되고 상태가
  바뀌지 않았는지 확인한다. 이후 기존 계약에 재연결한다.
- 커밋먼트는 임의의 테스트 바이트다. 보험 산식, 원본→Merkle 연결,
  승인 Rule, 비공개 opening, 가입자 권한, nullifier를 증명하지 않는다.
  공개된 커밋먼트를 아는 사람이 갱신할 수 있는 기술 검증 계약이므로
  보험 업무용 계약이나 인증 장치로 사용하지 않는다.
- 실패한 proof를 체인에 제출해 verifier의 거부를 확인하는 검사는 아니다.
  실제 보험 회로의 변조·실패 검사는 후속 구현 범위다.

Midnight Expert의 compact-cli, devnet, verify-by-devnet 스킬을 참고해
전체 컴파일과 인프라 상태 확인 후 E2E 실행을 구분한다. Expert MCP는
현재 등록된 Agent가 없어서 도구의 독립 Agent 검토가 실행되지는 않았다.

재사용한 템플릿의 출처와 Apache-2.0 라이선스는
`third_party/create-mn-app/`에 보존했다.
