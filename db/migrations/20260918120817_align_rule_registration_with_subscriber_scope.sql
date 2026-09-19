-- 가입자별 Scope가 서로 다른 Chain Contract를 갖도록 최초 registration 구조를 교정한다.
BEGIN;

CREATE TABLE public.chain_scope_deployments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evaluation_scope_id uuid NOT NULL REFERENCES public.evaluation_scopes(id) ON DELETE RESTRICT,
 adapter_profile text NOT NULL,
 network text NOT NULL CHECK (network IN ('fixture', 'local', 'preprod')),
 chain_contract_address text NOT NULL,
 deployment_transaction_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT chain_scope_deployments_scope_runtime_unique UNIQUE (evaluation_scope_id, network, adapter_profile),
 CONSTRAINT chain_scope_deployments_address_unique UNIQUE (network, chain_contract_address),
 CONSTRAINT chain_scope_deployments_transaction_unique UNIQUE (network, deployment_transaction_id)
);

ALTER TABLE public.rule_registrations ADD COLUMN chain_scope_deployment_id uuid;
ALTER TABLE public.rule_registrations
  ADD CONSTRAINT rule_registrations_chain_scope_deployment_id_fkey
  FOREIGN KEY (chain_scope_deployment_id) REFERENCES public.chain_scope_deployments(id) ON DELETE RESTRICT;
ALTER TABLE public.rule_registrations ALTER COLUMN chain_scope_deployment_id SET NOT NULL;
ALTER TABLE public.rule_registrations ADD CONSTRAINT rule_registrations_deployment_rule_unique
  UNIQUE (chain_scope_deployment_id, rule_version_id);
CREATE INDEX rule_registrations_rule_version_id_idx ON public.rule_registrations(rule_version_id);

ALTER TABLE public.chain_scope_deployments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chain_scope_deployments FROM PUBLIC, anon, authenticated;
COMMIT;
