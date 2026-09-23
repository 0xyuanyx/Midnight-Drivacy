BEGIN;

-- 신청의 owner·보험계약·특약이 하나의 Scope에서 나온 값임을 복합 FK로 묶기 위한 참조 키다.
ALTER TABLE public.evaluation_scopes
  ADD CONSTRAINT evaluation_scopes_application_binding_unique
  UNIQUE (id, owner_user_id, insurance_contract_id, special_contract_id);

CREATE TABLE public.discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  insurance_contract_id uuid NOT NULL REFERENCES public.insurance_contracts(id) ON DELETE RESTRICT,
  special_contract_id uuid NOT NULL REFERENCES public.special_contracts(id) ON DELETE RESTRICT,
  evaluation_scope_id uuid NOT NULL REFERENCES public.evaluation_scopes(id) ON DELETE RESTRICT,
  rule_version_id uuid NOT NULL REFERENCES public.rule_versions(id) ON DELETE RESTRICT,
  state_commitment text NOT NULL,
  state_version bigint NOT NULL CHECK (state_version > 0 AND state_version <= 4294967295),
  rule_hash text NOT NULL,
  evaluation_operation_id uuid NOT NULL UNIQUE,
  result_commitment text,
  nullifier text,
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'FAILED')),
  review_status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (review_status IN ('PENDING_REVIEW', 'APPLIED', 'REJECTED')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  distance_m bigint NOT NULL CHECK (distance_m BETWEEN 0 AND 4294967295),
  conditions_met boolean NOT NULL,
  expected_discount_bps integer NOT NULL CHECK (expected_discount_bps BETWEEN 0 AND 10000),
  applied_discount_bps integer CHECK (applied_discount_bps BETWEEN 0 AND 10000),
  network text NOT NULL CHECK (network IN ('local', 'preprod')),
  adapter_profile text NOT NULL,
  chain_contract_address text NOT NULL,
  transaction_id text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT discount_applications_scope_binding_fkey
    FOREIGN KEY (evaluation_scope_id, owner_user_id, insurance_contract_id, special_contract_id)
    REFERENCES public.evaluation_scopes(id, owner_user_id, insurance_contract_id, special_contract_id)
    ON DELETE RESTRICT,
  CONSTRAINT discount_applications_contract_special_fkey
    FOREIGN KEY (special_contract_id, insurance_contract_id)
    REFERENCES public.special_contracts(id, insurance_contract_id)
    ON DELETE RESTRICT,
  CONSTRAINT discount_applications_scope_state_unique UNIQUE (evaluation_scope_id, state_commitment),
  CONSTRAINT discount_applications_nullifier_unique UNIQUE (nullifier),
  -- ZK 검증 성공과 보험사의 할인 적용 결정은 다른 의미이므로 각 상태의 완료 조건을 분리한다.
  CONSTRAINT discount_applications_verification_consistency CHECK (
    (verification_status = 'PENDING' AND result_commitment IS NULL AND nullifier IS NULL AND verified_at IS NULL)
    OR (verification_status = 'VERIFIED' AND result_commitment IS NOT NULL AND nullifier IS NOT NULL AND verified_at IS NOT NULL)
    OR (verification_status = 'FAILED' AND result_commitment IS NULL AND nullifier IS NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT discount_applications_review_consistency CHECK (
    (review_status = 'PENDING_REVIEW' AND applied_discount_bps IS NULL AND decided_at IS NULL)
    OR (review_status = 'APPLIED' AND verification_status = 'VERIFIED'
      AND applied_discount_bps = expected_discount_bps AND decided_at IS NOT NULL)
    OR (review_status = 'REJECTED' AND verification_status = 'VERIFIED'
      AND applied_discount_bps IS NULL AND decided_at IS NOT NULL)
  )
);

-- 동일 Confirmed State의 병렬 신청이 두 건 생성되지 않도록 UNIQUE 제약을 최종 방어선으로 둔다.
-- C가 같은 State에 다른 result salt를 사용하더라도 같은 평가를 재사용하지 못하도록 nullifier도 별도로 UNIQUE 처리한다.
CREATE INDEX discount_applications_owner_submitted_idx
  ON public.discount_applications(owner_user_id, submitted_at DESC);
CREATE INDEX discount_applications_insurer_review_idx
  ON public.discount_applications(insurance_contract_id, review_status, submitted_at DESC);

-- 원본 운행정보·salt·witness를 이 테이블에 복제하지 않아 보험 업무 DB로 비공개 입력이 확산되지 않게 한다.
-- 브라우저 Data API가 업무 승인 상태를 우회 변경하지 못하도록 Backend 전용 DB 경계만 허용한다.
ALTER TABLE public.discount_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discount_applications FROM PUBLIC, anon, authenticated;

COMMIT;
