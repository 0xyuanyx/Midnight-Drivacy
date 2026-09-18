# 초안 생성 API 제안서 (P1-2, B 검토용)

작성일: 2026-09-18 (KST). 이 문서는 **제안**이며 구현하지 않는다. 경로명·미들웨어 구성은 B가 최종 결정한다.
라벨: `확정`(§1.3 팀 결정 또는 `docs/PLAN_DECISIONS.md`) / `제안`(A 권고) / `미정`.

---

## 1. 엔드포인트 (제안)

```
POST /insurer/special-contracts/:id/rule-drafts
```

- **제안** 경로명. `origin/feat`의 기존 관례(`insurance-contracts/:id/...` 형태의 중첩 리소스 경로, `apps/backend/src/routes/insurance.ts` 참고)를 따라 `special-contracts/:id/rule-drafts`로 제안. 다만 feat에는 아직 `special-contracts` 자체의 INSURER 전용 라우트가 없으므로(§1.1: "INSURER 전용 route는 아직 없다"), 이 경로는 B가 신설해야 하는 새 라우터에 속한다.
- `:id`는 `SpecialContract`의 UUID(feat `insurance.ts`의 `contractId()` 헬퍼처럼 `z.uuid()`로 HTTP 경계에서 검증 권장).

## 2. 권한 (제안)

- `requireRole("INSURER")` 적용 — feat의 `requireRole`(역할: `RequestHandler`, `request.authUser.role` 비교, `createRequireAuth` 뒤에 마운트)을 그대로 재사용 권고. 현재 `Role` 타입에 `INSURER`가 포함돼 있는지는 `packages/shared`에서 B가 확인.
- 요청자가 해당 `special-contracts/:id`를 소유(자신의 보험사 상품)하는지 검사하는 로직은 A 영역 밖. B의 기존 소유권 검사 관례를 그대로 적용 권고.

## 3. 요청 (제안)

두 가지 입력 방식을 지원하되 **텍스트를 1차, PDF를 2차**로 제안:

### 3.1 텍스트 (1차)

```json
{ "sourceText": "..." }
```

- Content-Type: `application/json`.
- 길이 한도: 20,000자 (§1.2 원본과 동일, **확정** 근거는 기존 코드 동작).

### 3.2 PDF (2차)

- Content-Type: `multipart/form-data`, 필드명 `file`(제안).
- 크기·페이지 한도: 5MB, 20페이지 — **제안값**, P2-4에서 재검증.
- 텍스트 추출 실패(스캔본 등) 시 `PDF_NO_TEXT`로 `manual_required` 전환. OCR 미지원 명시.

두 방식 모두 서버가 텍스트를 확보한 뒤에는 동일한 `createRuleDraft(text, { extract })` 경로로 처리(P1-1 §1 상태 머신).

## 4. 응답 (제안)

P1-1의 DTO(`docs/contracts/RULE_DRAFT_CONTRACT.md` §2~3)를 그대로 사용. HTTP 상태 코드:

| 상황 | 상태 코드 | 본문 |
| --- | --- | --- |
| 생성 성공(`draft` 또는 `manual_required` 둘 다 "성공"으로 취급) | 201 | P1-1 DTO |
| 요청 검증 실패(`sourceText` 없음/타입 오류, PDF 형식 오류) | 400 | 기존 `ApiError` |
| 인증 실패 | 401 | 기존 `ApiError` |
| 권한 없음(INSURER 아님, 또는 소유하지 않은 특약) | 403 | 기존 `ApiError` |
| 요청 크기 초과(텍스트 20,000자·PDF 5MB 초과) | 413 | 기존 `ApiError` |

- 오류 형식은 feat 관례(`AppError(code, message, status)` → `{code, message, requestId}`, §1.1) 재사용. **확정** 근거는 기존 코드 동작.
- 초안 응답(`draft`/`manual_required`)에는 `approved`, `ruleHash`, `version` 필드가 없음을 재확인(P1-1 §1).

## 5. 한도·로그 (제안)

| 항목 | 값 | 상태 |
| --- | --- | --- |
| 텍스트 길이 | 20,000자 | 확정(§1.2 원본 동작 승계) |
| PDF 크기 | 5MB | 제안 |
| PDF 페이지 수 | 20페이지 | 제안 |
| 호출 제한(rate limit) | 미정 — A는 구체적 수치를 제안하지 않음. B의 기존 인프라 제약(Cloud Run) 확인 필요 | 미정 |
| 로그 정책 | 요청 원문(`sourceText`)·PDF 바이트·Provider API 키를 로그에 남기지 않는다. 상태(`draft`/`manual_required`)·이슈 코드·필드 채움 개수만 기록 권고 | 제안 |

## 6. B가 결정할 것 (목록)

1. 최종 경로명·라우터 파일 위치(`apps/backend/src/routes/rule-draft.ts` 등, A는 제안하지 않음).
2. `special-contracts` 리소스 자체의 INSURER 전용 CRUD 라우트 신설 여부와 순서(현재 feat에 없음).
3. multipart 파싱 미들웨어(예: `multer`) 채택 여부와 버전 — feat 의존성에 없으므로 새 패키지 추가가 필요하면 B 승인 필요.
4. rate limit 구체값과 미들웨어 위치.
5. `packages/rule-draft`(A 산출물, Phase 2)를 호출하는 서비스 계층(`rule-draft-service.ts`, P2-6)의 의존성 주입 방식 — 기존 `createApp` 관례(§1.1)에 맞출지 확인.

---

## 미검증 항목

실제 라우트 등록·multipart 파싱·rate limit 구현 없음. 이 문서는 API 제안이며 구현이 아니다(P2-6에서 B 합의 후 구현).
