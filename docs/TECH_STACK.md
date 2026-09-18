# 기술 스택과 개발 구조

결정일: 2026-09-16 (KST) · 상태: 선정 완료, 설치·구현·배포·실제 연동 검증 전

사용자가 Node.js + TypeScript를 선택하고 나머지도 추천대로 진행하도록 위임했다. 아래 조합을 MVP의 개발 기준으로 채택한다. 패키지·서비스 선택과 동작 검증은 구분한다. 프로젝트 방향은 [PROJECT_DIRECTION.md](../PROJECT_DIRECTION.md), 기능별 책임과 공통 원칙은 [TEAM_WORKING_PLAN.md](TEAM_WORKING_PLAN.md)를 따른다.

## 선정한 조합

| 영역 | 선택 | 선택 이유와 고려할 점 | 담당 |
| --- | --- | --- | --- |
| 언어·런타임 | TypeScript, Node.js 24 LTS 계열, ESM | 프론트·서버·Core와 Midnight 연동의 타입을 공유한다. 타입 설정과 빌드가 필요하며 외부 입력 검증은 별도다. 실제 사용할 패치 버전은 설치 시 고정한다 | B: 공통 설정, C: SDK 연결 확인 |
| 서비스 Backend | Express 5, 기능별 router/service 분리 | MVP API를 작은 구조로 구성한다. 권한·입력 검증·오류 처리 규약은 공통으로 직접 구성한다 | B |
| 프론트 | React + TypeScript + Vite, React Hook Form | 기존 React 결정에 개발·빌드 도구와 폼을 더한다. 디자인 완료 후 구현하며 SSR은 MVP에 요구하지 않는다. Wallet SDK의 브라우저 빌드 지원은 실제 확인한다 | A |
| DB·인증 | Supabase Postgres + Supabase Auth, 이메일·비밀번호 로그인 | 관계형 상태·규칙·신청 이력과 관리형 인증을 함께 사용한다. 서비스 의존성과 권한 설계가 필요하다. 보험사 역할은 서버가 부여하고 사용자가 입력한 메타데이터로 권한을 만들지 않는다 | B |
| DB 접근·변경 | 서버의 `pg` 드라이버, SQL migration | 상태 확정·작업 claim·중복 방지에 필요한 트랜잭션과 제약을 명시적으로 관리한다. 프론트는 업무 DB를 직접 수정하지 않는다 | B |
| 원본 임시 보관 | Supabase Storage의 비공개 bucket | 재처리 입력은 비공개 객체로 보관하고 검증·체인 반영 확인 후 삭제한다. 업무 DB에는 참조·처리 이력만 둔다. 객체 삭제와 물리적 소거 보장은 구분한다 | B |
| 입력·공통 계약 | Zod + 공유 TypeScript 타입 | LLM 초안·수기 규칙·API 입력을 같은 스키마로 검증한다. 형식 검증은 약관 의미나 증명 검증을 대신하지 않는다 | B: 공통 계약 관리, A·C: 사용·검토 |
| 약관 처리 | 텍스트를 추출할 수 있는 PDF 한 종, PDF.js(`pdfjs-dist`) | Node 환경에서 텍스트를 추출한다. 스캔·추출 실패는 수기 규칙 입력으로 연결하며 OCR을 추가하지 않는다. 크기·페이지·텍스트 한도는 서버 설정으로 둔다 | A |
| LLM | Gemini API의 안정판 Flash, 기본 모델 `gemini-3.8-flash`, REST·구조화 출력 | 팀 서버가 키와 프롬프트를 관리하고 예시 약관의 규칙 초안만 만든다. 모델 접근·품질·지연·비용은 실제 생성 평가 전이다. 모델 ID는 서버 환경 설정에서 관리한다 | A |
| Core·ZK | TypeScript 계산 모듈 + Compact 계약 + 공식 Midnight.js/Wallet SDK | Backend 계산과 회로의 단위·직렬화·해시를 맞춘다. Dataset Merkle·상태 전이·nullifier는 실제 회로로 제약한다. Wallet SDK의 키 보관·승인 연결은 별도 구현한다 | C |
| 로컬 Midnight 환경 | WSL2 + Docker, 공식 로컬 개발 예제 참고 | Windows에서 계산·계약·증명 환경을 재현한다. 기존 저장소 안에 필요한 구조만 적용한다 | C |
| 데모 네트워크 | 로컬 검증 후 Midnight Preprod | 재현 가능한 로컬 경로와 공개 네트워크 트랜잭션 증거를 모두 준비한다. 주소·자금·DUST·실제 SDK 조합은 연결 시 확인한다 | C |
| 서비스 배포 | Google Cloud Run, Docker 이미지 | 초기에는 같은 Express 서비스에서 API와 완성된 프론트 정적 파일을 제공해 공개 주소를 단순화한다. 서비스 비용·Secret·인터넷 의존성이 있다 | B |
| 비동기 작업 | Cloud Tasks → 인증된 Cloud Run 작업 endpoint, Postgres 작업 이력 | 접수 후 증명·체인 확인을 처리하고 화면은 작업 상태를 조회한다. 중복 전달을 전제로 DB claim·멱등 처리를 구현한다. 작업 메시지에는 작업 ID만 넣고 원본을 넣지 않는다 | B: 작업 운영, C: 증명·체인 어댑터 |
| 배포 증명 서버 | 공식 proof-server Docker 이미지, Compute Engine VM에서 별도 운영 | 증명 서버의 CPU·메모리 요구를 API와 분리한다. 접근을 제한하고 원본/witness 로깅을 막는다. VM 크기는 측정 후 정하며 서비스 선정만으로 운영 중이라고 표시하지 않는다 | C: 증명 환경, B: 인프라·Secret |
| 테스트 | Vitest, 프론트 연결 후 Playwright, 실제 SDK 통합 검증 | 계산·입력·실패 케이스와 브라우저 흐름을 나눠 확인한다. mock E2E를 실제 증명·월렛 승인 성공으로 표시하지 않는다 | 각 기능 담당 |
| 저장소·의존성 | npm workspaces, 단일 lockfile, 공통 lint/format·타입 검사 | 세 사람의 모듈과 공유 계약을 한 저장소에서 관리한다. 새 브랜치를 만들지 않고 공통 설정 파일 수정은 B가 조정한다 | B |

