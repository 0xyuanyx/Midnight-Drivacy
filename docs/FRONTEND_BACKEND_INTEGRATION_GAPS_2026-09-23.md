# 프론트·백엔드·Core 통합 구현 과제 (2026-09-23)

## 검토 기준과 결론

- 코드 기준: 원격 `origin/feat`의 `d83bd7f`와 A가 올린 `origin/frontend`의 `2c16f05`. 두 브랜치는 아직 합쳐지지 않았다. 요구사항 기준은 이번 대화에서 확정되어 로컬 `PROJECT_DIRECTION.md`에 기록된 2026-09-23 방향이다. 로컬의 미커밋 코드와 와이어프레임은 구현 완료 근거에 포함하지 않는다.
- A의 보험사 웹·가입자 모바일 화면은 실행 가능하지만 fixture와 로컬 상태로 움직인다. Backend에는 인증, 동의, 계약·특약, Rule, 운행, 처리, 최종 할인 신청의 HTTP API가 있다. **A 화면에서 이 API를 호출하는 연결은 아직 없다.**
- Core에는 Dataset/Merkle 구성과 누적 State 계산·회로가 있고 로컬 검증 근거가 있다. Backend의 C/Wallet HTTP 호출은 계약과 어댑터까지 구현됐으나, 그 요청을 실제로 처리할 외부 서비스와 가입자 월렛 승인 경로는 저장소에 없다. 따라서 화면에서 신청까지 이어지는 실제 종단 흐름은 미완성이다.
- `PROJECT_DIRECTION.md`의 2026-09-23 결정이 기준이다. 수집 시작 후 수집된 운행을 모두 누적 반영하고, 보험사에는 최종 누적 결과와 검증 근거만 제공한다. 수집 전 운행 누락이나 실제 운행·운전자·차량의 진위까지 증명한다고 표현하지 않는다.

## REST API 사용 현황

| 경계 | 확인한 구현 | 현재 연결 상태 |
| --- | --- | --- |
| A 화면 → Backend | A 웹은 `fixtureAdapter`/`localStorage`, 모바일은 `demoPolicies`·`demoTrips`와 reducer 사용 | 실제 REST 호출 없음 |
| Backend의 수신 API | Express에 `GET /auth/me`, `GET/POST /consent`, `GET /insurance-contracts`, `PUT /insurance-contracts/:id/special-contract-selection`, Rule 관리, `POST /driving-sessions`, `POST /driving-sessions/:sessionId/end`, `POST /driving-sessions/:sessionId/process`, 할인 신청·보험사 결정 API 등이 등록됨 | 라우트·서비스와 로컬 테스트 경계가 있음. A 제품 화면에서는 미사용 |
| Backend → C/Wallet | `C_WALLET_ADAPTER_URL` 기반 HTTP 요청으로 Rule 등록, 원본 source, 운행 처리, 최종 평가를 호출하도록 구성 | 호출 계약/클라이언트는 있으나 실제 수신 서비스·월렛 승인 연결 없음 |
| Backend → DB/Auth | `pg`로 업무 DB 접근, Supabase Auth로 access token 검증 | 브라우저의 업무 DB 직접 접근을 요구하지 않는 구조 |

즉, **REST API는 Backend에 구현돼 로컬 백엔드 테스트에서 호출되지만 A 프론트와의 실제 통신에는 아직 사용되지 않는다.** `GET /auth/me` 등은 A가 붙여야 할 경계다. Backend에 API가 있다는 사실만으로 DB·체인·월렛을 거치는 실제 제품 흐름이 검증된 것은 아니다.

## 먼저 구현해야 할 연결

