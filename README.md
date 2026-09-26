# Midnight-Drivacy

### 가입 후 화면 전환 보정 (2026-09-26)

Expo Router의 최상위 스택을 경로 변경 중에도 유지해 온보딩과 동의 화면이 번갈아 전체 초기화되는 문제를 수정했습니다. `dev:auth-only`는 C/Wallet 없이 가입뿐 아니라 인증된 동의 조회/저장과 본인 보험계약·특약 조회도 제공합니다. 실제 소유 계약이 0건이면 서버는 빈 목록을 반환하고, 앱은 기존 보험 fixture 3개를 작은 데모 안내와 함께 표시합니다. 선택 후에는 로컬 데모 흐름으로 전환하며 예시 계약을 DB에 만들거나 실제 계약·주행·할인 신청 API에 보내지 않습니다. 조회 오류는 fixture로 대체하지 않습니다. 실제 동의 확정은 사용자가 직접 진행해야 하고, C/Wallet 주행·증명 경로는 여전히 제공하지 않습니다.

### 가입 정보 입력 보정 (2026-09-26)

가입 정보 화면은 생년월일의 중복된 형식 안내와 실제 저장 동작에 맞지 않는 파란 안내 박스·확인 체크를 제거했습니다. 입력한 정보가 가입 프로필에 저장되고, 아직 본인확인이나 보험계약 조회를 하지 않는다고 간결하게 안내합니다. 정식 개인정보 수집 목적·보관 기간·삭제 방법은 아직 미결정입니다. Supabase의 조건부 Privy 식별자 인덱스와 가입 SQL의 충돌 대상을 일치시켜 `42P10` 저장 오류를 수정했습니다. 실제 DB 롤백 거래 및 자동 테스트는 통과했으나, 사용자 이메일 OTP를 통한 실제 가입 저장은 별도 확인이 필요합니다.

### C/Wallet 없이 로컬 가입 검증

`npm run dev:auth-only`는 로컬 가입·동의·본인 계약 조회용 Backend를 실행합니다. `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`만 사용하고 기본 포트는 3000입니다. `AUTH_ONLY_ALLOWED_ORIGIN`의 기본값은 `http://localhost:8094`이며 loopback HTTP origin만 허용합니다. 모바일 웹 미리보기의 `EXPO_PUBLIC_BACKEND_URL`을 `http://127.0.0.1:3000`으로 설정합니다. 이 경로에는 `/health`, `/auth/me`, `/auth/driver/onboarding`, `/consent`, `/insurance-contracts`와 소유 계약의 특약 경로만 있으며 C/Wallet 처리·복구는 실행되지 않습니다. 전체 서비스의 `npm run dev`는 기존 C/Wallet 설정을 계속 요구합니다.

### 로컬 연결 확인 (2026-09-26)

Supabase는 공식 CA로 TLS 접속과 `SELECT 1`을 확인했습니다. 프로세스 시작 시 `NODE_EXTRA_CA_CERTS=config/supabase-root-2021.crt`를 지정하고 로컬 `.env`를 로드합니다. 인증서 검증은 비활성화하지 않습니다. CA 출처는 Supabase Dashboard → Database Settings → SSL configuration입니다.

Privy는 `Midnight-Drivacy` 앱으로 통일했습니다. 기존 모바일 Client ID의 소속을 Dashboard에서 확인했고 Backend App ID와 Secret도 서버 SDK 설정 조회로 검증했습니다. C/Wallet runtime 모듈·서비스 설정이 미제공이므로 전체 Backend 실행 및 가입 저장 E2E는 아직 완료되지 않았습니다.

### 프론트·백엔드 모의 운행 연동 경계 (2026-09-25)

가입자 앱의 토큰 주입형 API 클라이언트는 운행 시작·종료 외에 `POST /driving-sessions/:sessionId/process`와 `GET /trip-processing/:operationId`도 호출할 수 있습니다. Backend는 C의 체인 확인 뒤 B의 DB 확정 전 상태를 `db-pending`으로 응답하며, DB에 저장된 유효한 결과에만 `db-confirmed`와 공개 거리·점수·조건 요약을 반환합니다. 기존 가입자 화면은 계속 fixture 데모이고 실제 Privy OTP·가입자 월렛·기기 E2E는 연결되지 않았습니다. 작업 범위와 남은 순서는 [연동 규칙](docs/FRONTEND_BACKEND_INTEGRATION_RULES_2026-09-25.md), [인계](docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF_2026-09-25.md)를 참고하세요.

### C/Wallet processing status boundary (2026-09-23)

`POST /driving-sessions/:sessionId/process` returns a stable `operationId`. An authenticated DRIVER can poll `GET /trip-processing/:operationId`; B authorizes its owned job before querying the configured C/Wallet adapter and returns only safe status fields. `awaiting-wallet-approval` is pending, not failure. B does not accept browser-provided confirmation and holds no wallet secrets.

Lace DApp Connector v4 integration is browser-side only. Its `submitTransaction()` acknowledgement has no chain ID, so C keeps any SHA-256 broadcast reference separate from Shared `transactionId`.

`packages/midnight/runtime/driving-runtime.ts` is the concrete C executor: it reuses the Compact contract, proof provider, indexer provider and `TripJob` pipeline. C derives a transaction ID from the Wallet-balanced transaction with the Midnight SDK, waits for browser submission, and independently validates indexed ledger state before `chain-confirmed`. Its source/journal stores are local development/demo persistence, not a production durable recovery store.

Real Lace/Preprod end-to-end submission and production durable restart recovery are not implemented or verified.

The repository now also has the C/Wallet HTTP host at `packages/midnight/runtime/server.ts`, started with `npm run dev:c-wallet`. It serves the existing Backend adapter paths only with `C_WALLET_ADAPTER_TOKEN`; browser approval uses a separate, short-lived capability and cannot submit a claimed chain confirmation. It requires a deployment-specific `C_WALLET_RUNTIME_MODULE` exporting the private journal/proving/indexer runtime, so it does not substitute synthetic receipts or claim Preprod verification.

Drivacy는 상세 주행기록을 보험사에 공개하지 않고, 보험사가 승인한 안전운전 할인 조건의 충족 여부를 Midnight의 영지식증명으로 검증하는 프로젝트입니다.

Privacy-preserving driving-based insurance eligibility proofs on Midnight.

## 최종 할인 신청·보험사 심사 Backend (2026-09-23)

