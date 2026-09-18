# B↔C 내부 연결 계약 v1

작성일: 2026-09-17 (KST)

2026-09-18 C의 순수 계산 구현은 [CORE_CALCULATION.md](CORE_CALCULATION.md)를
따른다. root/commitment가 없는 `TripCalculation`을 반환하며 이 계약의 완전한
`CandidateState` 조립은 실제 Merkle/커밋먼트 어댑터 단계에서 연결한다. 누적
State·체인 이력은 다음 운행으로 유지하고, B가 반영 확인 후 원본만 삭제한다.

2026-09-18 C 4단계의 실제 타입 인코딩·persistent Merkle·회로 연결 규격은
[STATE_TRANSITION_PROOF.md](STATE_TRANSITION_PROOF.md)를 따른다. 어댑터는
`TripCalculation`에 실제 Root·State salt/commitment를 연결해 `CandidateState`를
조립한다. 아래의 초기 프로파일/구현 전 표현은 당시 기록이며 실제 인코딩은
4단계 규격을 우선한다. 공유 스키마와 외부 업무 API는 변경하지 않는다.

사용자가 채택한 임시 산식·단위·공개 범위·재신청·재시도·실패 보관 기준을 반영한 1단계 결과다. 내부 필드 이름과 검증 기준은 [Zod 스키마와 TypeScript 타입](../packages/shared/src/bc-contract.ts)이 기준이다. B와 A는 이 계약을 연결 검토에 사용하며 공유 파일 변경은 기존대로 B가 조정한다. 다른 개발자의 검토·실제 서비스 통합 완료를 의미하지 않는다.

외부 REST API의 경로·HTTP 상태·오류 형식을 새로 정하는 문서가 아니다. B가 최종 외부 명세와 내부 계약을 연결한다. DB·Core 계산·Merkle 해시·Compact·SDK·월렛·체인 구현은 후속 단계다. 스키마 통과는 인증·인가나 증명·체인 검증 성공을 뜻하지 않는다.

## 책임과 호출 경계

| 흐름 | B의 입력·책임 | C의 출력·책임 |
| --- | --- | --- |
| Rule 등록 | 담당 보험사의 수정·승인본과 버전. 승인·접근권한 검사 및 저장 | 정해진 직렬화의 Rule Hash, 체인 등록 결과. 등록 실패·대기를 사용 가능으로 표시하지 않음 |
| 운행 계산 | 인증된 가입자·계약·특약·평가기간, 등록된 승인 Rule, 이전 확정 State, 수집 활성화 모의 기록 | 후보 State, 가입자용 계산 설명, Dataset Root·State 커밋먼트 |
| 증명·상태 전이 | 작업 claim, 후보 저장, 월렛 승인 결과 연결, 재시도·상태 조회 | 최신 체인 이전 상태 검사, 실제 증명·제출·반영 확인. 작업과 이전/신규 상태에 연결된 결과 |
| DB 확정·원본 삭제 | 체인 확인 결과의 연결 일치 검사, DB 트랜잭션·이전 상태 조건부 갱신, 삭제·복구 | 체인 결과 재조회. 체인 성공 작업을 다시 제출하지 않고 동일 결과 반환 |

호출 인터페이스의 타입은 `BCAdapter`에 정리했다. 아직 구현체는 없다. 모든 요청의 `contractVersion`은 `bc-v1`이다. 내부 ID는 1~256자이며 사용자로부터 받은 소유권 주장 대신 B가 권한 검사 후 채운다.

## Rule

`ApprovedRule`는 `approval: approved`와 `rule`로 구성한다. 승인 메타데이터의 진위·보험사 권한은 B가 검사한다. `RegisteredRule`에는 추가로 `registration: chain-confirmed`, `ruleHash`, `adapterProfile`, `network`, `chainContractAddress`, `registrationTransactionId`가 필요하다. C의 실제 등록 결과를 받아 B가 저장한다. 초안·등록 대기·실패는 운행 계산 요청에서 받지 않는다.

