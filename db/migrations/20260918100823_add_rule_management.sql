-- 이 파일은 원격 Supabase에 이미 적용된 migration의 동일본이다.
-- 기존 원격 프로젝트에 다시 실행하지 않는다.

BEGIN;

-- 한 사용자는 여러 보험사의 소속 담당자가 될 수 있으므로 user_id 단독 UNIQUE를 두지 않는다.
-- 보험사 담당자 여부는 사용자 역할과 별개로 insurer_memberships에서 표현한다.
CREATE TABLE public.insurer_memberships (
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 insurer_id uuid NOT NULL REFERENCES public.insurers(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, insurer_id)
);

CREATE INDEX insurer_memberships_insurer_id_idx
ON public.insurer_memberships(insurer_id);

-- Rule은 특약당 하나의 논리적 규칙만 나타낸다. insurer_id는 특약과 보험계약의 관계로 알 수 있어 중복 저장하지 않는다.
CREATE TABLE public.rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 special_contract_id uuid NOT NULL
   REFERENCES public.special_contracts(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT rules_one_per_special_contract UNIQUE (special_contract_id)
);

-- Rule Version은 논리적 Rule의 변경 이력을 나타낸다. version은 unsigned 32-bit 범위를 보존하기 위해 bigint로 저장한다.
CREATE TABLE public.rule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 rule_id uuid NOT NULL REFERENCES public.rules(id) ON DELETE RESTRICT,
 version bigint NOT NULL,
 status text NOT NULL,
 rule_definition jsonb NOT NULL,
 effective_from timestamptz,
 effective_to timestamptz,
 approved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT rule_versions_rule_version_key UNIQUE (rule_id, version),
 CONSTRAINT rule_versions_version_range_check
   CHECK (version >= 1 AND version <= 4294967295),
 CONSTRAINT rule_versions_status_check
   CHECK (status IN ('DRAFT', 'APPROVED')),
 CONSTRAINT rule_versions_definition_object_check
   CHECK (jsonb_typeof(rule_definition) = 'object'),
 CONSTRAINT rule_versions_effective_period_check
   CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to),
 -- 승인 상태와 승인 메타데이터를 함께 강제해 승인 주체·시각이 없는 승인본을 막는다.
 CONSTRAINT rule_versions_approval_metadata_check
   CHECK (
     (status = 'DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
     OR
     (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
   )
);

CREATE TRIGGER rules_updated_at
BEFORE UPDATE ON public.rules
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

CREATE TRIGGER rule_versions_updated_at
BEFORE UPDATE ON public.rule_versions
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

-- 승인된 규칙 버전은 계산·증명 근거가 바뀌지 않도록 수정과 삭제를 허용하지 않는다.
-- DRAFT에서 APPROVED로의 전이는 OLD.status가 DRAFT이므로 허용된다.
CREATE OR REPLACE FUNCTION public.drivacy_prevent_approved_rule_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved rule versions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.drivacy_prevent_approved_rule_version_mutation()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rule_versions_prevent_approved_update
BEFORE UPDATE ON public.rule_versions
FOR EACH ROW EXECUTE FUNCTION public.drivacy_prevent_approved_rule_version_mutation();

CREATE TRIGGER rule_versions_prevent_approved_delete
BEFORE DELETE ON public.rule_versions
FOR EACH ROW EXECUTE FUNCTION public.drivacy_prevent_approved_rule_version_mutation();

-- 브라우저 직접 정책은 만들지 않고 Backend 경계에서 권한을 검사한다.
ALTER TABLE public.insurer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
 public.insurer_memberships,
 public.rules,
 public.rule_versions
FROM PUBLIC, anon, authenticated;

COMMIT;
