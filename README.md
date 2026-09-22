# Midnight-Drivacy

Drivacy는 상세 주행기록을 보험사에 공개하지 않고, 보험사가 승인한 안전운전 할인 조건의 충족 여부를 Midnight의 영지식증명으로 검증하는 프로젝트입니다.

Privacy-preserving driving-based insurance eligibility proofs on Midnight.

현재 팀 합의, 발표용 데모 흐름, 구현 우선순위와 미해결 질문은 [PROJECT_DIRECTION.md](PROJECT_DIRECTION.md)를 참고하세요.

검증은 런타임·의존성·캐시를 분리한 별도 실행 환경에서도 진행하고, 계산 로직은
명세에서 독립 작성한 기준 계산과 대조합니다. 환경·명령·소스 해시·결과와 실제
체인/브라우저 등 미검증 범위를 기록하는 기준을 채택했습니다.

연결된 채팅까지 반영한 [개발 결정 정리](docs/README.md), [키 입력 없는 LLM 실행 설계](docs/LLM_EXECUTION.md), [Midnight·ZK 및 약관 처리·폼·테스트 오픈소스 후보](docs/MIDNIGHT_OPEN_SOURCE.md)는 `docs/`에 있습니다.

프론트를 제외한 세 개발자의 [기능 분담안·남은 결정사항·공통 작업 원칙](docs/TEAM_WORKING_PLAN.md)도 정리했습니다. 개발자는 프론트+백엔드 1명과 백엔드 위주 2명입니다. 새 브랜치는 만들지 않는 조건이며, 후속 위임으로 기능 분담과 공통 원칙을 채택했습니다. [확정 기술 스택](docs/TECH_STACK.md)은 선정 완료이며 API 계약은 구체화 전입니다.

개발 기준은 최신 사용자 지시 → 최종 API 명세서·데이터 플로우 → 최종 기획 문서 → 기존 코드·주석 → 일반 개발 관행 순서입니다. 자료에서 제안·미정으로 표시한 내용은 확정 사양으로 취급하지 않습니다.

## Project status

Midnight Korea Hackathon 2026을 위한 개발 저장소입니다. 가입자용 Expo 모바일 데모는 구현됐지만, 실제 업무 API·보험사·Midnight 연동과는 구분합니다. C의 작은 Compact 상태 전이 계약은 전체 컴파일·SDK 타입 검사와 실제 로컬 배포·증명·두 차례 체인 갱신·오래된 상태 거부·계약 재연결을 통과했습니다. C 4단계의 보험 계산·Dataset·누적 상태 회로도 실제 로컬 증명과 두 운행 확정을 통과했습니다. 실제 실행 증거와 한계는 아래 검증 문서에 기록합니다.

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

2026-09-18 로컬 `feat` 체크아웃에는 npm workspace 기반 Express Backend와 Shared 계약 패키지가 있습니다. `packages/shared`는 첫 수직 기능용 Role, User, Consent, InsuranceContract, SpecialContract, SpecialContractSelection, ApiError, RequestId의 Zod 스키마와 TypeScript 타입을 제공합니다. 모의 주행 시작 Shared 요청은 계약·특약·평가기간과 `Idempotency-Key` 규약만 정의하며, 실제 운행 API·Trip 생성·Rule/State/Core/증명 처리는 아직 구현하지 않았습니다. Supabase 원격 프로젝트에 적용된 migration 동일본은 `db/migrations/`에 보존하며, 기존 일곱 테이블과 `insurer_memberships`, `rules`, `rule_versions`를 정의합니다. Rule DB 기반은 적용됐지만 Rule API·Shared Rule DTO·Rule Hash·LLM·Midnight 연동은 구현되지 않았습니다. Backend는 `DATABASE_URL`의 단일 `pg` Pool로 Auth 사용자·DB 역할을 결합하고, `GET /auth/me`을 제공합니다. DRIVER 전용으로 `GET`/`POST /consent`, `GET /insurance-contracts`, `GET /insurance-contracts/:id`, 특약 목록·현재 선택 조회 및 특약 선택 API를 구현했습니다. 계약 조회는 SQL의 `owner_user_id` 조건으로 객체 권한을 확인하고, 특약 선택은 계약당 하나의 현재 선택을 atomic UPSERT로 유지합니다. 이 단계는 로그인 proxy, 신규 사용자 자동 provisioning, 주행·State/ZK/Midnight 구현을 포함하지 않습니다. Frontend는 React로 정해졌으며 디자인 완성 후 구현합니다. Backend는 Node.js + TypeScript + Express, DB·인증은 Supabase Postgres·Auth, 배포는 Cloud Run으로 선정했습니다.

