# 프론트·백엔드 연동 인계 — 2026-09-25

## 이번에 확정한 경계

- `origin/feat`의 Backend와 `origin/frontend`의 화면을 기존 `feat` 작업물과 분리된 작업 트리에서 합쳤다. 프론트 화면·문구·메뉴·데모 상태 전이는 임의로 바꾸지 않았다.
- `GET /trip-processing/:operationId`는 기존 상태 조회를 유지한다. C의 체인 확인 뒤 B의 DB 확정 전에는 `db-pending`으로 응답한다. **B의 `chain_jobs`가 `db-confirmed`이고 저장된 결과가 유효할 때만** `db-confirmed`와 해당 운행의 공개 요약(이번·누적 거리, 점수, 조건, Rule Version, State commitment, transaction ID)을 반환한다. 원본 기록과 salt는 이 응답에서 제외한다.
- 모바일 API 클라이언트에 처리 접수와 operation ID 기반 상태 조회를 추가했다. 요청의 멱등 키는 헤더에만 넣는다. 기존 화면은 여전히 로컬 fixture를 표시하며, 이 API 호출이 화면에 연결됐다는 뜻이 아니다.
- 시뮬레이터는 최소 거리 1–5m에서도 양수 구간 합계를 만들고, 구간별 각 이벤트를 독립 8% 확률로 생성한다. 점수·할인 조건은 생성기가 강제하지 않고 Core가 실제 기록으로 계산한다.
- C 로컬 하네스의 TypeScript 오류를 의미 변경 없이 고쳐 strict 검사와 테스트를 다시 실행했다. 로컬 월렛 페이지는 학습용이며 운영 가입자 월렛이 아니다.
- Claude Code(Opus)의 변경 diff 검토에서 C의 `chain-confirmed`를 DB 미확정 상태에도 그대로 노출하는 문제를 발견해 `db-pending`으로 고쳤다. 나머지 응답 소비부는 아직 구현되지 않았으므로 실제 화면 연결 시 상태 계약을 함께 검증해야 한다.

## 다음 작업의 정확한 순서

1. **A 인증·화면 연결:** Privy 이메일 OTP의 실제 access token과 B의 `POST /auth/driver/onboarding`을 연결한다. 앱에 설정된 실제 계약·특약·평가기간을 서버 응답으로 선택한다. `apps/mobile/src/api/backend.ts`를 호출할 때 하드코딩 토큰이나 프리뷰 코드 `123456`을 실제 인증으로 재사용하지 않는다. 현재 Expo web 미리보기와 native SDK 지원 범위를 분리한다.
2. **모의 운행 화면:** 서버가 생성한 동일 `sessionId`의 `trip.records`로 시작~종료 화면을 재생한다. `POST /driving-sessions`, `GET /driving-sessions/:id`, `POST /driving-sessions/:id/end`, `POST /driving-sessions/:id/process`, `GET /trip-processing/:operationId` 순서를 유지하고 안정적인 시작·처리 멱등 키를 재사용한다. 기존 fixture reducer의 `COMPLETE_TRIP`/650ms 타이머를 실제 API 모드의 성공 신호로 사용하지 않는다.
3. **확정 결과·복구:** `awaiting-wallet-approval`은 사용자 승인 대기, `submitted`/`chain-unknown`/`db-pending`은 미완료로 유지한다. `db-confirmed` 요약만 결과 화면과 다음 운행의 기준으로 사용한다. 실패·재진입 시 기존 operation ID를 조회하고 원본을 다시 생성하지 않는다. 가입자 월렛 승인·잔액 처리·제출과 실제 기기 E2E는 아직 연결되지 않았다.
4. **보험사 신청:** 주행 누적 조건과 별개로 최종 신청의 `VERIFIED`와 담당자의 `APPLIED`/`REJECTED`를 확인한다. 현 웹 fixture의 검증 성공 표시는 실제 증명 근거가 아니다. 수기 Rule 입력 결정을 유지한다.

## 실행 증거와 미검증 항목

- `./scripts/check-driving-state.ps1`에서 Compact 회로 6개 컴파일, 엄격 타입 검사, 9개 파일/122개 테스트가 통과했다. Backend는 22개 파일/205개 테스트, 모바일은 11개 suite/85개 테스트가 통과했고 Backend·모바일·웹 타입 검사도 통과했다. `docker info`는 Docker Desktop Linux engine 연결 실패여서 `-Live` proof·체인/브라우저 검증은 실행하지 못했다. 로컬 synthetic receipt나 fixture가 실제 Privy 로그인, 원격 Supabase migration, 가입자 월렛 서명, live proof·chain receipt, 브라우저/실기기 E2E를 증명하지 않는다.
- 실제 API E2E에는 Privy 앱·클라이언트 ID, Backend/DB/C 환경, 체인에 등록된 Rule·Genesis, 가입자 Wallet Provider가 필요하다. 이번 작업 트리에는 그 자격 정보가 없고 임의 토큰·키를 만들지 않았다.
- `PROJECT_DIRECTION.md`와 `README.md`는 이 경계와 상태에 맞춰 읽는다. 통합 규칙의 상세 기준은 [작업 규칙](FRONTEND_BACKEND_INTEGRATION_RULES_2026-09-25.md)이다.