## 실행 구조

```text
React 앱 → Express API → Supabase Auth / Postgres / 비공개 Storage
                       → Gemini API (규칙 초안)
                       → Cloud Tasks → 작업 endpoint
                                       → Core 계산 / Midnight SDK
                                       → proof server / Preprod
                                       → 체인 확인 후 DB 확정·원본 삭제
가입자 Wallet SDK → 가입자 측 키 관리·트랜잭션 승인 → 위 체인 작업에 연결
```

Core·LLM 모듈은 우선 같은 Backend 코드베이스에 둔다. 작업 endpoint와 proof server는 실행 책임을 분리하며 별도 업무용 마이크로서비스를 만들지 않는다. 브라우저 월렛 승인이 필요한 단계는 작업 상태로 기다리고 가입자의 서명/승인 결과를 연결한다. 서버 worker가 가입자 키를 보유하거나 대신 승인하는 구조로 바꾸지 않는다.

Cloud Tasks의 처리 한도에 맞게 증명 생성·승인 대기·체인 확인 단계를 구분하고 결과를 DB에 기록한다. 긴 승인을 한 HTTP 요청에서 기다리지 않는다. 타임아웃이나 worker 재시작 후에는 작업·트랜잭션 상태를 확인하고 같은 운행이나 신청을 재등록하지 않는다.

## 저장소 경계

착수 시 다음 구조를 기준으로 한다. 현재 실제 폴더·앱이 생성됐다는 의미는 아니다.

```text
apps/web/             A: 향후 React 프론트
apps/backend/         B: 서버·업무 API·작업 조정
packages/rule-draft/  A: 약관 추출·LLM 초안
packages/shared/      B 조정, 전원 검토: API·Rule·State 계약
packages/core/        C: 계산·Merkle·설명 근거
packages/midnight/    C: 계약 호출·체인 확인·월렛 인터페이스
contracts/            C: Compact 소스와 생성물 관리
db/migrations/        B: SQL 변경
infra/                B 조정, C 증명 설정: 배포·로컬 실행
```