2026-09-21 B의 DB recovery worker는 영속화된 due action을 읽어 `TEMPORARY_FAILURE`의 1·5·15분 재시도와 `chain-unknown` 상태 재조회를 분리합니다. 기존 operationId·원본을 재사용하고 claim/lease와 조건부 증가로 동시 worker를 막으며, C가 안전 종료를 확인한 작업만 7일 보관 후 cleanup합니다. 이 구현은 injected C 경계와 테스트 fixture 범위이며 production C Adapter, 실제 Midnight network, ZK/Proof E2E 또는 production chain-confirmed 연동 완료를 의미하지 않습니다.

## Planned demo

### 2026-09-19 subscriber-scope Rule registration foundation

The repository preserves the applied Supabase migrations for `evaluation_scopes`, `chain_scope_deployments`, and `rule_registrations`. The Backend has the authorization and orchestration boundary for an approved Rule: it creates or reuses a subscriber Scope, deploys only when there is no existing deployment, and otherwise updates the existing contract for a new Rule version. This is covered with a Fake Adapter only. It does not implement a Rule hash, a production C adapter, Compact/Midnight deployment or update transaction, or chain confirmation.

The Backend also provides simulated Driving Session start, retrieval, and end APIs. A session persists one generated Trip and its segments, reuses it for the same idempotency key, and fixes the chain-confirmed current Rule Version selected for its configured runtime. It reads an existing confirmed State only for safe follow-up-session gating; C request assembly, processing-job persistence, and finalization are prepared behind injected boundaries. It does not calculate scores, create genesis State, execute proofs, or connect a production C adapter.

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
- 이메일 기반 로그인과 역할 구분을 MVP에 포함합니다. 인증은 Supabase Auth의 이메일·비밀번호 방식을 채택했고 정확한 API 계약은 구체화 전입니다.
- 가입자용 자체 보관형 임베디드 월렛을 Midnight Wallet SDK로 구현할 계획입니다. 가입자 개인키를 서버에 저장하지 않으며 보험사는 별도 월렛 설치 없이 이용합니다. 실제 SDK·네트워크 연동은 아직 미구현이고 다중 기기 복구는 MVP에서 제외합니다.
- Dataset Merkle Tree를 MVP에 적용할 계획입니다. Driver Merkle Tree는 필수 채택으로 확정하지 않았습니다.
- 원본은 운행별 Midnight 검증과 트랜잭션 반영 확인 후 삭제하며, 실패 시 재처리를 위해 보관합니다. 최종 신청은 과거 원본을 다시 입력하지 않고 최종 확정 상태에서 결과를 검증합니다. 일시적 실패는 최초 시도 외 3회(1·5·15분 간격) 자동 재시도하고, 소진 후 체인 실패가 확인된 원본은 최대 7일 보관 후 삭제하는 기준을 채택했습니다. 체인 결과 불명은 상태를 먼저 확인합니다. 실제 운영 구현은 후속 작업입니다.
- 중복 제출은 Backend와 `nullifier`로 방지합니다. 미적용 후 새 운행으로 점수가 바뀌고 조건을 만족한 새 확정 상태의 재신청을 허용하며 심사 중·적용 완료 추가 신청은 막습니다. 보험사에는 정확한 점수·거리와 최소 평가/검증 결과를 제공하고 공개 원장에는 커밋먼트 등 최소 검증 정보를 두는 기준을 채택했습니다.
- 2026-09-17 사용자 지시에 따라 교체 가능한 데모용 임시 산식을 작성했습니다. 100점에서 누적 과속·급가속·급제동 1회당 각각 2·1·3점을 차감하고 0점 하한을 적용합니다. 누적 500km·80점 이상이면 10%, 90점 이상이면 12%의 예상 할인율을 사용합니다. 두 운행 예시는 300km·92점(거리 미충족) → 누적 550km·87점(예상 10%)입니다. 실제 보험상품 규칙이나 구현·검증 완료를 뜻하지 않으며 승인된 임시 Rule만 사용합니다. 채택한 기준과 이유는 PROJECT_DIRECTION을 따릅니다.