Backend는 DRIVER가 선택한 본인 계약·특약의 DB 최신 Confirmed State만으로 최종 할인 신청을 원자적으로 예약하고, 외부 C/Wallet Final Evaluation 경계에 같은 operationId를 전달합니다. Genesis와 미확정 후보는 신청할 수 없으며, client가 점수·할인율·commitment·nullifier를 지정할 수 없습니다. 같은 Scope·State의 동시 신청은 DB UNIQUE로 하나만 남고, C가 반환한 nullifier도 UNIQUE로 재사용을 차단합니다.

Final Evaluation의 `pending`·`proving`·wallet 승인 대기·`submitted`·`chain-unknown`은 보험사 심사 가능 상태가 아닙니다. operation·Scope·State·Rule·runtime·계약 주소와 결과 수치가 모두 신청 snapshot과 일치하는 `verified`만 검증 완료로 저장합니다. ZK 검증 상태와 보험사의 APPLIED/REJECTED 업무 결정은 분리되며, 결정은 해당 보험사 membership을 SQL에서 확인한 뒤 한 번만 기록됩니다. 보험사 응답에는 raw records, segment, 위치·경로, salt, owner secret, wallet key, witness를 포함하지 않습니다.

`20260923090000_add_discount_applications.sql`은 Supabase 원격에 적용 완료됐습니다. Backend는 30초마다 최대 25개의 due PENDING 신청을 DB claim/lease로 선점하고 저장된 operationId 상태만 조회합니다. 진행 상태·통신 장애·binding 오류는 PENDING으로 유지해 다음 조회를 예약하고, verified 또는 명시적 terminal failed만 기존 공통 검증 로직으로 확정합니다. 이 자동 복구용 `20260923110000_add_final_evaluation_recovery_claim.sql`은 저장소에만 있으며 원격에는 아직 적용하지 않았습니다. 실제 external C/Wallet Final Evaluation 서비스와 가입자 Wallet 연결이 없어 live Midnight evaluation·실제 chain 검증은 완료로 주장하지 않습니다.

## Backend 운행 Processing 연결 상태 (2026-09-22)

Backend production runtime은 종료된 Driving Session을 `POST /driving-sessions/:sessionId/process`로 받아, Session에 고정된 Rule Version과 Confirmed State로 요청을 조립하고 DB에 `chain_jobs`를 먼저 기록한 뒤 외부 C/Wallet 실행 경계에 전달합니다. 새 Job만 처리를 시작하며, 재요청과 응답 유실 복구는 기존 operationId로 상태를 조회합니다. `calculated`, `proving`, `submitted`, `chain-unknown`은 DB Confirmed State로 반영하지 않고, Shared 계약이 검증한 `chain-confirmed`만 transaction에서 `chain_states`와 Job을 확정합니다.

production adapter는 `C_WALLET_ADAPTER_URL`과 `C_WALLET_ADAPTER_TOKEN`으로 최소 HTTP 경계를 구성합니다. raw Trip source의 저장·조회·삭제와 처리 시작·재시도·상태 조회·안전 종료 확인을 외부 C/Wallet runtime에 위임하며, Backend는 Midnight SDK나 가입자 Wallet key를 소유하지 않습니다. 설정 또는 외부 runtime이 없거나 응답이 불명확하면 fail-closed하고 로컬 `packages/midnight/probe/*`나 성공 fixture로 대체하지 않습니다. 확정 뒤 raw source 삭제 실패는 확정 DB state를 되돌리지 않고 recovery worker가 다시 삭제합니다. 일시 오류는 1·5·15분 재시도, chain-unknown은 기존 operationId 상태 조회, 안전 종료된 실패 원본은 7일 보관 정책을 유지합니다.

이 저장소에는 위 HTTP 계약에 응답하는 실제 외부 C/Wallet 서비스와 실제 가입자 Wallet 연결이 없습니다. 따라서 Backend wiring과 adapter 계약은 구현됐지만 live Midnight 처리, 실제 Wallet Approval, production chain-confirmed E2E는 완료 또는 검증됐다고 보지 않습니다. 테스트는 명시적인 Stub/Fake 경계로 Backend orchestration만 검증합니다. 최종 평가 요청, nullifier 기반 최종 신청, 보험사 심사·할인 적용은 이번 연결 범위에 포함하지 않습니다.

현재 팀 합의, 발표용 데모 흐름, 구현 우선순위와 미해결 질문은 [PROJECT_DIRECTION.md](PROJECT_DIRECTION.md)를 참고하세요.

검증은 런타임·의존성·캐시를 분리한 별도 실행 환경에서도 진행하고, 계산 로직은
명세에서 독립 작성한 기준 계산과 대조합니다. 환경·명령·소스 해시·결과와 실제
체인/브라우저 등 미검증 범위를 기록하는 기준을 채택했습니다.

연결된 채팅까지 반영한 [개발 결정 정리](docs/README.md), [키 입력 없는 LLM 실행 설계](docs/LLM_EXECUTION.md), [Midnight·ZK 및 약관 처리·폼·테스트 오픈소스 후보](docs/MIDNIGHT_OPEN_SOURCE.md)는 `docs/`에 있습니다.

프론트를 제외한 세 개발자의 [기능 분담안·남은 결정사항·공통 작업 원칙](docs/TEAM_WORKING_PLAN.md)도 정리했습니다. 개발자는 프론트+백엔드 1명과 백엔드 위주 2명입니다. 새 브랜치는 만들지 않는 조건이며, 후속 위임으로 기능 분담과 공통 원칙을 채택했습니다. [확정 기술 스택](docs/TECH_STACK.md)은 선정 완료이며 API 계약은 구체화 전입니다.

개발 기준은 최신 사용자 지시 → 최종 API 명세서·데이터 플로우 → 최종 기획 문서 → 기존 코드·주석 → 일반 개발 관행 순서입니다. 자료에서 제안·미정으로 표시한 내용은 확정 사양으로 취급하지 않습니다.

## Project status

Midnight Korea Hackathon 2026을 위한 개발 저장소입니다. 가입자용 Expo 모바일 데모는 구현됐지만, 실제 업무 API·보험사·Midnight 연동과는 구분합니다. C의 작은 Compact 상태 전이 계약은 전체 컴파일·SDK 타입 검사와 실제 로컬 배포·증명·두 차례 체인 갱신·오래된 상태 거부·계약 재연결을 통과했습니다. C 4단계의 보험 계산·Dataset·누적 상태 회로도 실제 로컬 증명과 두 운행 확정을 통과했습니다. 실제 실행 증거와 한계는 아래 검증 문서에 기록합니다.

### 가입자 모바일 회원가입 UX

