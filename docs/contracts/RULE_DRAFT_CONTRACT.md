# Rule 초안 DTO·단위 계약 (P1-1 제안 → P2-10 필드 확정)

작성일: 2026-09-18 (KST), 갱신: 2026-09-19 (P2-10). 작성자: A(Rule 초안 담당) 관점. `packages/shared`를 수정하지 않는다. §2 필드는 B `RuleDraftInputSchema`에 맞춰 확정했고, 나머지 절의 `제안`·`미정` 라벨은 그대로 유효하다.
라벨: `확정`(팀 결정 §1.3 또는 `docs/PLAN_DECISIONS.md` D1~D4에 근거) / `제안`(A 권고, 상대 확인 대기) / `미정`.

---

## 1. 초안 상태 머신 (제안)

```
                extract() 성공 + 근거 검증 통과
sourceText ──────────────────────────────────► state: "draft"
   │                                              (values 일부/전부 채움, reviewRequired: true)
   │
   └── 입력 오류 / 추출 실패 / 근거 검증 실패 ──► state: "manual_required"
                                                  (values 전부 null, reviewRequired: true)

draft ─────► (보험사가 값 수정) ─────► B의 승인 흐름 (POST 승인 API, A 영역 밖)
manual_required ─► (보험사가 빈 초안에 직접 입력) ─► 동일한 B 승인 흐름
```

- **제안**: 초안(`draft`/`manual_required`) 응답에는 `approved`, `ruleHash`, `version` 필드가 **없다**. 이 세 필드는 B의 승인 스키마에 속하며 A 모듈은 생성하지 않는다.
- **제안**: `reviewRequired`는 항상 `true`. A 모듈은 "검토 불필요"를 판단하지 않는다.
- **근거**: §1.2(`backend/rule-draft/rule-draft.mjs`)의 두 상태(`draft`/`manual_required`) 구조를 그대로 승계.

---

## 2. 초안 필드 (확정 — P2-10, B `RuleDraftInputSchema` 정렬)

**확정(2026-09-19)**: 초안 `values`의 필드명·단위·범위는 B가 확정한 `@drivacy/shared`의 `RuleDraftInputSchema`(`packages/shared/src/rule-management.ts`)를 그대로 따른다. rule-draft는 각 필드 스키마를 `.shape`에서 가져와 `nullable()`로 감쌀 뿐 자체 범위 상수를 두지 않는다(shared 파일은 수정하지 않음). 거리 정수 m는 D2와 같고, 할인은 D2의 정수 % 대신 B 스키마의 bps(1bp = 0.01%)와 2단계 구조를 따른다.

| 필드명 | 타입 | 범위(B 스키마) | 단위 | 채우는 방법 |
| --- | --- | --- | --- | --- |
| `formula` | literal | `"cumulative-event-deduction-v1"` | - | 상수. LLM이 뽑지 않음, `manual_required`에도 채움 |
| `initialScore` | literal | `100` | 점 | 상수. LLM이 뽑지 않음, `manual_required`에도 채움 |
| `speedingPenalty` | integer \| null | 0 ~ 2^32-1 | 과속 1회당 감점 | 원문 추출 + 근거 대조 |
| `accelerationPenalty` | integer \| null | 0 ~ 2^32-1 | 급가속 1회당 감점 | 원문 추출 + 근거 대조 |
| `brakingPenalty` | integer \| null | 0 ~ 2^32-1 | 급제동 1회당 감점 | 원문 추출 + 근거 대조 |
| `minimumDistanceM` | integer \| null | 0 ~ 2^32-1 | 미터 | 원문 추출. 원문 km는 ×1000 |
| `minimumScore` | integer \| null | 0 ~ 100 | 점 | 원문 추출(기본 단계 기준 점수) |
| `premiumMinimumScore` | integer \| null | 0 ~ 100 | 점 | 원문 추출(2단계 기준 점수). 약관에 2단계가 없으면 `null` → 보험사가 채움 |
| `baseDiscountBps` | integer \| null | 0 ~ 10,000 | bps | 원문 추출. 원문 "10%"는 1000 |
| `premiumDiscountBps` | integer \| null | 0 ~ 10,000 | bps | 원문 추출(2단계 할인). 약관에 2단계가 없으면 `null` → 보험사가 채움 |

