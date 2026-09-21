-- 10단계 DB 정합성 보정.
-- 기존 원격 DB의 chain state 처리 구조를 파괴하지 않고,
-- 저장소의 과거 migration만으로 새 환경을 구성해도 동일한 멱등성·동시성·연결 제약을 갖도록 보완한다.

BEGIN;

-- 하나의 가입자/보험계약/특약 평가 범위에는 확정 State가 하나만 존재해야 한다.
-- Backend 조회가 scope_key 대신 업무 식별자 조합으로도 State를 찾기 때문에 중복 State를 DB에서 차단한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chain_states'::regclass
      AND conname = 'chain_states_logical_scope_unique'
  ) THEN
    ALTER TABLE public.chain_states
      ADD CONSTRAINT chain_states_logical_scope_unique
      UNIQUE (owner_user_id, insurance_contract_id, special_contract_id);
  END IF;
END
$$;

-- Confirmed State 조회에서 계약/특약 FK 조건을 자주 사용하므로 FK 조회용 인덱스를 보존한다.
CREATE INDEX IF NOT EXISTS chain_states_insurance_contract_id_idx
  ON public.chain_states (insurance_contract_id);

CREATE INDEX IF NOT EXISTS chain_states_special_contract_id_idx
  ON public.chain_states (special_contract_id);

-- 하나의 모의주행 Trip은 하나의 체인 처리 작업에만 연결되어야 한다.
-- operation_id가 달라져도 동일 trip을 다시 제출하는 실수를 DB 차원에서 막는다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chain_jobs'::regclass
      AND conname = 'chain_jobs_trip_id_unique'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_trip_id_unique UNIQUE (trip_id);
  END IF;
END
$$;

-- Job이 존재하는 Trip만 참조하도록 하여 삭제·재처리 과정에서 고아 작업이 생기지 않게 한다.
-- 운행 세션 삭제가 Job을 연쇄 삭제하면 확정 이력 복구가 불가능하므로 ON DELETE RESTRICT를 사용한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chain_jobs'::regclass
      AND conname = 'chain_jobs_trip_id_fkey'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_trip_id_fkey
      FOREIGN KEY (trip_id)
      REFERENCES public.driving_sessions(trip_id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- 동일 Scope에서 둘 이상의 pending Job이 동시에 이전 Confirmed State를 소비하지 못하게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS chain_jobs_one_pending_scope
  ON public.chain_jobs(scope_key)
  WHERE status = 'pending';

-- State와 Job은 Backend 전용 업무 데이터다.
-- 브라우저 역할에 직접 권한을 주지 않고 서버 DB 연결을 통해서만 읽고 갱신한다.
ALTER TABLE public.chain_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chain_states, public.chain_jobs FROM PUBLIC, anon, authenticated;

COMMIT;