[회원가입 MVP 기준](docs/frontend/DRIVER_SIGNUP_MVP_UX.md)은 이메일 6자리 코드만 인증하고, 신규 가입자의 이름·생년월일·휴대전화 번호는 인증 없는 프로필 정보로 받도록 정합니다. [HTML 화면 레퍼런스](docs/frontend/DRIVER_AUTH_WALLET_UX_REFERENCE.html)는 첫 가입의 정보 입력과 재방문자의 기존 월렛 잠금 해제 흐름을 보여줍니다. 이는 정적 와이어프레임으로 실제 인증·정보 저장·월렛 연결을 호출하지 않습니다. 해당 OTP 및 기본 정보 입력 UX는 아직 실행 앱에 반영·검증되지 않았습니다.

2026-09-17 C의 1단계 결과로 [B↔C 내부 연결 계약](docs/BC_CONTRACT.md), `packages/shared/src/bc-contract.ts`의 공유 타입·Zod 스키마·고정 직렬화와 계약 검증 하네스를 추가했습니다. Rule·운행·후보/확정 상태·체인 결과의 연결 기준이며 업무 API·Core 계산·실제 증명·월렛·체인 구현 완료를 뜻하지 않습니다. 저장소 workspace·서버 설정·lockfile은 변경하지 않았습니다. 계약 검사만 실행하려면 PowerShell에서 `./scripts/check-bc-contract.ps1`을 실행합니다. Node.js 24와 npm, 패키지 설치용 인터넷이 필요하며 하네스는 임시 폴더에서 실행하고 서비스 키·LLM·체인 요청은 사용하지 않습니다.

2026-09-18 C의 3단계로 [누적 Core 계산](docs/CORE_CALCULATION.md)을 추가했습니다.
승인 Rule과 이전 확정 State를 읽어 누적 거리·시간·이벤트·점수·예상 할인율을
계산하고 가입자용 설명을 반환합니다. 이전 누적 State와 체인 이력은 다음
운행으로 유지하며 원본만 실제 체인 반영 확인 후 B가 삭제합니다.
`./scripts/check-core.ps1`의 strict 타입 검사와 테스트 53개(Core 27·공유 계약 26)가
통과했습니다. 이 3단계 검증은 순수 계산 범위이며 실제 회로/Merkle 검증은
아래 4단계 결과를 따릅니다.

C 4단계의 [상태 전이 증명 학습·구현 문서](docs/STATE_TRANSITION_PROOF.md)에
Rule·Dataset·State 관계와 실제 회로/어댑터 규격을 정리했습니다.
`./scripts/check-driving-state.ps1`은 전체 ZK 컴파일·타입·회로/회귀 검사를,
`-SkipZk`는 키 생성 없는 빠른 검사를, `-Live`는 실제 로컬 배포·증명·운행
확정을 실행합니다. 실행 완료 범위는 해당 문서의 검증 기록을 따릅니다.

2026-09-18 새 하네스의 전체 컴파일·strict 타입 검사와 72개 테스트(회로 19,
Core 27, 공유 계약 26)가 통과했습니다. 실제 로컬 증명/계약 제출 9회로
초기화와 두 운행의 확정(revision 2)을 확인했고, 변조·누락·오래된 상태 9건은
추가 증명 요청/제출 없이 거부됐습니다.
[실행 증거·테스트한 소스와 ZK 키 해시](docs/evidence/driving-state-2026-09-18.json)를
보관합니다. B의 DB 확정·원본 삭제, 운영용 BCAdapter 재시도/상태 조회,
최종 신청 nullifier와 보험사 결과 공개 연결은 이번 운행 회로 범위에 포함되지 않습니다.

추가로 `scripts/check-core-linux.sh`의 별도 Linux 런타임·빈 npm 캐시·새 설치
환경에서 타입 검사와 53개 테스트를 통과했습니다. 명세에서 독립 작성한 Python
기준 계산 332개와 결과가 일치했고, 잘못된 입력 15개도 거부했습니다.
실행 방법과 한계는 위 Core 문서에 기록합니다.

C 5단계의 [월렛 승인·운행 작업 제어](docs/WALLET_APPROVAL_JOBS.md)를 추가했습니다.
단계별 승인 대기·취소, 제출 전 거래 ID 기록, 결과 불명 복구, 확정 결과 재조회와
재시도 제한을 C 인터페이스로 구현하고 로컬 SDK 실행기에 연결합니다.
검증 기록은 해당 문서를 따르며 B 서버/DB와 가입자 브라우저 월렛의 운영 통합은 별도입니다.
전체 컴파일·타입 검사·88개 테스트와 실제 로컬 두 운행(revision 2)을 통과했습니다.
개발자 승인 7회·proof/계약 제출 각 9회로 결과 반환 장애 복구와 확정 결과 재조회 시
추가 제출이 없는 것을 확인했습니다. [별도 실행 증거](docs/evidence/wallet-jobs-2026-09-18.json)를 보관합니다.

2026-09-23에는 개발·검증용 local browser wallet과 향후 실제 가입자 Wallet Provider를 분리하는 경계를 정리했습니다. `WalletApproval`은 작업별 사용자 승인 결정만 다루고, `UserWalletProvider`는 이후 브라우저의 connect/initialize, transaction approval, balance/sign, submit, cancel, disconnect 구현을 받을 인터페이스입니다. 실제 Lace SDK·가입자 Provider 연결은 아직 없으며, Backend가 가입자 private key·seed·secretKey를 소유하거나 받지 않습니다.

같은 날짜에 browser 전용 `LaceWalletProvider`와 수동 검증 페이지를 추가했습니다. DApp Connector API v4.0.1의 `window.midnight` discovery 및 `connect("preprod")`를 사용하고 Wallet이 제공한 network/service URI와 proven transaction action·digest를 검증합니다. 이 코드와 fake connector 단위 테스트는 실제 Lace 확장 또는 Preprod transaction 성공 증거가 아니며, Expo native 연결도 아직 구현하지 않았습니다.

C 6단계의 [최종 결과 proof·nullifier와 로컬 브라우저/B 연결](docs/FINAL_EVALUATION.md)을 추가했습니다.
독립 Claude 검토에서 재현한 witness 바인딩·동시 balance·취소 작업 종료 문제를 수정했습니다.
v3 회로의 전체 ZK 컴파일·strict 타입 검사와 Windows/Linux 각각 102개 테스트,
독립 기준 계산 332건·거부 사례 15건이 통과했습니다. 수정 전 v2의 로컬 연결 결과는
[역사적 증거](docs/evidence/final-evaluation-2026-09-18-before-owner-fix.json)로 분리했습니다.
2026-09-20 후속 구현에서 제출된 앞 단계가 있는 terminal 작업은 가입자가 별도
`cancelTrip` 거래를 승인하고 실제 receipt가 확인된 뒤에만 B scope를 해제하도록 연결했습니다.
finalizer의 C 조회·잘못된 원본 payload도 domain 오류로 통일했습니다. 전체 ZK 컴파일,
strict 검사와 106개 테스트, 실제 로컬 브라우저 월렛·격리 PostgreSQL·두 운행 revision 2·
최종 평가/nullifier가 통과했고 변조·중복 10건을 거부했습니다.
[최신 실행 증거](docs/evidence/final-evaluation-2026-09-20.json)를 보관합니다.
[이전 중단 상태](docs/evidence/final-evaluation-2026-09-18.json)는 역사적 기록으로 유지합니다.
[Claude Midnight Expert 교차검증](docs/evidence/midnight-expert-review-2026-09-18.md)은 완료했습니다.
`./scripts/check-driving-state.ps1 -Live -BrowserIntegration`으로 연결 검사를 실행합니다.
공개 local genesis를 쓰며 실제 가입자 Auth/Storage·제품 화면·보험사 결정·Preprod와 구분합니다.