- `effectiveFrom`·`effectiveTo`(B 스키마 optional)는 초안에 포함하지 않는다. 보험사가 저장 시 입력한다.
- 교차 조건(`premiumMinimumScore >= minimumScore`, `premiumDiscountBps >= baseDiscountBps`)은 초안에서 검사하지 않는다. B가 전체 입력을 `RuleDraftInputSchema`로 검증할 때 적용된다. 모든 필드가 채워진 초안의 `values`는 그대로 `RuleDraftInputSchema`를 통과한다(테스트로 확인).
- 추출 필드 8개는 각각 `evidence: string | null` 쌍을 가진다. 근거 문구는 **원단위 그대로** 보존하고(예: "누적 100km 이상", "보험료 10% 할인"), 대조는 근거 속 숫자 바로 뒤의 단위로 환산해 한다: 거리 `km`·`㎞`·`킬로미터` ×1000 / `m`·`미터` ×1, 할인 `%`·`퍼센트` ×100 / `bps` ×1, 점수·감점은 단위 없는 숫자만. 단위가 없는 거리·할인 근거는 m/km·%/bps를 판별할 수 없으므로 `UNVERIFIED_EXTRACTION`이다. `evidence`가 `null`이면 `values`도 `null`이어야 한다.

---

## 3. 응답 예시

### 3.1 `draft` (단일 단계 약관 — premium 필드 null)

```json
{
  "state": "draft",
  "reviewRequired": true,
  "values": {
    "formula": "cumulative-event-deduction-v1",
    "initialScore": 100,
    "speedingPenalty": 5,
    "accelerationPenalty": null,
    "brakingPenalty": 3,
    "minimumDistanceM": 100000,
    "minimumScore": 80,
    "premiumMinimumScore": null,
    "baseDiscountBps": 1000,
    "premiumDiscountBps": null
  },
  "evidence": {
    "speedingPenalty": "과속 1회당 5점 감점",
    "accelerationPenalty": null,
    "brakingPenalty": "급제동 1회당 3점 감점",
    "minimumDistanceM": "최소 100km 이상 주행",
    "minimumScore": "안전운전 점수 80점 이상",
    "premiumMinimumScore": null,
    "baseDiscountBps": "보험료 10% 할인",
    "premiumDiscountBps": null
  },
  "issues": ["MISSING_FIELDS"],
  "provider": { "name": "gemini", "model": "gemini-3.8-flash" }
}
```

### 3.2 `manual_required` (근거 검증 실패 예시)

```json
{
  "state": "manual_required",
  "reviewRequired": true,
  "values": {
    "formula": "cumulative-event-deduction-v1",
    "initialScore": 100,
    "speedingPenalty": null,
    "accelerationPenalty": null,
    "brakingPenalty": null,
    "minimumDistanceM": null,
    "minimumScore": null,
    "premiumMinimumScore": null,
    "baseDiscountBps": null,
    "premiumDiscountBps": null
  },
  "evidence": {
    "speedingPenalty": null,
    "accelerationPenalty": null,
    "brakingPenalty": null,
    "minimumDistanceM": null,
    "minimumScore": null,
    "premiumMinimumScore": null,
    "baseDiscountBps": null,
    "premiumDiscountBps": null
  },
  "issues": ["UNVERIFIED_EXTRACTION"],
  "provider": { "name": "gemini", "model": "gemini-3.7-flash" }
}
```

### 3.3 `issues` 코드표

| 코드 | 출처 | 의미 |
| --- | --- | --- |
| `EMPTY_INPUT` | §1.2 원본 | 입력 텍스트가 비어 있음 |
| `INPUT_TOO_LONG` | §1.2 원본 | 텍스트 20,000자 초과 |
| `EXTRACTION_FAILED` | §1.2 원본 | Provider 호출 자체가 예외를 던짐 |
| `UNVERIFIED_EXTRACTION` | §1.2 원본 | 값이 B 스키마 범위를 벗어나거나 원문 근거와 숫자·단위가 일치하지 않음 |
| `NO_SUPPORTED_FIELDS` | §1.2 원본 | 추출 필드 8개 전부 `null` |
| `MISSING_FIELDS` | §1.2 원본 | 추출 필드 일부만 채워짐(경고성, `draft` 상태에서도 발생 가능. 단일 단계 약관은 premium 필드 때문에 항상 발생) |
| `PROVIDER_UNAVAILABLE` | **신규 제안** | Gemini API 키 미설정 또는 Provider 초기화 실패 → `manual_required`로 전환 |
| `PROVIDER_TIMEOUT` | **신규 제안** | Provider 호출이 타임아웃(기본 20s, P2-3 제안값)됨 |
| `PDF_NO_TEXT` | **신규 제안** | PDF에서 추출 가능한 텍스트가 없음(OCR 미지원) |
| `PDF_TOO_LARGE` | **신규 제안** | PDF 크기·페이지 수가 한도 초과(P1-2 한도표 참조) |

### 3.4 `provider` 메타 필드 (P2-9, 확정 — 2026-09-19 사용자 결정)