## 운영 기준

- 인증은 Supabase가 검증하고 Backend는 토큰 유효성과 가입자·보험사·계약·신청의 객체 접근권한을 검사한다. 인증 계정과 월렛은 별개로 연결한다.
- 데모는 준비한 가입자/보험사 이메일·비밀번호 계정을 기본 경로로 사용한다. 공개 가입의 이메일 확인·비밀번호 복구를 제공하려면 custom SMTP를 구성한다. Supabase 기본 메일 발송을 일반 사용자용으로 가정하지 않는다. 계정 준비는 향후 구현 작업이며 이번에 계정이나 데이터를 생성하지 않는다.
- 서버 비밀값은 Secret/환경변수로 관리한다. 저장소에는 공개 주소와 `.env.example`의 변수 이름만 기록한다. 가입자 개인키는 Drivacy 서버에 저장하지 않는다.
- LLM·서버·증명 자원에는 사용량 제한과 예산 알림을 둔다. 무료 사용 범위는 활용 가능성을 확인하며 총비용 0원을 보장하지 않는다. 금액·호출 제한 수치는 실제 요금과 테스트 결과로 설정한다.
- 원본은 업무 DB·작업 메시지·일반 로그에 복제하지 않는다. 체인 확인 후 삭제 재시도에 필요한 최소 메타데이터만 유지한다. Storage·proof server 등 처리 영역을 포함해 삭제 동작을 확인하되 ZK가 삭제를 증명한다고 표현하지 않는다.

## 구현 시 구체화할 사항

추가 스택 선택을 매번 사용자에게 요청하지 않고 담당자가 이 기준으로 진행한다. 아래는 설치·명세·연동 작업에서 확정할 세부 사항이다.

1. API 요청·응답·오류, Rule/State 필드와 정수 단위, 직렬화·해시·Merkle leaf·경로·nullifier 식별 범위. 기존 최종 명세와 조율하고 공통 스키마에 기록한다.
2. 실제 예시 보험 약관의 지원 규칙·점수/거리 산식·할인 구간. 과거 가상 수치를 보험상품의 확정 규칙으로 사용하지 않는다.
3. 보험사 공개 항목·정밀도와 공개 ledger 입력. 원본 비공개 원칙을 유지하고 최종 명세의 공개 범위를 맞춘다.
4. 2026-09-17 채택한 재신청·재시도·실패 원본 보관 기준을 실제 작업·DB·Storage에 적용한다. 채택한 값과 이유는 PROJECT_DIRECTION, B↔C 연결은 BC_CONTRACT를 따른다. 근거 없이 다른 사업 정책을 추가하지 않는다.
5. 월렛 브라우저 키 보관·복구, 규칙 등록 승인 주체, 실제 SDK·Compact·proof-server 버전과 주소. 기능 사용 여부·Preprod 선택은 확정하고 조합은 설치·실행 증거로 고정한다. 컴파일 버전 차이 자체를 별도 심사 차단 우려로 되돌리지 않는다.

## 선정 근거

다음 공식 자료를 2026-09-16 확인해 조합을 선정했다. 이 확인은 Drivacy에서의 설치·동작·비교 성능 검증이 아니다.

- [Express](https://expressjs.com/), [Vite](https://vite.dev/guide/), [Zod](https://zod.dev/), [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro)
- [Supabase Postgres](https://supabase.com/docs/guides/database/overview), [이메일·비밀번호 인증](https://supabase.com/docs/guides/auth/passwords), [SMTP 제한과 설정](https://supabase.com/docs/guides/auth/auth-smtp)
- [Gemini 모델 목록](https://ai.google.dev/gemini-api/docs/models), [구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [PDF.js Node 예제](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
- [Cloud Tasks와 Cloud Run](https://docs.cloud.google.com/run/docs/triggering/using-tasks), [Cloud Run 요청 시간제한](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Midnight 공식 예제](https://github.com/midnightntwrk/example-bboard), [Wallet SDK](https://github.com/midnightntwrk/midnight-wallet), [로컬 개발 생성 도구](https://github.com/midnightntwrk/create-mn-app)
