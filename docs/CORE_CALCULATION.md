# C 3단계: 누적 Core 계산

작성일: 2026-09-18 (KST)

`packages/core/src/calculation.ts`의 `calculateTrip`은 기존 B↔C 요청을 검증하고
이전 확정 State의 누적값에 이번 운행 기록을 합산한다. 승인 Rule의 감점값·거리와
점수 기준·할인율을 읽는다. 중간 연산은 BigInt, 출력은 계약의 정수 범위를 따른다.

## 이전 기록이 이어지는 구조와 책임

사용자는 이전 누적 State와 체인 이력을 다음 운행으로 계속 연결한다는 의미를
확인했다. 증명 제출·확정 또는 할인 신청으로 점수·누적 거리·이벤트를 초기화하지
않는다. 같은 Scope/Rule의 다음 운행은 직전 확정 State에서 이어진다.

- C: 누적 계산, 이전/신규 State 커밋먼트의 증명·체인 연결, 반영 확인.
- B: DB의 확정 State와 확인 이력 보존, 조건부 상태 확정, 원본 삭제·복구 운영.
- 원본 records는 기존 합의대로 실제 체인 반영 확인 후 삭제한다. 비공개 누적
  State/opening과 최소 확인 이력은 다음 전이와 최종 검증에 필요하므로 유지한다.
  Core 계산 함수는 저장·삭제를 수행하지 않는다.

## 입력과 출력

입력은 공유 `CalculateTripRequestSchema`다. Scope, Rule ID/Version/Hash,
adapter/network/execution 및 이전 확인 결과의 연결, 이전 집계와 점수의 일관성,
기록 순서·수집 활성화·정수 범위를 검사한다. 스키마 검사 자체는 권한 확인이나
실제 체인 등록/최신 상태 확인이 아니다. 인증된 B 입력과 후속 체인 어댑터가 필요하다.

출력 `TripCalculation`은 `kind: calculation`이다.

| 필드 | 내용 |
| --- | --- |
| 작업 정보 | contractVersion, execution, operationId, idempotencyKey, tripId |
| 이전 연결 | previousStateCommitment |
| next | Scope·Rule 참조, version/tripCount +1, 누적 집계, 점수·조건 충족·예상 할인율 |
| explanation | 이전/신규 점수·증감, 이번 운행 집계와 항목별 감점, Rule Version |

이 출력에는 Dataset Root·신규 State salt/commitment를 만들지 않는다.
`BCAdapter.calculateTrip`이 요구하는 완전한 `CandidateState`는 후속 실제
Merkle/커밋먼트 어댑터가 이 계산에 필요한 값을 연결해 조립한다. 확정 상태나
체인 성공을 계산만으로 만들어 내지 않는다. 재시도 계산은 같은 입력에 같은 결과를
반환하지만, 작업 중복 접수·DB claim·체인 재제출 방지는 B와 체인 어댑터의 책임이다.

오류는 `INVALID_INPUT`, `RULE_NOT_READY`, `NUMERIC_RANGE_EXCEEDED`의
`CoreCalculationError`로 반환하며 자동 재시도하지 않는다. 원본·salt가 들어간
입력 검증 상세값을 오류 메시지에 넣지 않는다. 누적 metrics/version은 uint32,
설명용 각 가중 감점은 JavaScript 안전 정수 범위로 제한한다.

## 데모 Rule과 계산

`createDemoRule`은 Rule 식별자를 받아 임시 데모 값을 생성한다. 승인·체인 등록을
수행하지 않는다. 초기 100점에서 누적 과속·급가속·급제동 ×2·1·3을 차감하고
0점 하한을 적용한다. 누적 500000m·80점 이상이면 1000bp, 90점 이상이면 1200bp다.
조건 판정에는 표시용 반올림을 사용하지 않는다.

첫 운행 300000m·10800초·이벤트 2/1/1은 92점·거리 미충족이다. 다음 운행
250000m·9000초·1/0/1을 이어 계산하면 누적 550000m·19800초·3/1/2,
87점·조건 충족·예상 1000bp다. 예상 할인율과 보험사의 실제 적용 결정은 별개다.