2026-09-21 최초 계약 배포와 Genesis 초기화도 로컬 브라우저 월렛 승인을 요구하도록
실행 경로를 수정했습니다. `-SkipZk` 하네스의 엄격 타입 검사·108개 테스트는 통과했지만,
변경 후 `-Live -BrowserIntegration` 재검사는 Docker Desktop Linux 엔진이 응답하지 않아
체인 단계에 도달하지 못했습니다. 이전 브라우저 통합 증거는 이 두 초기 승인 거래를
검증한 증거로 사용하지 않습니다.

2026-09-23 로컬 `feat` 체크아웃에는 npm workspace 기반 Express Backend와 Shared 계약 패키지가 있습니다. `packages/shared`는 첫 수직 기능용 Role, User, Consent, InsuranceContract, SpecialContract, SpecialContractSelection, ApiError, RequestId의 Zod 스키마와 TypeScript 타입을 제공합니다. Backend는 모의 운행 시작·종료와 Trip 생성을 구현했으며, 시작 당시 Rule Version과 Confirmed State commitment를 고정합니다. 동일 commitment의 동시 중복 소비는 DB 제약으로 막지만, Core 계산·실제 증명·Midnight 운영 연동은 이 구현 범위에 포함하지 않습니다. 원격에 적용된 Privy schema migration과 같은 `20260923085900_add_privy_auth_identity.sql`을 `db/migrations/`에 보존합니다. Backend는 `DATABASE_URL`의 단일 `pg` Pool로 Privy 검증 신원과 DB 역할을 내부 Drivacy UUID로 결합하고, 신규 DRIVER는 `POST /auth/driver/onboarding`에서 원자적으로 생성합니다. `GET /auth/me`과 DRIVER 전용 동의·계약·특약 API는 기존 내부 UUID 기반 권한 검사를 유지합니다. Frontend는 React로 정해졌으며 디자인 완성 후 구현합니다. Backend는 Node.js + TypeScript + Express, DB는 Supabase Postgres, 인증은 Privy, 배포는 Cloud Run으로 선정했습니다.

2026-09-21 B의 DB recovery worker는 영속화된 due action을 읽어 `TEMPORARY_FAILURE`의 1·5·15분 재시도와 `chain-unknown` 상태 재조회를 분리합니다. 기존 operationId·원본을 재사용하고 claim/lease와 조건부 증가로 동시 worker를 막으며, C가 안전 종료를 확인한 작업만 7일 보관 후 cleanup합니다. 이 구현은 injected C 경계와 테스트 fixture 범위이며 production C Adapter, 실제 Midnight network, ZK/Proof E2E 또는 production chain-confirmed 연동 완료를 의미하지 않습니다.

## Planned demo

### 2026-09-19 subscriber-scope Rule registration foundation

The repository preserves the applied Supabase migrations for `evaluation_scopes`, `chain_scope_deployments`, `rule_registrations`, and `initial_registration_attempts`; the latter is also applied to the remote Supabase project and must not be rerun there. The Backend has the authorization and orchestration boundary for an approved Rule: it creates or reuses a subscriber Scope, deploys only when there is no existing deployment, and otherwise updates the existing contract for a new Rule version. The initial B path requires C's chain-confirmed Genesis result and atomically records it with deployment, registration, and the current Rule. It rejects an existing registration without a matching confirmed State. Before the external deploy call it reserves an operation ID, then reuses that ID on recovery: it redeploys only when C confirms no transaction was submitted, persists an already chain-confirmed result without redeploying, and blocks pending/unknown or a different Rule Version. The production server now mounts the registration route and injects a fail-closed external C/Wallet adapter client. That client delegates only `deployRule`, `updateRule`, and `getInitialRegistrationStatus`; it owns no Midnight SDK or wallet key and never substitutes the local developer probe. The repository does not contain the corresponding external C/Wallet runtime, durable transaction-status service, or subscriber Wallet integration, so live Rule Registration has not been verified. Existing orchestration tests use explicit Fake/Stub adapters and are not production-chain evidence.

The Backend also provides simulated Driving Session start, retrieval, and end APIs. A session persists one generated Trip and its segments, reuses it for the same idempotency key, and fixes the chain-confirmed current Rule Version selected for its configured runtime. Every new session now requires a matching chain-confirmed DB State, including Genesis for the first session; version-zero State must have zero trips and zero cumulative metrics. C request assembly, processing-job persistence, and finalization are prepared behind injected boundaries. It does not calculate scores, create genesis State, execute proofs, or connect a production C adapter.

INSURER users can also request a review-only Rule Draft from policy text. Gemini failures or missing configuration return a manual-input result; only the existing complete Rule save API creates a DRAFT Rule Version. Draft evidence, issues, provider metadata, and source text are not persisted by this flow.

1. 예시 약관의 LLM 규칙 초안 생성을 우선 시도하고, 보험사가 수정·검토해 승인합니다. 변환 실패 시 수기 입력 후 같은 승인 경로를 사용합니다.
2. 가입자가 해당 특약을 선택하고 `운행 시작`을 눌러 Backend가 생성한 모의 기록으로 두 번 이상의 운행을 순서대로 처리합니다. 승인된 최소 거리와 이전 확정 누적 거리에 맞춘 거리·시간·이벤트 생성은 [모의 주행 설계](docs/DRIVING_SIMULATION.md)를 따릅니다. Backend Generator와 Driving Session start/get/end API는 구현됐으며, Frontend 진행 화면과 실제 Confirmed State persistence·C·Midnight 연결은 후속 단계입니다. 상세 난수 범위는 추천안입니다.
3. Dataset Merkle Tree로 제출 기록과 계산 입력을 연결하고, 운행별 승인 규칙 계산과 이전·신규 상태의 관계를 증명합니다. Midnight 검증과 체인 반영 확인 후에만 DB 신규 상태를 확정하며, 실패·미확정 시 이전 확정 상태를 유지합니다.
4. 가입자가 보험사에 공개할 결과를 확인하고 제출을 승인합니다.
5. 보험사는 원본 위치·구간별 속도·정확한 운행시각·이동경로 없이 필요한 결과와 Midnight 검증 결과를 확인하고 할인 적용·미적용을 결정합니다. 이 결정까지 끝나면 `처리 완료`입니다.
6. 계산 결과, 규칙 또는 이전 상태를 부정하게 바꾼 요청이 거부되는 것을 확인합니다.

