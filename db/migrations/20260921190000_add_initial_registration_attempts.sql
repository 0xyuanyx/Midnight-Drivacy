-- 최초 계약 배포의 외부 거래 전에 시도 ID를 영속화한다.
-- 배포/초기화 결과가 불명인 재요청은 새 계약을 만들지 않고 C 상태 조회를 기다린다.
-- 원격 Supabase에는 아직 적용하지 않았다.
BEGIN;
CREATE TABLE public.initial_registration_attempts (
  operation_id uuid PRIMARY KEY,
  evaluation_scope_id uuid NOT NULL REFERENCES public.evaluation_scopes(id) ON DELETE RESTRICT,
  rule_version_id uuid NOT NULL REFERENCES public.rule_versions(id) ON DELETE RESTRICT,
  network text NOT NULL CHECK (network IN ('fixture', 'local', 'preprod')),
  adapter_profile text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'db-confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT initial_registration_attempts_scope_runtime_unique
    UNIQUE (evaluation_scope_id, network, adapter_profile)
);
ALTER TABLE public.initial_registration_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.initial_registration_attempts FROM PUBLIC, anon, authenticated;
COMMIT;
