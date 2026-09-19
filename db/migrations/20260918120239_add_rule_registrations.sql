-- Remote Supabase에 적용된 migration 이력을 Git에도 보존한다.
BEGIN;

CREATE TABLE public.evaluation_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 insurance_contract_id uuid NOT NULL REFERENCES public.insurance_contracts(id) ON DELETE RESTRICT,
 special_contract_id uuid NOT NULL,
 evaluation_period_id text NOT NULL,
 evaluation_starts_on date NOT NULL,
 evaluation_ends_on date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT evaluation_scopes_contract_special_fkey FOREIGN KEY (special_contract_id, insurance_contract_id)
   REFERENCES public.special_contracts(id, insurance_contract_id) ON DELETE RESTRICT,
 CONSTRAINT evaluation_scopes_one_per_subscription UNIQUE (owner_user_id, insurance_contract_id, special_contract_id),
 CONSTRAINT evaluation_scopes_period_order CHECK (evaluation_starts_on <= evaluation_ends_on)
);

CREATE INDEX evaluation_scopes_insurance_contract_id_idx ON public.evaluation_scopes(insurance_contract_id);
CREATE INDEX evaluation_scopes_special_contract_id_idx ON public.evaluation_scopes(special_contract_id);

-- 최초 구조: 특약 Rule version별 registration 기록. 다음 migration에서 가입자 Scope별 계약으로 정렬한다.
CREATE TABLE public.rule_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 rule_version_id uuid NOT NULL REFERENCES public.rule_versions(id) ON DELETE RESTRICT,
 rule_hash text NOT NULL,
 registration_transaction_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_scopes, public.rule_registrations FROM PUBLIC, anon, authenticated;
COMMIT;