| Rule 필드 | 의미 | 임시 Rule v1 |
| --- | --- | --- |
| `id`, `version`, `insurerId`, `endorsementId` | 규칙·버전·보험사·특약 연결 | 데모 식별자, 버전 1 |
| `formula`, `initialScore` | 지원 산식 식별자와 시작 점수 | `cumulative-event-deduction-v1`, 100 |
| `speedingPenalty`, `accelerationPenalty`, `brakingPenalty` | 이벤트 1회당 감점 | 2, 1, 3 |
| `minimumDistanceM`, `minimumScore` | 할인 조건 | 500,000m, 80점 |
| `premiumMinimumScore` | 높은 할인 구간 시작 | 90점 |
| `baseDiscountBps`, `premiumDiscountBps` | 예상 할인율, 100bp=1% | 1000bp, 1200bp |

승인 버전은 수정하지 않는다. 새 승인본에는 새 버전을 부여한다. 한 평가 State의 누적 계산에는 동일 Rule 버전을 사용하며 버전 전환·과거 재계산을 편의상 수행하지 않는다. 이후 실제 약관 산식으로 교체할 때 필드·산식 식별자를 함께 검토한다.

`serializeRule`은 필드 순서를 고정한 JSON 배열을 반환한다. 문자열은 JSON escaping을 그대로 사용하고 결과를 UTF-8 바이트로 전달한다. 단위·도메인 구분 문자열도 포함하며 승인 시각·승인자·생성 해시는 제외한다. 키 순서가 다른 동일 Rule도 동일 직렬화가 된다. 정확한 배열 순서는 코드와 테스트의 고정 예시가 기준이다.

해시·커밋먼트 문자열은 **SDK 어댑터가 반환하는 불투명 값**이다. `adapterProfile`이 해시 함수·바이트/field 인코딩·Merkle 구성·네트워크 계약 조합을 식별한다. 실제 프로파일은 2단계의 작은 계약에서 실행 후 고정한다. 지금 일반 해시를 생성해 Compact 호환 Rule Hash라고 표시하지 않는다. 프로파일 변경은 관련 규칙·상태·회로 계약 변경으로 다룬다.

## Scope와 운행 입력

`Scope`는 `applicantId`, `contractId`, `insurerId`, `endorsementId`, `evaluationPeriod`다. 평가기간은 `id`, `startDate`, `endDate`의 날짜 단위이며 시작일이 종료일보다 늦으면 거부한다. 평가기간은 정확한 개별 운행시각과 구분한다. 기간 배정과 계약 자격은 B가 검사한다.

`CalculateTripRequest`는 다음 필드를 모두 받는다.

| 필드 | 의미 |
| --- | --- |
| `execution` | `fixture` 또는 `live`. 실제 어댑터와 테스트를 구분하며 서로 섞지 않음 |
| `operationId`, `idempotencyKey` | B가 저장한 동일 작업·요청 식별자. 재시도에도 동일하며 내용 변경 요청에 재사용하지 않음 |
| `scope`, `approvedRule` | 권한 검사된 업무 범위와 체인 등록된 동일 승인 Rule |
| `previous` | C의 체인 확인에 연결된 이전 확정 State. 최초에는 실제 초기화된 genesis State |
| `trip` | 아래의 처리 영역 전용 모의 운행 입력 |

`Trip`은 `id`, `source: simulated`, `collectionEnabled: true`, `records`, `datasetSalt`다. records는 1~1024개의 모의 구간 집계 기록이며 `index`는 0부터 연속이다. 기록당 `distanceM`, `durationSeconds`, `speedingCount`, `accelerationCount`, `brakingCount`를 받는다. 모의 이벤트 횟수는 fixture 입력이며 실제 속도에서 이벤트를 탐지했다고 주장하지 않는다.

거리·시간·횟수·버전은 0~2^32−1의 정수다. 누적 합이나 다음 버전이 이 범위를 넘으면 거부한다. 이는 첫 계약의 정수 표현 범위이며 보험 가입·운행 한도라는 사업 정책이 아니다. 부동소수점·음수·문자열 숫자를 변환해서 받지 않는다. score는 0~100, 할인율은 0~10,000bp 정수다. 설명용 감점값은 JavaScript 안전 정수 범위에서 표현한다.