## Scope decision

- 2026-09-16 합의로 규칙 등록을 **LLM 초안 생성 우선 시도 → 보험사 검토·승인**으로 변경했습니다. 예시 약관 한 종을 대상으로 하며, 수기 입력 경로를 유지하고 LLM 방식이 구현되지 않으면 제외합니다.
- LLM은 승인 전 초안을 작성하며, 승인된 규칙만 계산과 증명에 적용합니다.
- 실제 GPS 수집, 외부 내비게이션 연동, 실제 보험사 시스템 연동은 MVP에서 제외합니다.
- 예시 보험사 한 곳, 특약 한 종 및 모의 주행기록을 대상으로 합니다.
- 이메일 기반 로그인과 역할 구분을 MVP에 포함합니다. Backend는 Privy access token 검증과 `POST /auth/driver/onboarding`을 구현했습니다. 가입자 프론트는 이메일 6자리 OTP 화면을 구성했지만 실제 Privy 인증·세션·provisioning 연결은 아직 구현하지 않았습니다.
- 가입자용 자체 보관형 임베디드 월렛을 Midnight Wallet SDK로 구현할 계획입니다. 최초 Scope 계약 배포·Genesis 초기화와 결과 제출은 가입자 승인을 받고, 이후 보험사가 승인한 Rule Version 갱신은 가입자에게 알리되 재승인을 요구하지 않습니다. 갱신 거래의 권한·서명 방식은 구현 시 검증해야 합니다. 가입자 개인키를 서버에 저장하지 않으며 보험사는 별도 월렛 설치 없이 이용합니다. 실제 제품 SDK·네트워크 연동은 아직 미구현이고 다중 기기 복구는 MVP에서 제외합니다.
- Dataset Merkle Tree를 MVP에 적용할 계획입니다. Driver Merkle Tree는 필수 채택으로 확정하지 않았습니다.
- 원본은 운행별 Midnight 검증과 트랜잭션 반영 확인 후 삭제하며, 실패 시 재처리를 위해 보관합니다. 최종 신청은 과거 원본을 다시 입력하지 않고 최종 확정 상태에서 결과를 검증합니다. 일시적 실패는 최초 시도 외 3회(1·5·15분 간격) 자동 재시도하고, 소진 후 체인 실패가 확인된 원본은 최대 7일 보관 후 삭제하는 기준을 채택했습니다. 체인 결과 불명은 상태를 먼저 확인합니다. 실제 운영 구현은 후속 작업입니다.
- 중복 제출은 Backend와 `nullifier`로 방지합니다. 미적용 후 새 운행으로 점수가 바뀌고 조건을 만족한 새 확정 상태의 재신청을 허용하며 심사 중·적용 완료 추가 신청은 막습니다. 보험사에는 정확한 점수·거리와 최소 평가/검증 결과를 제공하고 공개 원장에는 커밋먼트 등 최소 검증 정보를 두는 기준을 채택했습니다.
- 2026-09-17 사용자 지시에 따라 교체 가능한 데모용 임시 산식을 작성했습니다. 100점에서 누적 과속·급가속·급제동 1회당 각각 2·1·3점을 차감하고 0점 하한을 적용합니다. 누적 500km·80점 이상이면 10%, 90점 이상이면 12%의 예상 할인율을 사용합니다. 두 운행 예시는 300km·92점(거리 미충족) → 누적 550km·87점(예상 10%)입니다. 실제 보험상품 규칙이나 구현·검증 완료를 뜻하지 않으며 승인된 임시 Rule만 사용합니다. 채택한 기준과 이유는 PROJECT_DIRECTION을 따릅니다.

## Verification boundaries

가입자의 실제 운행 전체 제출을 요구하지 않고 반영할 운행을 선택하는 것을 서비스 전제로 합니다. 미반영 운행의 거리와 이벤트는 누적 평가에 포함되지 않습니다. 선택해 제출한 Dataset 안의 기록 누락·중복·변조 검증은 유지하며, 이를 실제 운행 전체의 제출 보장과 구분합니다.

목표는 제출된 기록과 승인 규칙 사이의 계산 관계를 검증하는 것입니다. 입력 기록의 실제 운행 여부, 미제출 운행, 전체 운행의 완전성, 원본 삭제 사실 또는 보험사의 결과 재사용 방지까지 ZK가 보장하는 것은 아닙니다.

원본 기록은 설계상 Drivacy의 계산·증명 처리 영역에 일시적으로 존재합니다. 보험사와 공개 원장에 원본을 전달하지 않는 것이 목표이며, Drivacy 자체가 원본에 접근하지 않는 구조로 표현하지 않습니다.

## Mobile demo (Expo Go scope)

2026-09-25 전체 화면 검토 후 보정: CTA와 스크롤을 별도 레이아웃 영역으로 분리해 짧은 미리보기의 본문 겹침을 제거했습니다. 가입·암호의 필수 확인을 CTA 위에 배치하고 월렛 완료의 재연결 뒤로가기 경로를 제거했습니다. 홈·주행·서류의 거리 기준은 500km로 통일하며 최종 예시 누적 550km와 구분합니다. 주행 결과는 현재 점수를 중심으로, 서류 탭은 준비 요약·다음 화면은 공개 정보 확인으로 구분합니다. 로컬 신청·결정 시각을 기록하고 오래된 상태의 누락 시각은 `기록 없음`으로 표시합니다. 모바일 84개 테스트·타입·린트와 Web/iOS/Android export, 저장소 기본 테스트 163개가 통과했습니다. 브라우저에서 가입→두 운행→신청→결과·새로고침과 짧은/긴 높이·360px 폭을 확인했습니다. 물리 기기·네이티브 키보드·실제 연동 검증은 아닙니다.