모든 `RuleDraftResult`(`draft`·`manual_required` 공통)에 `provider: { name: "gemini" | "fake", model: string | null }`가 포함된다. A 패키지 내부 DTO이므로 B·C 합의 대상이 아니다.

| 상황 | `model` 값 |
| --- | --- |
| 정상 초안(`draft`) 또는 호출 후 검증 실패(`UNVERIFIED_EXTRACTION` 등) | 실제로 응답한 모델 ID. 기본 모델의 재시도(503·429·네트워크)가 모두 실패해 `GEMINI_FALLBACK_MODELS`의 모델이 응답했다면 그 폴백 모델 ID |
| 호출 후 전부 실패(`PROVIDER_UNAVAILABLE`·`PROVIDER_TIMEOUT`·4xx 등 `EXTRACTION_FAILED`) | 마지막으로 시도한 모델 ID |
| 호출 전 실패(`EMPTY_INPUT`·`INPUT_TOO_LONG`) 또는 `fake` provider | `null` |

모델 ID는 provider가 호출마다 반환한다(`DraftProvider.extract()` → `{ candidate, model }`). 공유 provider 인스턴스의 상태로 읽지 않으므로 동시 요청끼리 모델 정보가 섞이지 않는다. `GEMINI_FALLBACK_MODELS` 기본값(`gemini-3.7-flash,gemini-3.5-flash`)은 현행 유지(503은 모델과 무관하게 발생함을 실측으로 확인했다).

---

## 4. C와 합의할 표 (미정 — A 권고만)

**원칙(확정 방향): "LLM은 산식 의미를 정하지 않는다."** A 모듈은 원문에서 숫자를 추출·검증할 뿐, 감점·할인 계산식이나 회로 입력 순서를 정의하지 않는다.

| 항목 | A 권고 | 상태 |
| --- | --- | --- |
| 단위 | 위 §2 표(정수 m/점/bps) | 확정(P2-10) — B `RuleDraftInputSchema`·C `bc-contract.ts`와 같은 필드 |
| 범위 | 위 §2 표 | 확정(P2-10) — B 스키마 범위 사용, A 임시 상한 2,000,000 폐기 |
| 반올림 | 하지 않음. bps로 소수 둘째 자리 %까지 정수 표현(12.5% → 1250). 그보다 작은 소수는 정수가 아니어서 `UNVERIFIED_EXTRACTION` | 확정(P2-10 구현) |
| 직렬화 순서 | A는 정하지 않음 | 확정 — Rule Hash 입력 순서는 C `packages/shared/src/bc-contract.ts`가 정의 |
| 해시 입력 | Rule 초안 자체는 해시 입력에 포함되지 않음(승인 후 `ruleHash`는 B·C 영역) | 미정 |

---

## 5. B와 합의할 표 (미정 — A 권고만)

| 항목 | A 권고 | 상태 |
| --- | --- | --- |
| INSURER 인증 | `origin/feat`의 기존 `require-role` 미들웨어(INSURER 역할) 재사용 권고 | 미정 — B 확인 필요(P1-2에서 상세) |
| 특약 접근권한 | 초안 생성 API는 보험사 자신의 특약(`special-contracts/:id`)에만 접근 권장, 소유권 검사는 B의 기존 관례 재사용 | 미정 |
| 요청 크기 한도 | 텍스트 20,000자(§1.2 원본과 동일), PDF 5MB·20페이지(P2-4 제안값) | 미정 — B가 인프라(Cloud Run 요청 크기 등) 제약과 대조 필요 |
| 초안 → 수정/승인 API 전달 방식 | 초안 API는 상태만 반환, 별도의 승인 API(B 소유)가 수정된 값을 받아 `ruleHash`·`version`·`approved`를 부여하는 방식 권고(P1-2에서 상세 제안) | 미정 |

---

## 6. 참고 — feat 설계 문서의 연결점

P1-1 작성 시점에는 없던 `packages/shared/src/bc-contract.ts`, `packages/core/src/calculation.ts`, `packages/midnight/src/state-adapter.ts`, `packages/midnight/src/trip-job.ts`가 2026-09-19 원격 `feat`에 추가됐다(B·C 구현). 이 문서의 초안 필드는 B `RuleDraftInputSchema`와 1:1이며, 초안 자체는 해시·계산·증명 입력이 아니다(승인 후 B·C 영역).

---

## 미검증 항목

P2-10 필드(8개 추출 + 상수 2개)로 바꾼 뒤 실제 Gemini 호출은 하지 않았다(`GEMINI_TRIAL_LOG.md`의 기록은 P2-10 이전 6필드 기준). 실제 약관 PDF, rule-draft → B `rules` API 연결(P2-6)은 미검증·미구현.
