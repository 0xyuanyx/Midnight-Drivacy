# 첫 수직 기능 DB 기록

`20260917142636_initial_first_vertical.sql`은 이미 Supabase 원격 프로젝트에 적용된 Migration의 동일본이다. 저장소 보존·재현을 위한 파일이므로 기존 원격 프로젝트에 다시 실행하지 않는다.

`20260918025120_add_special_contract_selection.sql`도 원격에 이미 적용된 동일본이다. `special_contract_selections`는 특약 자체의 상태와 DRIVER의 현재 선택 상태를 분리한다. 계약당 하나의 현재 선택만 `UNIQUE (insurance_contract_id)`로 허용하고, `(special_contract_id, insurance_contract_id)` 복합 FK로 다른 계약 특약을 선택할 수 없게 한다. 이 테이블도 RLS와 직접 권한 회수를 유지하므로 Backend의 `pg` 접근만 사용한다.

개발용 demo fixture는 migration과 분리된 `db/seeds/dev_first_vertical.sql`에 있다. 실행 시 개발 DRIVER UUID를 명시적으로 넘겨야 하며, 실제 UUID나 인증정보를 저장소에 넣지 않는다.

## DB Row와 Shared API 계약 매핑

DB Row는 Shared API 객체와 1:1이 아니다. Backend가 객체 접근 권한을 검사한 뒤 다음 JOIN 및 변환을 수행할 예정이며, 이 문서는 향후 API 구현을 지시하지 않는다.

| DB 원본 | Shared 출력 |
| --- | --- |
| `insurance_contracts.owner_user_id` | `InsuranceContract.ownerUserId` |
| `insurance_contracts.coverage_starts_at` | `InsuranceContract.coverageStartsAt` |
| `insurance_contracts.coverage_ends_at` | `InsuranceContract.coverageEndsAt` |
| `insurers.name` JOIN 결과 | `InsuranceContract.insurerName`, `SpecialContract.insurerName` |
| `special_contracts`의 계약별 행 | `InsuranceContract.specialContracts[]` |
| `special_contracts.insurance_contract_id` | `SpecialContract.insuranceContractId` |
| PostgreSQL `timestamptz` | API 경계의 ISO 8601 문자열 |
| Supabase Auth의 검증된 이메일 | `User.email` |
| `user_roles.role` | `User.role` |

`insurerName`은 중복 컬럼으로 저장하지 않는다. 계약·특약 응답은 `insurers` JOIN 결과로 조립한다.

## 현재 계약 차이와 보류 사항

- Shared `Consent.consentedAt`은 필수 ISO 8601 문자열이지만, DB `consents.consented_at`은 원격 적용본대로 NULL을 허용한다. 동의 시각을 반드시 기록할지 확정한 뒤 API 경계 또는 후속 Migration에서 조정한다.
- DB ID는 UUID이고 Shared ID는 비어 있지 않은 문자열이다. UUID는 문자열로 표현 가능하며, API UUID 엄격 검증을 채택할 근거가 아직 없어 Shared는 변경하지 않는다.
- INSURER 계정과 `insurers` 행의 연결, 서버 전용 pg 실행 계정/권한, 동의 종류·버전·철회 및 사용자 삭제 정책은 미정이다. MVP는 보험계약당 현재 특약 선택 하나를 유지하며, 선택 이력과 복수 선택 확장은 후속 결정 사항이다.

## 권한 경계

일곱 업무 테이블은 RLS를 활성화하고 `PUBLIC`, `anon`, `authenticated`의 직접 권한을 회수했다. 브라우저 직접 정책은 만들지 않았으며, 서버 전용 접근 방식과 권한은 후속 단계에서 결정한다. Connection String·비밀번호·Supabase Secret은 이 저장소나 이 문서에 기록하지 않는다.