2026-09-25: 신규 이메일·코드·가입 정보·월렛 안내/암호/연결/완료의 7개 화면을 `/setup`에 추가했습니다. 시작하기 → 가입 준비 → 보험조회 동의 → 보험 선택으로 이어집니다. 기본 실행은 서버에 이메일을 보내지 않으며 화면 확인용 코드 `123456`을 입력합니다. 프로필은 유효한 형식으로 입력하고 정보 안내를 확인한 뒤, 화면 확인용 암호를 12자 이상 입력합니다. 실제 계정 인증·월렛 생성은 수행하지 않으며 완료 화면은 `서비스 연결 전`으로 표시합니다. 개인정보·코드·암호는 영속 저장하지 않고, 비민감한 준비 화면 완료 여부만 기존 데모 저장소에 기록합니다. 기존 보험 선택 완료 데이터는 유지하므로 새 흐름을 다시 보려면 결과 상세의 초기화하기를 사용합니다. [검수 및 실제 연결 전 요청사항](docs/MOBILE_SETUP_AUDIT.md)을 참고하세요.

2026-09-25 화면 보정: 생년월일 입력 표기를 `YYYY/MM/DD`로 바꾸고 완료 체크를 공통 초록 심벌로 통일했습니다. 첫 운행 전 점수는 `--점`, 첫 결과는 최초 확정 점수로 표시합니다. 홈 점수 카드의 세로 여백을 줄이고 탭 pill을 위로 올렸으며, 동의 덮개의 웹 미리보기 상단 공백과 주행 링의 반복 회전을 보정했습니다. 앱 테스트 79개, 타입 검사, 린트, Web/iOS/Android export가 통과했습니다. 날짜 입력은 웹 미리보기에서도 확인했으며 물리 기기 화면 검수는 별도입니다. 데모 산식과 실제 서비스 연결 범위는 그대로입니다.

## Insurer web demo

### 가입자 Privy 인증 — 2026-09-26

가입자 앱은 제공받은 공개 Privy App ID와 모바일 client ID로 실제 이메일 OTP SDK를 사용한다. 웹 미리보기는 React SDK, iOS/Android는 Expo SDK로 분기한다. `apps/mobile/.env.example`의 `EXPO_PUBLIC_BACKEND_URL`에 팀 Backend 주소를 설정하고 Expo 서버를 재시작하면 인증된 가입 정보 저장과 DRIVER 화면 연결을 사용할 수 있다. 서버 주소가 비어 있으면 이메일 인증 후 가입 정보 저장에서 멈춘다. App Secret은 프론트에 넣지 않는다. Privy 대시보드에서 이메일 로그인을 활성화하고 웹 실행 origin을 허용해야 한다. 실제 이메일 수신은 사용자의 이메일과 OTP로 확인해야 한다.

실제 인증 흐름에서 월렛 준비 프리뷰는 건너뛴다. 이는 월렛 연결 완료를 뜻하지 않으며, 가입자 월렛 승인/제출은 별도 연동 대상이다. 기존 화면만 검토하려면 `EXPO_PUBLIC_AUTH_MODE=preview`로 실행한다. 네이티브 인증은 Expo development build에서 확인하며 웹 미리보기 성공을 iOS/Android 실기기 인증 검증으로 간주하지 않는다.

2026-09-24: 팀원 변경의 5개 메뉴를 유지한 채 추가 화면의 목록 타이포·카드·하단 행동 정렬과 특약 탭 키보드 탐색을 보정했습니다. 로컬 브리지 설정 여부는 실제 서비스 헬스체크와 구분해 표시합니다.

2026-09-24: A 담당이 기존 특약 문서 확인 화면에서 수정된 약관 텍스트를 Rule Draft API로 보낼 수 있는 토큰 주입형 경계를 추가했습니다. 반환된 값과 약관 근거를 검토하고 실패 또는 `manual_required` 응답에서는 수기로 보완할 수 있습니다. 로그인 디자인·토큰 제공자와 실제 특약 ID가 없으므로 기본 실행은 API를 호출하지 않으며, 생성 결과는 저장·승인·운영 적용되지 않습니다. 가입자 앱에는 인증 토큰을 주입받는 Auth/동의/보험계약/특약 선택/모의 운행 API 호출 경계를 준비했지만 기존 화면은 아직 fixture 흐름입니다. 보험사 신청·심사 Backend API도 현재 없으므로 앱↔웹의 실제 서비스 연동을 완료했다고 보지 않습니다.

2026-09-23 추가 메뉴를 보험사 웹 프론트에 구현했습니다. 특약 관리의 규칙 변경은 PDF/DOCX/TXT/MD 문서를 브라우저에서 올려 글자를 추출하고 내용을 수정한 뒤 초안 검토 화면으로 이동합니다. 스캔 PDF의 OCR은 제공하지 않으며 글자를 읽지 못하면 직접 보완할 수 있습니다. 검증 이력은 신청을 찾아 기존 평가 요청 상세로 이동하고, 연동 상태는 읽기 전용 목업입니다. 2026-09-24에 인증 정보를 주입받으면 호출 가능한 자동 규칙 초안 경계를 추가했으나 기본 실행에는 토큰 제공자가 없으며 초안 저장/승인/등록, 실제 ZK/체인 조회는 연결되지 않았습니다. 검증 이력은 데모 데이터와 실제 검증의 차이를 표시합니다.

### 두 프론트의 로컬 연동 데모

`npm run dev:linked`를 실행하면 보험사 웹 `http://127.0.0.1:5173`, 가입자 앱 브라우저 미리보기 `http://localhost:8081`, 공유 메모리 데모 서버 `http://127.0.0.1:3001`이 함께 실행됩니다. 앱에서 두 번의 모의 주행 뒤 서류에서 신청 내용을 검토하고 제출하면, 웹 **평가 요청**에 신청이 나타납니다. 웹에서 `데모 할인 적용` 또는 `데모 미적용`을 선택하면 앱의 신청 내역에서 처리 상태를 다시 조회합니다. 데모 서버를 재시작하면 신청 데이터가 사라집니다. `dev:insurer`와 `dev:driver-preview`는 각각 독립 fixture 실행으로 유지됩니다.

연동 데모는 사전에 정해진 모의 점수·거리만 전송합니다. 인증된 Backend API, 실제 보험계약, ZK 증명, Midnight 거래는 실행하지 않습니다. 개발용 데모 서버는 이 컴퓨터의 loopback 주소에서만 실행됩니다. 별도 공개 주소에 배포할 때는 인증된 공통 Backend와 영속 저장소 연결이 필요합니다.

화면에는 `데모`·`목업` 표기를 노출하지 않습니다. 증명 및 체인 결과가 없는 곳은 `검증 정보 없음` 또는 `연결 전`으로 표시하고 임의의 성공 상태나 해시를 보여주지 않습니다. 화면 문구 변경은 위 로컬 연동의 구현 범위를 넓히지 않습니다.

### 프론트별 실행과 배포 산출물

보험사 웹과 가입자 앱은 서로 다른 프로젝트입니다. 저장소 루트에서 각각 실행합니다.

