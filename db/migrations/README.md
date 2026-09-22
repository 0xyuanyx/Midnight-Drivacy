# 첫 수직 기능 DB 기록

`20260917142636_initial_first_vertical.sql`은 이미 Supabase 원격 프로젝트에 적용된 Migration의 동일본이다. 저장소 보존·재현을 위한 파일이므로 기존 원격 프로젝트에 다시 실행하지 않는다.

`20260918025120_add_special_contract_selection.sql`도 원격에 이미 적용된 동일본이다. `special_contract_selections`는 특약 자체의 상태와 DRIVER의 현재 선택 상태를 분리한다. 계약당 하나의 현재 선택만 `UNIQUE (insurance_contract_id)`로 허용하고, `(special_contract_id, insurance_contract_id)` 복합 FK로 다른 계약 특약을 선택할 수 없게 한다. 이 테이블도 RLS와 직접 권한 회수를 유지하므로 Backend의 `pg` 접근만 사용한다.

개발용 demo fixture는 migration과 분리된 `db/seeds/dev_first_vertical.sql`에 있다. 실행 시 개발 DRIVER UUID를 명시적으로 넘겨야 하며, 실제 UUID나 인증정보를 저장소에 넣지 않는다.

모의 주행과 처리 계약은 이후 원격 적용된 migration으로 추가됐다. `driving_sessions`는 생성 당시 Rule Version과 Idempotency-Key를 보관하고, `chain_states`·`chain_jobs`는 확정 State 및 처리 작업을 보관한다. 이 문서는 해당 원격 이력의 동일본을 보존하며, 로컬 파일을 기존 원격 Supabase에 다시 실행하지 않는다.

## Rule DB 기반

`20260918100823_add_rule_management.sql`과 `20260918100935_fix_rule_version_trigger_search_path.sql`은 원격 Supabase에 이미 적용된 migration의 동일본이다. 전자는 `insurer_memberships`, `rules`, `rule_versions`를 추가하고, 후자는 승인본 변경 차단 trigger 함수의 `search_path`를 고정한다.

`insurer_memberships`는 한 사용자가 여러 보험사에 소속될 수 있으므로 `user_id` 단독 UNIQUE를 두지 않는다. 특약 하나에는 논리적 Rule 하나만 연결하며, Rule Version은 그 Rule의 버전을 보관한다. 버전 정의는 JSONB 객체로만 저장하고 `DRAFT` 또는 `APPROVED` 상태를 사용한다. 승인본은 갱신·삭제할 수 없지만 DRAFT에서 APPROVED로의 전이는 가능하다. Rule Hash·Midnight 연동은 이 migration에 포함하지 않는다.

## DB Row와 Shared API 계약 매핑

## 가입자별 Rule registration 기반

`20260918120239_add_rule_registrations.sql`과 `20260918120817_align_rule_registration_with_subscriber_scope.sql`은 원격 Supabase에 적용된 이력을 그대로 보존한다. 후자는 최초 registration 구조를 가입자별 Scope와 Chain Contract 모델로 정렬한다.

- `evaluation_scopes`는 특약을 선택한 가입자의 누적 평가 범위다. 시작일은 `selected_at`, 종료일은 보험계약 `coverage_ends_at`을 KST 날짜로 저장하며, period ID는 최초 생성 뒤 Rule version 변경에도 유지한다.
- `chain_scope_deployments`는 가입자 Scope·network·adapter profile별 Chain Contract다.
- `rule_registrations`는 동일 Chain Contract에 등록된 Rule version 이력이다.

`rule_registrations_rule_version_id_idx`는 Rule version 기준 registration 조회를 위한 인덱스이며, 원격 적용 구조와 동일하게 보존한다.

`20260919131613_add_current_rule_version_to_chain_deployments.sql`과 `20260919131643_index_current_rule_registration_fk.sql`은 현재 runtime Deployment의 실제 chain-confirmed 적용 Rule을 명시한다. `current_rule_version_id`는 단순 APPROVED Rule이 아니라 같은 Deployment의 `rule_registrations` 이력에 존재하는 version만 가리킬 수 있다.

`20260919125224_add_driving_simulation_sessions.sql`은 모의 운행 metadata인 `driving_sessions`와 비공개 원본인 `driving_segments`를 추가한다. Session은 Scope·생성 당시 Rule Version·Idempotency-Key와 연결하고, Segment의 contiguous 순서가 후속 Core/Merkle 입력이 된다. DB `bigint` metric은 Backend에서 Shared uint32 number로 범위를 검증해 변환한다.

`20260922071137_guard_driving_generation_state.sql`은 **Supabase 원격에 이미 적용된** migration의 동일본이다. 새 Session에 `generation_state_commitment`를 기록하고 `(evaluation_scope_id, generation_state_commitment)` 부분 UNIQUE 인덱스로 동일 Confirmed State의 중복 소비를 막는다. 과거 Session은 당시 commitment를 안전하게 복원할 수 없으므로 NULL로 유지하며, 부분 인덱스 대상이 아니다. 이 파일은 원격 이력을 보존하는 용도이므로 기존 원격 Supabase에 다시 실행하지 않는다.

Rule 변경은 평가 Scope나 누적 State를 초기화하지 않고, 기존 deployment와 v1 registration을 보존한 채 새 version registration만 추가한다. 신규 세 테이블도 RLS를 활성화하고 `PUBLIC`, `anon`, `authenticated`의 직접 권한을 부여하지 않는다.

`20260921190000_add_initial_registration_attempts.sql`은 최초 배포 외부 호출 전 `operation_id`를 Scope·runtime별로 영속화하는 후속 migration이다. B의 Fake Adapter 검사는 같은 ID의 C `not-submitted`/`chain-confirmed` 상태에 따라 안전한 재시도·DB 복구를 분기한다. 실제 C의 영속 거래 상태 조회는 아직 없으므로 운영 복구가 완성된 것은 아니다. 이 파일은 **원격 Supabase에 아직 적용하지 않았다**. 앞서 추가된 `20260918060000_chain_state_confirmation.sql`도 별도 로컬 검증용이며 원격 적용 완료로 보지 않는다.

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
- INSURER 계정과 `insurers` 행의 연결은 `insurer_memberships` 스키마로 표현할 수 있지만, 현재 fixture·소속 행은 만들지 않았다. 서버 전용 pg 실행 계정/권한, 동의 종류·버전·철회 및 사용자 삭제 정책은 미정이다. MVP는 보험계약당 현재 특약 선택 하나를 유지하며, 선택 이력과 복수 선택 확장은 후속 결정 사항이다.

## 권한 경계

열 업무 테이블은 RLS를 활성화하고 `PUBLIC`, `anon`, `authenticated`의 직접 권한을 회수했다. 브라우저 직접 정책은 만들지 않았으며, 서버 전용 접근 방식과 권한은 후속 단계에서 결정한다. Connection String·비밀번호·Supabase Secret은 이 저장소나 이 문서에 기록하지 않는다.
