# Frontend Backend 경계 — 2026-09-24

가입자 앱과 보험사 웹의 기본 화면은 기존 fixture/로컬 데모를 유지한다. 인증이 완성되기 전 API 호출을 무인증 요청이나 브라우저에 넣은 고정 토큰으로 대체하지 않는다.

## 보험사 웹

`apps/web/src/api/backend.ts`의 `createInsurerApi({ baseUrl, getAccessToken })`는 인증 토큰을 호출 시점에 받아 `Authorization: Bearer`로 전달한다. `createRuleDraft(specialContractId, policyText)`는 `POST /special-contracts/:id/rule-drafts`의 검토용 결과를 형식 확인 후 반환한다. `getRules`와 `saveRuleVersionDraft`는 B의 기존 Rule API 호출 경계이며 기본 화면에서 자동으로 호출하지 않는다. 초안 저장은 기존 Rule의 새 DRAFT 버전 생성이고 승인과 별개다.

`App`에 `ruleDraftApi`와 실제 `specialContractId`를 전달하면 특약 관리의 규칙 변경 화면이 **수정된 약관 텍스트**로 초안을 요청한다. 결과가 `manual_required`이거나 호출에 실패하면 입력값을 수기로 보완할 수 있다. 두 prop이 없으면 화면은 연결이 필요하다고 알려 주며 API를 호출하지 않는다. 수기 입력값과 생성 결과는 아직 브라우저 메모리에만 있고 DB 저장·승인 버튼은 없다. 인증 제공자와 실제 특약 식별자가 준비된 뒤 연결한다.

## 가입자 앱

`apps/mobile/src/api/backend.ts`의 `createDriverApi({ baseUrl, getAccessToken })`는 Auth 확인, 동의, 보험계약·특약 목록/선택, 모의 운행 시작·조회·종료 요청을 캡슐화한다. 동의 시간·사용자 ID, Rule/State/점수는 클라이언트 요청에 넣지 않는다. 운행 시작의 멱등 키는 요청 본문이 아니라 `Idempotency-Key` 헤더로 보낸다. 토큰이 없으면 네트워크 요청 전에 `AUTH_REQUIRED` 오류를 낸다.

현재 모바일 화면은 이 API 클라이언트를 아직 사용하지 않으며 AsyncStorage fixture를 계속 사용한다. 실제 화면 데이터로 전환하려면 로그인 토큰 제공자, 실제 계약 데이터, Backend 응답 검증·화면 매핑, 신청/심사 API가 추가로 필요하다. 로컬 데모 브리지는 그 API를 대체하지 않는다.