| 대상 | 로컬 실행 | 로컬 주소 | 배포용 빌드 | 산출물 |
| --- | --- | --- | --- | --- |
| 보험사 웹 (`apps/web`) | `npm run dev:insurer` | `http://localhost:5173` | `npm run build:insurer` | `apps/web/dist/` |
| 가입자 앱 웹 미리보기 (`apps/mobile`) | `npm run dev:driver-preview` | `http://localhost:8081` | `npm run build:driver-preview` | `apps/mobile/dist/` |

`npm run dev:driver`는 Expo Go·에뮬레이터용 앱 개발 서버입니다. iOS·Android 앱은 웹 주소가 아닌 앱 배포 대상입니다. 두 웹 산출물을 배포할 때는 서로 다른 사이트/서비스와 공개 주소에 각각 올립니다. 호스팅 서비스와 주소는 아직 선정하지 않았으며 실제 배포는 하지 않았습니다. 현재 두 화면은 각자의 로컬 fixture 상태를 사용하므로 주소를 분리해도 데이터가 연동되지는 않습니다.

`apps/web` is a separate insurer-facing React + TypeScript + Vite demo based on the [UI rules](docs/WEB_APP_RULES.md) and [implementation plan](docs/WEB_IMPLEMENTATION_PLAN.md). Its Figma-aligned shell has five navigation entries, compact KPI cards, a Dashboard guidance banner, four-column request lists and shared score/discount, proof-table and history details. Search/filter controls open from the Filter button and remain in the URL. The menus are Dashboard, Evaluation Requests, Special Rider Management with a rule-conversion screen, Verification History, and a read-only Integration Status mock. The 500 km approved-rule threshold is separate from the Figma web sample's 524.8 km (the mobile demo still uses 550 km).

The standard web run uses a browser-persisted fixture adapter backed by localStorage. The optional local linked demo shares synthetic application status with the subscriber app through the demo bridge. The insurer evaluation and verification-history screens can use authenticated Backend application/decision APIs when an `insurerApi` is supplied to `App`, but the default entrypoint supplies none and remains a fixture. Neither default mode connects to insurer systems or the Midnight proof network. The UI labels this boundary; no real contract or discount is changed. The manual insurer Rule entry/review decision remains unchanged. The rule-change screen extracts text from uploaded PDF documents in the browser. A token-injected API boundary can request a review-only Rule draft, but the default fixture run has no authentication provider or real special-contract ID. It does not perform OCR, save a draft, approve a Rule, or register one on-chain.

```bash
npm install
npm run dev --workspace=@drivacy/web
npm run test --workspace=@drivacy/web
npm run typecheck --workspace=@drivacy/web
npm run build --workspace=@drivacy/web
```

Verification on 2026-09-23: 19 web tests, TypeScript checking, ESLint, and the Vite production build passed. All 20 Figma references were inspected; browser QA covered 24 request/tab combinations, four decision outcomes, reload persistence and widths 1512/1440/1280/1024/768/390. The follow-up pass fixed shared Korean typography, tab spacing, utility and privacy icons, result-table borders, proof/history alignment, completed-state labels and the full completed history sequence. Major desktop panel coordinates match the source to within 1px. See the [Figma audit](docs/WEB_FIGMA_AUDIT.md) and [follow-up list](docs/WEB_FIGMA_REMAINING.md) for measured geometry and intentional business-state differences. This does not verify API integration, production authentication/authorization, deployment, or pixel-identical font rendering on every platform.

2026-09-23 추가 메뉴·로컬 연동 후 웹 21개 테스트, 가입자 앱 59개 테스트, 양쪽 타입 검사와 웹 빌드·Expo web export가 통과했습니다. 로컬 브리지의 생성→중복 제출→보험사 화면 조회→결정→앱 조회 HTTP 흐름을 확인했습니다. 이 검사는 실제 보험 API·증명·체인 실행을 검증하지 않습니다.

Mobile UI rules are maintained in [MOBILE_APP_RULES.md](docs/MOBILE_APP_RULES.md). User-approved app refinements take precedence over Figma coordinates. Bundled Pretendard fonts and semantic text styles unify headings, descriptions and card text. The onboarding uses the supplied 3D V artwork. A wall-clock timer resumes from the stored trip start; its ring respects reduced motion, and the end time is retained in the result. Home reflects active trips and pending/approved applications and links to Documents. Result details offer a gray reset action immediately above the blue Home action; reset clears local demo progress and returns to onboarding.

Latest verification (2026-09-23): 58 mobile tests, typecheck, lint and the Web/iOS/Android export passed. Browser QA exercised both trips, elapsed time in session and result, Home → Documents → submission → result, the gray reset placement above Home, and the framed web preview. Reset dispatch/navigation is automated-test verified; physical-device execution and a full small-screen/accessibility audit remain unverified.

`apps/mobile` is a deterministic subscriber-facing Expo Router demo. It covers onboarding consent, selecting one of three local example policies, and a three-tab flow: **Home**, **Driving**, and **Documents**. The consent sheet uses two required check rows with chevrons that open full disclosures for policy/rider lookup and selected driving-record processing. The primary navigation uses a bottom-offset floating iOS-style pill, policy selection uses a card-border-only selected state, and blue primary actions share fixed bottom slots—with separate alignment for tabbed and non-tabbed screens. Blue eyebrow labels also share fixed positions for screens with and without a back header, and the shared `DriVacy` wordmark renders the capital `V` in blue. Two simulated trips deterministically progress from an unmeasured `--` display (internal 100-point calculation baseline) through 300 km / 92 points to 550 km / 87 points and a 10% expected discount. The application review expressly excludes precise location, route, segment speed, and exact driving time.

The subscriber app's Expo web target is a fast preview of the same React Native application, not the insurer web product above. It adds an iPhone-style frame only on web so review screenshots are easier to read; iOS and Android builds do not include that frame.

2026-09-25 frontend follow-up: the onboarding and email/wallet setup preview use the same non-tab CTA slot, while tabbed screens use one separate slot above the floating pill. Setup inputs gate the next action, clear stale errors while editing, and support keyboard Next/Done transitions. This is a UI flow preview; email delivery, account persistence, and wallet creation remain unconnected.

The default app now uses Privy email authentication. With `EXPO_PUBLIC_BACKEND_URL` configured, a Backend-confirmed DRIVER identity supplies `backendConnection` to `AppProvider`: server-owned contract/rider/evaluation period, session records, stable retry keys, processing polling, DB-confirmed results, and application status. Tokens stay with the Privy SDK; application caches are scoped by Backend user ID and signed-out sessions do not load fixture caches. The explicit `EXPO_PUBLIC_AUTH_MODE=preview` path retains deterministic fixture screens and OTP `123456`. Preview completion does not authenticate a user or create a wallet. Real email delivery, Backend/DB, subscriber wallet and chain operations require their respective running services and end-to-end checks. Manual insurer Rule entry remains unchanged.