## 검증

```powershell
./scripts/check-core.ps1
```

Node.js 24·npm을 사용한다. 새 임시 폴더에서 고정한 Zod/TypeScript/Vitest로
strict 타입 검사와 Core 및 공유 계약 테스트를 실행하고 `test-results.json`을 남긴다.
기존 npm 캐시를 우선 사용하며 캐시가 부족하면 패키지 다운로드가 필요하다.
루트 workspace/lockfile, 서비스 데이터, LLM·월렛·체인 요청을 사용하지 않는다.

순차 누적 테스트의 confirmed State·hash·Root·블록은 합성 fixture다. Core의
첫 출력에 테스트 전용 확인 정보를 붙여 다음 요청으로 이어가는 것으로 계산
연속성을 검증하며 실제 보험 회로/체인 확인을 수행한 것으로 표시하지 않는다.

2026-09-18 Node.js 24.14.1·npm 11.11.0의 새 임시 하네스에서 strict 타입 검사와
Core 27개·공유 계약 26개, 총 53개 테스트가 통과했다. 두 운행 연결, 정확한
거리/점수 경계, 0점 하한 이후 누적 유지, Rule 값 교체, 여러 기록 합산,
입력 불변성·결정성, 잘못된 입력/Rule, 누적·버전 및 설명 감점 범위를 확인했다.
[검증 요약과 테스트한 소스 SHA256](evidence/core-calculation-2026-09-18.json)을 보관한다.

독립 Codex 서브에이전트가 누적 산식·경계값·정수 범위·입력/출력 경계를
검토했고, 이 구현 범위에서 치명적인 문제는 확인되지 않았다.

## 다른 실행 환경의 디버깅

Windows 임시 폴더 검사는 같은 호스트 런타임·캐시를 사용했다. 사용자 지시로
Linux 별도 런타임과 비어 있는 npm 캐시에 새 의존성을 설치해 추가 검증한다.
같은 PC의 WSL2를 사용하며 파일은 `/tmp`에 복사한다. Windows node_modules나
npm 캐시를 공유하지 않는다. 공식 Linux Node 바이너리의 SHA256을 확인한다.

```powershell
$coreRepoLinux = (wsl -d midnight-ubuntu -- wslpath -a -u ($PWD.Path.Replace('\', '/'))).Trim()
wsl -d midnight-ubuntu -- bash "$coreRepoLinux/scripts/check-core-linux.sh" "$coreRepoLinux"
```

`packages/core/test/oracle/generate_cases.py`는 Core 소스와 기존 테스트 계산을
참고하지 않고 명세로 작성한 Python 정수 기준 계산이다. TypeScript 실행 결과와
누적 집계·점수·조건·할인율·설명을 대조하고, 입력 불변성·반복 결과·잘못된 입력
거부도 확인한다. 각 단계는 실패하면 중단하고 Linux 임시 폴더에 증거를 남긴다.
패키지와 Node 바이너리를 새로 내려받으므로 인터넷이 필요하다.

2026-09-18 실제 Linux x64/WSL2 실행에서 strict 타입 검사와 기존 테스트 53개가
통과했다. 별도 에이전트가 명세에서 작성한 Python 기준 계산과 332개 사례의
next/explanation이 일치했고, 잘못된 입력 15개를 거부했다. 24개 연속 운행 체인,
정확한 거리/점수 경계, 최대 1024개 기록, uint32·안전 정수 경계도 포함한다.
[독립 환경 실행 증거](evidence/core-linux-independent-2026-09-18.json)를 보관한다.

새 검증 러너의 Node 타입 설정 누락과 uint32 입력 초과 오류코드의 기대값을
보완한 뒤 새 Linux 환경에서 전체 실행을 통과했다. 오류코드 기대값 변경은
입력 거부를 유지하며 산식 비교에는 영향을 주지 않는다. Core 구현은 수정하지
않았고 테스트한 SHA256이 Windows 검증의 구현과 같음을 확인했다. 이 검사
범위에서 Core 계산 버그는 발견되지 않았다. 별도 물리 장비나 실제 보험 회로
검증을 수행한 것으로 표현하지 않는다.