## Verification boundaries

가입자의 실제 운행 전체 제출을 요구하지 않고 반영할 운행을 선택하는 것을 서비스 전제로 합니다. 미반영 운행의 거리와 이벤트는 누적 평가에 포함되지 않습니다. 선택해 제출한 Dataset 안의 기록 누락·중복·변조 검증은 유지하며, 이를 실제 운행 전체의 제출 보장과 구분합니다.

목표는 제출된 기록과 승인 규칙 사이의 계산 관계를 검증하는 것입니다. 입력 기록의 실제 운행 여부, 미제출 운행, 전체 운행의 완전성, 원본 삭제 사실 또는 보험사의 결과 재사용 방지까지 ZK가 보장하는 것은 아닙니다.

원본 기록은 설계상 Drivacy의 계산·증명 처리 영역에 일시적으로 존재합니다. 보험사와 공개 원장에 원본을 전달하지 않는 것이 목표이며, Drivacy 자체가 원본에 접근하지 않는 구조로 표현하지 않습니다.

## Mobile demo (Expo Go scope)

`apps/mobile` is a deterministic subscriber-facing Expo Router demo. It covers onboarding consent, selecting one of three local example policies, and a three-tab flow: **Home**, **Driving**, and **Discount application**. Two simulated trips deterministically progress from 0 km / 100 points through 300 km / 92 points to 550 km / 87 points and a 10% expected discount. The application review expressly excludes precise location, route, segment speed, and exact driving time.

The app persists only this demo state locally with AsyncStorage. Hydration and route guards stop resumed or deep-linked sessions from bypassing required consent and policy selection. An authorized active simulated trip resumes through its persisted lifecycle, and its deterministic completion is applied exactly once; this is local UI-state handling, not GPS collection, proof processing, or a chain operation. The app does not collect GPS, contact Supabase or insurer APIs, submit an insurer application, make an insurer decision, create a Midnight proof, connect a wallet, or confirm a chain transaction. “Pending,” the fixed demo application number/time, and “demo approval” are presentation states only. The existing manual insurer Rule entry/review decision remains unchanged; this mobile work does not add LLM or document conversion to the MVP.

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

Verification on 2026-09-22: 45 mobile Jest tests, including hydrated consent/policy deep-route protection and exactly-once authorized simulated-trip processing; mobile typecheck/lint, Expo Doctor (21/21), and Expo web/iOS/Android export passed. The web flow was manually checked at 402×874 and 360×740 with consent, insurance, two drives, review, pending demo approval, and result. This is browser QA only; physical iOS/Android devices and Expo Go have not been exercised.

## Backend foundation

The repository now includes the phase-one shared backend foundation. It provides
an npm workspace, a strict TypeScript Express 5 service, a Zod-backed shared
contract package, a `GET /health` endpoint, automated health and contract
testing, and a production Dockerfile. It connects Supabase Auth and Postgres
for the implemented first-vertical authentication, consent, contract, and
special-contract selection APIs. The applied Rule database foundation is stored
as migrations, while Rule APIs, trips, and Midnight remain unimplemented.

Requirements: Node.js 24 LTS and npm.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

`npm run dev`에는 `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`가 필요합니다. `.env.example`에는 변수 이름과 공개 가능한 키의 용도만 있으며, 실제 Connection String·Access Token·Service Role Key·비밀번호는 저장소에 기록하지 않습니다.

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