| 구분 | 과제 | 현재 확인된 상태 | 완료 판정 |
| --- | --- | --- | --- |
| 연동 필수 | A 브랜치 통합과 공통 계약 정렬 | `frontend`와 `feat`가 별도. A의 화면 모델/ID/상태가 Backend 응답과 별개 | 프론트를 통합하고 `packages/shared` 및 실제 API 응답으로 양쪽 타입·상태를 맞춘다. fixture 모드와 실제 API 모드를 명확히 분리한다. |
| 연동 필수 | 가입자 인증·계약 선택 연결 | 모바일은 데모 계약과 로컬 동의/선택 사용. Backend는 bearer token, DRIVER 권한, 동의·본인 계약 API를 요구 | 검증된 로그인 사용자로 동의·본인 계약·특약을 조회/선택한다. 데모 계약을 신규 가입자의 실제 계약으로 자동 부여하지 않는다. |
| 연동 필수 | 보험사 계정과 Rule 흐름 연결 | 보험사 웹은 fixture 심사 데이터와 로컬 저장. Backend는 INSURER 역할과 Rule 작성·승인·등록 API를 제공 | 데모 보험사 계정이 유효한 Auth token/보험사 membership으로 로그인하고, 담당 보험사의 특약에 수동 입력 Rule을 저장·승인·등록한다. 승인 상태와 체인 등록 결과를 구분한다. |
| 연동 필수 | 운행 화면 → Session/처리 연결 | 모바일 시작·종료·두 운행 완료는 reducer와 `demoTrips`만 변경. Backend는 Session 시작/종료/처리 API를 제공 | 실제 세션 ID와 멱등키를 사용하고, 종료 후 처리 상태를 API에서 읽는다. `chain-confirmed` 전에는 확정 점수/누적 State로 표시하지 않으며, 실패·승인 대기·결과 불명·재시작 상태를 구분한다. |
| 연동 필수 | C/Wallet 실행 서비스 | Backend는 외부 HTTP adapter를 주입하지만 실제 수신 runtime과 사용자 월렛 승인 경로가 없음 | Rule 등록, source 보관/조회/삭제, Dataset 구성, 운행 증명·제출·상태 조회, Final Evaluation을 처리하는 서비스를 연결한다. 각 작업은 자신의 operationId를 재조회·재시도에 재사용하고, 필요한 사용자 승인을 거친 결과만 Backend에 전달한다. |
| 연동 필수 | Dataset과 확정 State의 실제 결합 | Core 구성·검증과 Backend DB/HTTP orchestration은 각각 존재하지만 동일 운행의 실제 연결 증거 없음 | 저장된 Session의 연속 `segment_index` 순서, salt, trip/Scope, 승인 Rule Version, 이전 **DB Confirmed State**로 Dataset leaf·Merkle root/path·새 State commitment를 만든다. C 계산값과 증명 public input, 체인 결과를 대조하고 `chain-confirmed` 뒤에만 DB를 갱신한다. 두 번째 운행은 첫 번째의 확정 State를 이전 State로 사용한다. |
| 합의 방향 구현 | 종료 운행 전부 반영하는 자동 흐름 | 수집 운행의 사후 선택 제외를 금지하기로 결정했지만, 종료된 모든 Session의 자동 처리/강제 반영은 연결되지 않음 | 수집된 각 종료 운행이 순서대로 처리·누적되며 사용자가 불리한 운행만 건너뛸 수 없게 한다. 체인 불명은 기존 operation을 조회한다. 안전 종료된 영구 실패 운행의 최종 평가 취급과 삭제 시점은 별도 결정 후 구현한다. |
| 연동 필수 | 최종 신청과 보험사 결정 연결 | 모바일 신청·승인은 로컬 상태. 보험사 웹의 `approved/rejected` 특약 요청과 Backend의 `APPLIED/REJECTED` 할인 적용 결정은 서로 다른 업무 | 모바일은 본인 계약·특약 ID만 `POST /discount-applications`에 보내고 서버의 최신 Confirmed State 기반 상태를 조회한다. 보험사 웹은 `VERIFIED`된 신청만 검토하고 해당 보험사의 담당자만 한 번 결정한다. 특약 요청 승인 화면은 별도 업무로 매핑하거나 실제 Backend 기능을 정의한다. |

별도 합의된 가입자 MVP UX인 이메일 6자리 코드, 기본 프로필 입력, 사용자별 기기 월렛 연결도 A 실행 앱에 아직 없다. 이는 인증/월렛 구현 과제이며 위 REST 연결만으로 달성되지 않는다. 보험사 Rule의 LLM/문서 변환이나 실제 GPS 수집은 현 해커톤 데모의 필수 구현으로 임의 추가하지 않는다.

## 데이터·운영 완성도 점검