원본은 B의 비공개 Storage에서 C의 계산·증명 처리 영역으로만 전달한다. 위 입력 전체를 DB·일반 로그·Cloud Tasks 메시지에 복제하지 않는다. 작업 메시지에는 작업 ID만 담는다. 승인 Rule·이전 집계 State·처리 메타데이터는 권한 제한된 업무 DB에 보관할 수 있다.

## Dataset과 State

`serializeDatasetRecord`는 도메인 문자열·운행 ID·모의 입력 표시·수집 활성화·기록 순번·다섯 집계값·Dataset salt를 고정 순서로 직렬화한다. C는 **그 기록을 실제 계산에도 사용**하고 leaf와 Merkle 제약을 연결한다. 순번을 정렬·삭제하거나 별도 집계값으로 바꾸지 않는다. Merkle의 실제 해시·padding·경로 표현은 2단계 어댑터 프로파일에 고정한다.

`datasetRoot`는 해당 상태 전이에서 처리한 **이번 운행 records의 Root**다. genesis는 어댑터의 빈 Dataset Root를 사용한다. 이전 운행은 이전 State 커밋먼트와 순차 전이로 연결한다. 이 값을 모든 과거 기록을 포함한 단일 Merkle Root로 설명하지 않는다.

Dataset/State salt는 각각 32바이트의 소문자 hex다. 실제 경로에서는 암호학적 난수로 만들고, 같은 작업 재시도에는 저장한 값을 재사용한다. 예시 테스트의 고정 salt는 실제 생성값으로 사용하지 않는다. Dataset salt·기록은 원본 처리 영역에서 함께 정리하며 `stateSalt`는 최종 상태의 검증·공개 결과 연결에 필요한 비공개 상태 opening으로 보관한다. salt는 보험사 결과·공개 원장·로그에 포함하지 않는다.

| State 필드 | 의미 |
| --- | --- |
| `scope`, `rule` | 사용자·계약·특약·기간과 Rule ID/Version/Hash 연결 |
| `version`, `tripCount` | genesis는 모두 0. 체인 확인된 한 운행마다 각각 1 증가 |
| `totals` | 누적 거리·시간·과속·급가속·급제동 횟수 |
| `score`, `conditionsMet`, `expectedDiscountBps` | 승인 Rule로 계산된 결과. 실제 보험사 적용 결정과 별개 |
| `datasetRoot`, `stateSalt`, `stateCommitment` | 이번 Dataset과 비공개 누적 State의 연결 |

`serializeState`는 Scope·Rule·버전·누적 집계·결과·Dataset Root·State salt를 고정 순서로 포함하고 자기 자신인 `stateCommitment`는 제외한다. C의 실제 회로는 이 opening과 커밋먼트, 최신 이전 상태, 새 계산 관계를 연결해야 한다.

`previous.kind`는 `confirmed`이고 연결된 `confirmation`이 필요하다. `candidate.kind`는 `candidate`이며 그 자체로 DB 확정·신청할 수 없다. 최초 State도 실제 체인 초기화 확인 없이 확정됐다고 만들지 않는다. 모의 confirmed State는 `fixture`로만 표시한다.

## C의 후보 출력과 처리 결과

`CandidateState`에는 신규 State, `operationId`, `tripId`, `previousStateCommitment`, `explanation`이 있다. 설명에는 이전·신규 점수·증감, 해당 운행 집계, 항목별 가중 감점, Rule Version을 담는다. 점수 하한 때문에 감점 합과 실제 점수 증감은 다를 수 있다. C는 입력 기록 합과 이전 누적값에서 신규 집계를 계산하고 Rule 조건에 따라 결과를 만든다.

모든 `TripProcessingResult`는 `contractVersion`, `execution`, `operationId`, `tripId`, `status`를 갖는다.

| status | 추가 필드 | B 처리 |
| --- | --- | --- |
| `calculated` | `candidate` | 후보·계산 근거 저장. 확정·삭제 금지 |
| `proving` | 없음 | 진행 상태만 갱신 |
| `awaiting-wallet-approval` | `approvalRequestId` | 가입자 승인 대기. worker/HTTP 요청을 장시간 열어 두지 않음 |
| `submitted` | `transactionId` | 접수·제출 상태. 반영 확인 전 확정·삭제 금지 |
| `chain-unknown` | `transactionId` | 체인 재조회. 새 제출·자동 원본 삭제 금지 |
| `chain-confirmed` | `candidate`, `confirmation` | 아래의 확정 조건 검사 후 DB 트랜잭션으로 확정 |
| `failed` | `error` | 이전 확정 상태 유지·원본 보관. 오류에 따라 재시도 |

