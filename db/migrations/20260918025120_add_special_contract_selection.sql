-- 이 파일은 이미 원격 Supabase에 적용된 migration의 동일본이다.
-- 기존 원격 프로젝트에 다시 실행하지 않는다.

BEGIN;

-- 복합 FK의 참조 대상에는 같은 컬럼 순서의 UNIQUE 제약이 먼저 필요하다.
ALTER TABLE public.special_contracts
 ADD CONSTRAINT special_contracts_id_insurance_contract_id_key
 UNIQUE (id, insurance_contract_id);

-- 특약 자체의 상태와 DRIVER가 현재 선택한 특약은 의미가 다르므로 별도 테이블로 관리한다.
CREATE TABLE public.special_contract_selections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 insurance_contract_id uuid NOT NULL
   REFERENCES public.insurance_contracts(id) ON DELETE RESTRICT,
 special_contract_id uuid NOT NULL,
 selected_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT special_contract_selections_one_per_contract
   UNIQUE (insurance_contract_id),
 -- 복합 FK는 선택한 특약이 반드시 같은 보험계약 소속임을 DB에서도 보장한다.
 CONSTRAINT special_contract_selections_contract_special_fkey
   FOREIGN KEY (special_contract_id, insurance_contract_id)
   REFERENCES public.special_contracts(id, insurance_contract_id)
   ON DELETE RESTRICT
);

CREATE INDEX special_contract_selections_special_contract_id_idx
ON public.special_contract_selections(special_contract_id);

-- 기존 공통 trigger가 갱신 시각을 일관되게 관리하므로 application이 updated_at을 계산하지 않는다.
CREATE TRIGGER special_contract_selections_updated_at
BEFORE UPDATE ON public.special_contract_selections
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

-- 브라우저가 업무 테이블을 직접 접근하지 않고 Backend가 객체 권한을 검사하는 경계를 유지한다.
ALTER TABLE public.special_contract_selections ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.special_contract_selections
FROM PUBLIC, anon, authenticated;

COMMIT;
