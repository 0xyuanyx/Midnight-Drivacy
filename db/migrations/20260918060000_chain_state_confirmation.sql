-- 새 연결 모듈용 migration. 원격 Supabase에는 아직 적용하지 않았다.
-- 상태/opening/등록 binding은 비공개 업무 자료다. raw records나 월렛 키는 저장하지 않는다.
BEGIN;
CREATE TABLE public.chain_states (
 scope_key text PRIMARY KEY,
 owner_user_id uuid NOT NULL REFERENCES public.users(id),
 insurance_contract_id uuid NOT NULL REFERENCES public.insurance_contracts(id),
 special_contract_id uuid NOT NULL REFERENCES public.special_contracts(id),
 registered_rule jsonb NOT NULL,
 confirmed_state jsonb NOT NULL,
 state_commitment text NOT NULL,
 version bigint NOT NULL CHECK (version >= 0 AND version <= 4294967295)
);
CREATE TABLE public.chain_jobs (
 operation_id text PRIMARY KEY,
 scope_key text NOT NULL REFERENCES public.chain_states(scope_key),
 idempotency_key text NOT NULL,
 trip_id text NOT NULL,
 previous_commitment text NOT NULL,
 source_key text NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'db-confirmed', 'abandoned')),
 claim_token uuid,
 claim_expires_at timestamptz,
 confirmed_result jsonb,
 deletion_status text NOT NULL DEFAULT 'pending' CHECK (deletion_status IN ('pending', 'deleted')),
 UNIQUE (scope_key, idempotency_key)
);
CREATE UNIQUE INDEX chain_jobs_one_pending_scope ON public.chain_jobs(scope_key) WHERE status = 'pending';
ALTER TABLE public.chain_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chain_states, public.chain_jobs FROM PUBLIC, anon, authenticated;
COMMIT;