`confirmation`에는 실행 구분·네트워크·어댑터 프로파일·계약 주소·트랜잭션 ID·블록 ID·관찰 시각과 작업 ID·이전/신규 State 커밋먼트·Rule Hash·Dataset Root가 필요하다. `observedAt`는 체인 확인 시각이며 정확한 운행시각이 아니다.

`canFinalizeState(result, request)`는 연결 일치 검사를 제공한다. B는 **인증된 내부 C 어댑터**의 실제 조회 결과에만 이를 사용한다. 사용자가 보낸 `chain-confirmed` JSON을 검증 근거로 받아서는 안 된다. 스키마와 문자열 일치만으로 트랜잭션 존재·증명 유효성이 증명되지는 않는다.

1. `live`의 `chain-confirmed`이고 작업·운행·Scope·Rule이 요청과 일치한다.
2. 네트워크·어댑터·계약 주소와 이전/신규 커밋먼트·Dataset Root가 일치한다.
3. 신규 버전·운행 수는 각각 이전 +1이다. 실제 계산·증명 관계는 C의 회로 검증이 책임진다.
4. B가 같은 작업을 소유하고 DB 이전 State가 요청 당시 확정 State와 동일하다. 조건부 갱신과 작업 완료를 한 DB 트랜잭션으로 처리한다. 이는 이 스키마가 구현하지 않는다.
5. 체인 성공 후 DB 저장 실패 시 신규 상태·확인 증거·작업 정보를 재사용해 DB 반영을 복구한다. 원본 삭제 시점까지 복구용 비공개 신규 State/opening을 확보한다. 체인 작업을 다시 제출하지 않는다.
6. 체인 반영 확인 후 원본 삭제를 별도 수행·기록하고, 삭제 실패를 재시도한다. 원본 삭제를 ZK가 입증한다고 표현하지 않는다.

## 오류·재시도·보관

내부 오류 코드는 `INVALID_INPUT`, `RULE_NOT_READY`, `STALE_STATE`, `PROOF_INVALID`, `APPROVAL_CANCELLED`, `TEMPORARY_FAILURE`, `RETRIES_EXHAUSTED`, `CHAIN_REJECTED`, `NUMERIC_RANGE_EXCEEDED`다. B가 외부 명세의 HTTP/오류 코드로 매핑하며 이 목록이 외부 API 계약을 바꾸지 않는다. 원본·시드·키가 섞일 수 있는 SDK 오류 문자열을 결과에 그대로 넣지 않는다.

자동 재시도 가능한 `retryable: true`는 `TEMPORARY_FAILURE`뿐이다. 최초 시도 외 3회, 1·5·15분 간격으로 재시도한다. 제출 이후 오류는 트랜잭션 상태를 먼저 조회한다. `STALE_STATE`는 이전 상태 재조회·후보 재계산이 필요한 상태이며 기존 증명의 무조건 재제출 대상이 아니다. 월렛 취소·입력/증명 무효는 자동 재시도하지 않는다. 체인 결과 불명은 `failed`로 단정하지 않는다.

자동 재시도 소진 뒤 체인 미반영·실패가 확인된 원본은 그 확인 시점부터 최대 7일 수동 재처리용으로 보관한 뒤 삭제한다. B가 만료와 재처리 불가를 안내한다. 체인 결과 불명 작업은 먼저 상태를 확인한다. 성공 원본은 신청 때까지 보관하지 않고 운행별 체인 반영 확인 후 정리한다.

2026-09-18 C 제어기는 허용한 세 번의 재시도 후 제출 전 오류를 `RETRIES_EXHAUSTED`/`retryable: false`로 종료한다. C 전체 journal에 제출 intent가 하나도 없음을 확인할 때만 B가 pending 작업을 `abandoned`로 바꿔 다음 운행을 허용한다. 원본 보관·만료 안내와 7일 삭제 스케줄러는 이 내부 서비스에 구현됐다고 주장하지 않는다.