- [ ] **Dataset 재현성:** 동일한 DB 원본·salt·순서·Rule·이전 State에서 같은 root/commitment가 생성되고, record 변경·누락·재정렬·다른 Scope/Rule/이전 State는 거부되는지 확인한다. 화면 숫자나 클라이언트가 보낸 점수를 신뢰하지 않는다.
- [ ] **누적 계산:** 예를 들어 확정된 첫 운행 300 km 후 두 번째 250 km면 다음 State의 거리는 550 km여야 한다. 점수는 승인 Rule과 누적 이벤트로 Core가 다시 계산해야 하며, 화면의 고정 점수로 대체하지 않는다.
- [ ] **원본 삭제:** 확정 후 외부 source만 삭제해서는 부족하다. 현재 `driving_sessions.dataset_salt`와 `driving_segments`에도 원본 정보가 남는다. DB·외부 source·증명 처리 저장소와 접근 가능한 사본의 삭제 기준, 재시도와 검증을 구현한다. 결과 commitment 및 필요한 누적 State는 유지한다.
- [ ] **신청 복구:** Final Evaluation 복구용 `20260923110000_add_final_evaluation_recovery_claim.sql`은 저장소에만 있다. 적용 대상 환경과 실제 DB schema를 맞춘 뒤 같은 operationId의 재조회·중복 방지를 검증한다. 이 문서 작업은 원격 migration을 실행하지 않는다.
- [ ] **권한·프라이버시:** 다른 가입자의 계약·Session·신청, 다른 보험사 신청/결정을 API에서 거부한다. 보험사 응답·로그·화면에 segment, 위치/경로, salt, owner secret, wallet key, witness가 노출되지 않는지 확인한다.
- [ ] **실패와 재시작:** 요청 중복, 응답 유실, 월렛 승인 거부, 체인 결과 불명, DB 확정 직후 프로세스 종료, source 삭제 실패 후 재시작을 확인한다. 제출 여부가 불명확한 동안 새 거래를 만들거나 원본을 지우지 않는다.
- [ ] **실제 데모 검증:** 서로 다른 DRIVER/INSURER 계정으로 A 앱 → Backend → DB → C/Wallet → 실제 검증 결과 → 보험사 결정까지 실행 기록을 남긴다. 로컬 fixture 테스트, 로컬 체인 증명, 원격 DB 적용, 브라우저/기기 E2E를 각각 구분해 보고한다.

## 병행 해결할 확인된 코드 문제

누락 구현과 별개로, 다음 두 흐름은 코드상 차단 조건이 확인된다. 운영 환경에서의 재현은 아직 하지 않았다.

- 안전 종료된 Session도 `driving_sessions_one_per_generation_state` 고유 인덱스에 남아 같은 확정 State로 다음 Session을 만들 수 없다 (`db/migrations/20260922071137_guard_driving_generation_state.sql`, `apps/backend/src/driving/driving-service.ts`).
- 새 Rule Version 등록은 `current_rule_version_id`를 바꾸지만, 운행 시작은 이전 Confirmed State의 Rule Version/Hash가 새 Version과 같아야 한다 (`apps/backend/src/rule-registration/rule-registration-repository.ts`, `apps/backend/src/driving/driving-service.ts`). 안전한 State 전환 경로를 확인하고 해결해야 한다.

## 근거 파일

- A: `apps/web/src/app/App.tsx`, `apps/web/src/data/fixture-adapter.ts`, `apps/web/src/domain/workspace.ts`, `apps/mobile/src/state/app-state.ts`, `apps/mobile/src/fixtures/demo.ts` (`origin/frontend` 기준)
- B: `apps/backend/src/app.ts`, `apps/backend/src/runtime-app.ts`, `apps/backend/src/routes/`, `apps/backend/src/chain-state/trip-processing-adapter.ts`, `apps/backend/src/final-evaluation/final-evaluation-adapter.ts`, `db/migrations/README.md` (`origin/feat` 기준)
- C/결정: `packages/midnight/src/state-adapter.ts`, `contracts/driving-state.compact` (`origin/feat` 기준), `PROJECT_DIRECTION.md` (이번 대화의 로컬 2026-09-23 방향 포함)
