# Rule 초안 DTO·단위 제안서 (P1-1)

작성일: 2026-09-18 (KST). 작성자: A(Rule 초안 담당) 관점. 이 문서는 **제안서**이며 `packages/shared`를 수정하지 않는다. B·C 합의 후 확정한다.
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

## 2. 후보 필드 (제안, 전부 정수)

**확정(D2, `docs/PLAN_DECISIONS.md`)**: 내부 저장·해시·회로 입력은 정수만(거리 m, 점수 0~100, 할인 정수 %, 감점 정수 점). 화면 표시만 km로 환산한다. 원문 단위(km 등)를 정수 m로 변환하는 책임은 A 초안 모듈이 지며, 원문 근거는 원단위 그대로 보존한다.

| 필드명 | 타입 | 범위 | 단위 | 상태 |
| --- | --- | --- | --- | --- |
| `minimumDistanceM` | integer | 0 ~ 2,000,000 | 미터 | 확정(D2) — 필드명·정수 m은 D2, 상한값 2,000,000은 **제안**(원본 `rule-draft.mjs`의 1,000,000km 상한을 m 단위로 재검토한 값, 근거 재확인 필요) |
| `minimumScore` | integer | 0 ~ 100 | 점 | 확정(D2) |
| `discountPercent` | integer | 0 ~ 100 | % | 확정(D2, 정수 %). 소수 할인율이 필요하면 대안으로 `discountBasisPoints`(0~10,000, 1bp=0.01%) 병기 — **제안**, C·B 확인 필요 |
| `speedingPenaltyPoints` | integer | 0 ~ 100 | 점 | 확정(D2) |
| `hardBrakePenaltyPoints` | integer | 0 ~ 100 | 점 | 확정(D2) |
| `hardAccelPenaltyPoints` | integer | 0 ~ 100 | 점 | **제안(신규 필드)** — 근거: D4(확정)가 보험사 공개 항목으로 "항목별 가감점"을 명시하며 급가속을 감점 항목에 포함하는 방향과 일치. §1.2 원본 5개 필드에는 없던 필드이므로 B·C 확인 필요 |

각 필드는 `evidence: string | null` 쌍을 가진다(원문 근거 문구, 원단위 그대로 보존 — 예: "최소 100km 이상"). `evidence`가 `null`이면 해당 필드 `values`도 `null`이어야 한다(§1.2 검증 로직 승계, **확정** 근거는 원본 코드 동작).

---

## 3. 응답 예시

### 3.1 `draft` (일부 필드만 채워짐)

```json
{
  "state": "draft",
  "reviewRequired": true,
  "values": {
    "minimumDistanceM": 100000,
    "minimumScore": 80,
    "discountPercent": 10,
    "speedingPenaltyPoints": 5,
    "hardBrakePenaltyPoints": 3,
    "hardAccelPenaltyPoints": null
  },
  "evidence": {
    "minimumDistanceM": "최소 100km 이상 주행",
    "minimumScore": "안전운전 점수 80점 이상",
    "discountPercent": "보험료 10% 할인",
    "speedingPenaltyPoints": "과속 1회당 5점 감점",
    "hardBrakePenaltyPoints": "급제동 1회당 3점 감점",
    "hardAccelPenaltyPoints": null
  },
  "issues": ["MISSING_FIELDS"]
}
```

### 3.2 `manual_required` (근거 검증 실패 예시)

```json
{
  "state": "manual_required",
  "reviewRequired": true,
  "values": {
    "minimumDistanceM": null,
    "minimumScore": null,
    "discountPercent": null,
    "speedingPenaltyPoints": null,
    "hardBrakePenaltyPoints": null,
    "hardAccelPenaltyPoints": null
  },
  "evidence": {
    "minimumDistanceM": null,
    "minimumScore": null,
    "discountPercent": null,
    "speedingPenaltyPoints": null,
    "hardBrakePenaltyPoints": null,
    "hardAccelPenaltyPoints": null
  },
  "issues": ["UNVERIFIED_EXTRACTION"]
}
```

### 3.3 `issues` 코드표

| 코드 | 출처 | 의미 |
| --- | --- | --- |
| `EMPTY_INPUT` | §1.2 원본 | 입력 텍스트가 비어 있음 |
| `INPUT_TOO_LONG` | §1.2 원본 | 텍스트 20,000자 초과 |
| `EXTRACTION_FAILED` | §1.2 원본 | Provider 호출 자체가 예외를 던짐 |
| `UNVERIFIED_EXTRACTION` | §1.2 원본 | 값이 범위를 벗어나거나 원문 근거와 숫자가 일치하지 않음 |
| `NO_SUPPORTED_FIELDS` | §1.2 원본 | 지원 필드 전부 `null` |
| `MISSING_FIELDS` | §1.2 원본 | 일부 필드만 채워짐(경고성, `draft` 상태에서도 발생 가능) |
| `PROVIDER_UNAVAILABLE` | **신규 제안** | Gemini API 키 미설정 또는 Provider 초기화 실패 → `manual_required`로 전환 |
| `PROVIDER_TIMEOUT` | **신규 제안** | Provider 호출이 타임아웃(기본 20s, P2-3 제안값)됨 |
| `PDF_NO_TEXT` | **신규 제안** | PDF에서 추출 가능한 텍스트가 없음(OCR 미지원) |
| `PDF_TOO_LARGE` | **신규 제안** | PDF 크기·페이지 수가 한도 초과(P1-2 한도표 참조) |

---

## 4. C와 합의할 표 (미정 — A 권고만)

**원칙(확정 방향): "LLM은 산식 의미를 정하지 않는다."** A 모듈은 원문에서 숫자를 추출·검증할 뿐, 감점·할인 계산식이나 회로 입력 순서를 정의하지 않는다.

| 항목 | A 권고 | 상태 |
| --- | --- | --- |
| 단위 | 위 §2 표(정수 m/점/%) | 미정 — D2로 필드 개념은 확정됐으나 회로 입력 폭(bit width)·Field 타입 매핑은 C 확인 필요 |
| 범위 | 위 §2 표 | 미정 — `minimumDistanceM` 상한 2,000,000은 A 임시값, C·B 재검토 필요 |
| 반올림 | 소수 할인이 필요할 경우 절삭(내림) 권고, 근거: 보험사에 불리하지 않은 방향 | 미정 |
| 직렬화 순서 | §2 표의 필드 나열 순서(minimumDistanceM → minimumScore → discountPercent → speedingPenaltyPoints → hardBrakePenaltyPoints → hardAccelPenaltyPoints) 권고 | 미정 — 해시 입력 순서는 C가 회로 설계에서 최종 결정 |
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

## 6. 참고 — feat 설계 문서의 미구현 연결점

`origin/feat:docs/DRIVING_SIMULATION.md`의 "기존 코드와 연결하는 위치" 절은 `packages/shared/src/bc-contract.ts`, `packages/core/src/calculation.ts`, `packages/midnight/src/state-adapter.ts`, `packages/midnight/src/trip-job.ts`를 언급하지만 §1.1 확인 결과 **이 파일들은 현재 저장소에 존재하지 않는 설계상 경로**다. 이 문서의 Rule 초안 계약은 위 파일들의 존재를 전제하지 않으며, 향후 C·B 구현 시점에 재확인이 필요하다.

---

## 미검증 항목

실제 Gemini 호출, 실제 PDF 추출, 승인 API 존재 여부 — 모두 미구현. 이 문서는 계약 제안이며 구현이 아니다.
