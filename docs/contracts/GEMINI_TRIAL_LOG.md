# Gemini 실제 호출 검증 로그 (P2-5)

이 문서는 `packages/rule-draft/scripts/try-draft.ts`로 실제 Gemini API를 호출한 결과 요약만 기록한다.
약관 원문, API 키, 모델 응답 전체는 기록하지 않는다.

## 2026-09-19

- 실행 명령: `node --env-file=.env --import tsx packages/rule-draft/scripts/try-draft.ts packages/rule-draft/test/fixtures/synthetic-rider.txt`
- 입력: `packages/rule-draft/test/fixtures/synthetic-rider.txt` (main `backend/rule-draft/fixtures/synthetic-rider.txt`에서 복사한 가상 약관, 3줄)
- 키: `../drivacy-feat/.env`의 `GEMINI_API_KEY`, `GEMINI_MODEL` 사용 (값 미기록)
- 모델 ID: `gemini-3.8-flash`
- 결과 (2회 재현, 동일):
  | 시도 | 응답 시간 | state | 채워진 필드 수 | issues | 원인 |
  | --- | --- | --- | --- | --- | --- |
  | 1 | 9,192ms | manual_required | 0/6 | EXTRACTION_FAILED | Gemini 응답 HTTP 503 |
  | 2 | 3,688ms | manual_required | 0/6 | EXTRACTION_FAILED | Gemini 응답 HTTP 503 |
- 근거 검증 통과 여부: 해당 없음 (state가 `draft`에 도달하지 못해 근거-값 매칭 로직까지 도달하지 않음)
- 진단: 키는 요청 헤더(`x-goog-api-key`)까지 전달되어 네트워크 왕복은 성공했고(타임아웃·DNS 오류 아님), Gemini 쪽에서 503(일시적 과부하 또는 해당 모델 라우트 불가)을 반환. 401/403(키 인증 실패)이 아니고 404(모델 없음)도 아니므로 키 자체가 형식상 거부된 것은 아님. `gemini-3.8-flash`가 이 계정/리전에서 실제로 서비스되는 모델 ID인지는 이 결과만으로 확정할 수 없음.

## 2026-09-19 (재실행, P2-8 재시도·폴백 적용 후)

- 배경: P2-8에서 `src/providers/gemini.ts`에 503/429/네트워크 오류·타임아웃에 대한 지수 백오프 재시도(기본 3회, 1s→2s→4s, 예산 25s)와 폴백 모델(`GEMINI_FALLBACK_MODELS`, 기본 `gemini-3.7-flash,gemini-3.5-flash`) 체인을 추가한 뒤 동일 스크립트로 재실행.
- 추가 조치: 사용자 지시에 따라 provider 내부 재시도와 별개로, 스크립트 호출 자체를 503 발생 시 30초 간격으로 최대 3회까지 바깥에서 재시도하도록 실행(값 무관하게 셸에서만 반복, 스크립트 자체는 수정하지 않음).
- 결과: **1차 바깥 시도에서 바로 성공** — provider 내부 재시도만으로 503을 넘어섬 (추가 바깥 재시도 불필요, 2·3차 미실행)
  | 모델 | 응답 시간 | state | 채워진 필드 수 | issues | rawExtractError |
  | --- | --- | --- | --- | --- | --- |
  | `gemini-3.8-flash` | 17,336ms | **draft** | 5/6 | MISSING_FIELDS | null |
- 근거 검증 통과 여부: 통과 — `state=draft`에 도달했다는 것은 채워진 5개 필드 모두 원문 근거(quote)와 숫자가 일치해 `draft.ts`의 `groundedInSource` 검증을 통과했다는 의미. `hardAccelPenaltyPoints`는 입력 원문에 해당 문구가 없어 `null`로 남고 `MISSING_FIELDS`만 경고성으로 표시됨(정상 동작, 실패 아님).
- 진단: 이전 실행에서 관찰된 503은 일시적 과부하였음이 확인됨. `gemini-3.8-flash` 모델 ID 자체는 유효하며 실제로 구조화 출력을 정상 반환함.

## 미결정 질문

- ~~`gemini-3.8-flash` 모델 ID가 맞는지~~ → 확인됨(정상 응답), 모델명 변경 불필요.
- P2-8의 `provider.model` 메타 필드를 `RuleDraftResult`에 노출할지(현재는 provider 인스턴스의 getter로만 조회 가능, `draft.ts`/`types.ts` 미반영)는 B·C 합의 후 별도 카드로 진행.