Requirements: Node.js 24 LTS and npm.

```bash
npm install
npm run mobile                 # Expo dev server; choose Expo Go, Android, iOS, or web
npm run web --workspace=@drivacy/mobile
npm run mobile:test -- --runInBand
npm run mobile:typecheck
npm run lint --workspace=@drivacy/mobile
npm run mobile:export          # Expo bundles web, iOS, and Android
cd apps/mobile && npx expo-doctor
```

2026-09-26 화면·Backend 연결 경계의 로컬 검증: Shared 34, Rule Draft 38, Backend 206, 가입자 앱 110, 보험사 웹 33개 테스트와 각 타입 검사, 웹 Vite 빌드, 앱 Expo web export가 통과했다. 이 검증은 주입형 API 경계의 Fake 응답 테스트이며 기본 진입점의 Privy 로그인, 실제 DB/C/월렛, 실기기 또는 체인 종단 검증을 대체하지 않는다. 세부 미완료 항목은 [프론트·백엔드 인계](docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF_2026-09-25.md)와 [화면 연결 계획](docs/superpowers/plans/2026-09-26-screen-api-integration.md)을 참고한다.

Verification on 2026-09-22: 50 mobile Jest tests, including hydrated consent/policy deep-route protection, both consent-detail disclosures, active-trip resume, safe direct-review recovery, exactly-once authorized simulated-trip processing, the Documents tab route, and policy identifying metadata; mobile typecheck/lint, Expo Doctor (21/21), and web/iOS/Android export passed after the Figma-alignment update. The web preview was manually checked inside its iPhone frame for onboarding, the consent sheet/detail view, insurance selection, Home, fixed CTA placement, and the bottom-offset pill navigation. This is browser QA only; physical iOS/Android devices and Expo Go have not been exercised.

## Backend foundation

2026-09-22 Backend는 운행 Session을 생성 당시의 Confirmed State commitment에 묶어, 같은 Scope의 같은 State가 서로 다른 Idempotency-Key로 중복 소비되지 않게 DB에서 원자적으로 생성합니다. 같은 Key 재요청은 기존 Session을 반환합니다. 운행 처리에는 Deployment의 최신 Rule 대신 Session 저장 Rule Version을 사용하며, stage 충돌은 기존 pending Job이 참조할 수 있는 원본 source를 삭제하지 않습니다. 이 보호를 위한 `20260922071137_guard_driving_generation_state.sql`은 Supabase 원격에 적용 완료됐고, 기존 Session의 commitment는 안전하게 복원할 수 없어 NULL로 보존됩니다.

The repository now includes the phase-one shared backend foundation. It provides
an npm workspace, a strict TypeScript Express 5 service, a Zod-backed shared
contract package, a `GET /health` endpoint, automated health and contract
testing, and a production Dockerfile. It connects Privy Auth and Supabase Postgres
for the implemented first-vertical authentication, consent, contract, and
special-contract selection APIs. The applied Rule database foundation is stored
as migrations. Simulated driving sessions preserve their creation-time Rule Version and Confirmed State commitment; production Core calculation, proof, and Midnight integration remain outside this implemented boundary.

Requirements: Node.js 24 LTS and npm.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

`npm run dev`에는 `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `MIDNIGHT_NETWORK`, `MIDNIGHT_ADAPTER_PROFILE`, `C_WALLET_ADAPTER_URL`, `C_WALLET_ADAPTER_TOKEN`이 필요합니다. Supabase PostgreSQL은 계속 `DATABASE_URL`로 사용하며, 인증 access token만 Privy 서버 SDK로 서명 검증합니다. 외부 adapter의 최소 호출 경계는 `POST rule-registrations/deploy`, `POST rule-registrations/update`, `GET rule-registrations/initial/:operationId`이며 Shared `BCAdapter` 스키마를 사용합니다. 통신 실패나 알 수 없는 응답은 `not-submitted`으로 간주하지 않고 503으로 닫힙니다. `.env.example`에는 변수 이름과 용도만 있으며, 실제 Connection String·Access Token·adapter token·월렛 키·비밀번호는 저장소에 기록하지 않습니다.

With the development server running, `GET http://localhost:3000/health` returns:

```json
{
  "status": "ok",
  "service": "drivacy-backend"
}
```

## Run and submission

작은 실제 상태 전이 계약의 실행 안내와 한계는 [C 2단계 로컬 기술 검증](docs/MIDNIGHT_LOCAL_PROBE.md)을 참고하세요. PowerShell에서 `./scripts/check-midnight-local.ps1 -CompileOnly`로 전체 컴파일·타입 검사를, `./scripts/check-midnight-local.ps1`로 로컬 배포·증명·상태 전이를 실행합니다. Windows Node.js 24·npm·Docker Desktop Linux engine·WSL2의 Compact compiler 0.31.1이 필요합니다. 업무 데모의 실행·제출 절차는 후속 구현에서 검증하여 추가할 예정입니다.

2026-09-16 이전 채팅에서 새로 클론한 공개 `main` 커밋 `4445e9a67eaee6ba0e1c3e53cc52e82a83f11234`에는 문서 4개만 있었습니다. 키 없는 Gemini 모델 목록 REST 요청이 HTTP 403으로 거부된 것은 당시 확인 기록이며 생성 호출 성공을 뜻하지 않습니다.

기본 LLM 실행은 **클론한 앱 → 팀 배포 Backend → LLM API**로 구현할 계획입니다. 심사위원은 키를 입력하지 않고, 팀 서버가 키·모델·프롬프트를 관리합니다. 레포에는 서버 공개 주소만 기본 설정으로 넣습니다. 인터넷과 운영 중인 팀 서버가 필요하며 LLM 실패 시 수기 입력으로 이어갑니다. Gemini 안정판 Flash와 Cloud Run을 채택했습니다. 기본 모델은 TECH_STACK 기준이며 서버 주소와 실행 명령은 구현·배포 후 검증하여 기록합니다. 제출 전에 새 클론과 LLM 키 없는 환경에서 실제 초안 생성까지 확인할 예정입니다.

- [Hackathon program](https://www.hackathon.midnightkorea.org/kor)
- [Participant registration](https://luma.com/2pnv2fwk)
- [Midnight documentation](https://docs.midnight.network/)

공식 프로그램 페이지의 제출 마감: **2026-09-28 00:00 KST** (9월 27일 밤까지).