## 공개 결과와 최종 신청 연결

가입자 설명에는 운행별 집계·점수 변화 이유를 제공한다. 보험사 결과는 정확한 최종 점수·거리(m), 평가기간, 조건 충족, 예상/적용 할인율, Rule Version/Hash, 검증 결과, 트랜잭션 ID다. 업무 ID·상태 opening 전체를 공개 결과로 직렬화하지 않는다. 화면만 km 소수 첫째 자리로 표시하며 판정은 정확한 m를 사용한다.

공개 원장에는 Rule Hash·Dataset/State 커밋먼트·중복 방지 값 등 실제 검증에 필요한 최소 정보만 사용한다. 정확한 점수·거리·기간·개인정보는 비공개 State opening에 두고, 보험사에 전달한 결과가 검증된 State와 연결되는 경로를 후속 최종 검증 구현에서 제공한다. 공개 회로의 구체 필드·연결 증거는 실제 계약에서 확인한다.

최종 신청은 같은 Scope의 최종 확정 State와 검증 연결정보를 사용하며 과거 운행 원본을 다시 요구하지 않는다. 동일 신청자·계약/특약·평가기간·Rule/확정 State 버전은 동일 평가 결과다. B는 동일 결과에 기존 신청을 반환하고 C는 재시도에도 동일 nullifier를 사용한다. 심사 중·적용 완료는 추가 신청을 막고, 미적용 후 새 운행으로 점수가 바뀌며 조건을 충족한 새 확정 State는 재신청을 허용한다. 6단계의 nullifier/결과 opening 구현과 검증 범위는 [FINAL_EVALUATION.md](FINAL_EVALUATION.md)를 따른다. B의 운영 신청·보험사 결정 상태는 별도 구현 범위다.

## 검증·인계

`scripts/check-bc-contract.ps1`은 임시 폴더에 소스를 복사하고 고정한 Zod·TypeScript·Vitest 버전으로 타입 검사와 테스트를 실행한다. npm 패키지 설치를 위한 인터넷은 필요하지만 서비스 키·LLM 호출·체인 요청은 사용하지 않는다. 저장소의 서버 설정·workspace·lockfile은 변경하지 않는다. 출력된 임시 폴더에는 실행 증거와 의존성이 남는다.

```powershell
./scripts/check-bc-contract.ps1
```

검증 대상은 두 운행의 입출력 예시, 고정 직렬화, 입력 범위·초안/미등록 Rule 거부, Scope/Rule 불일치, 테스트/실제 구분, 확인 이전 상태의 확정 차단, 작업·커밋먼트·네트워크 불일치다. 예시 hash·Root·블록·트랜잭션은 모두 합성값이며 실제 계산·증명·체인 성공 증거가 아니다.

2026-09-17 Node.js 24.14.1·npm 11.11.0의 독립 하네스에서 TypeScript 타입 검사와 Vitest 계약 테스트 26개가 통과했다. Codex 서브에이전트의 독립 요구사항·계약 검토에서도 이번 1단계 범위의 치명적인 불일치는 확인되지 않았다. 이 검토는 실제 SDK·회로·네트워크 검증을 포함하지 않는다.

B에게 전달할 검토 범위는 이 문서와 `packages/shared/src/bc-contract.ts`다. B는 객체 권한·작업 claim·DB 조건부 확정·외부 명세 매핑을 연결하고, C는 2단계에서 실제 어댑터 프로파일과 초기화/체인 확인 경로를 구현한다. B 또는 A의 검토 완료를 현재 주장하지 않는다.

## C 5단계 구현 연결 — 2026-09-18

기존 처리 상태 스키마를 사용하는 C의 `TripJob`과 승인 인터페이스·작업 ID만으로
조회하는 `getTripStatus`를 추가했다. 실제 SDK 제출 전 거래 ID 기록, 결과 불명
복구와 확정 결과 재조회 기준은 [월렛 승인·작업 제어](WALLET_APPROVAL_JOBS.md)를
따른다. 공유 스키마와 B의 업무 API/DB는 변경하지 않았다. 로컬 실행기의 개발자
승인·파일 journal 검증과 가입자 UI·운영 분산 저장소 통합을 구분한다.
