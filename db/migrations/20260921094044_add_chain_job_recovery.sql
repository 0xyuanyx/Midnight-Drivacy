-- 11단계 DB: chain job 실패 복구·재시도·원본 보관 상태 영속화.
-- 서버 메모리 타이머에 의존하지 않고 재시도/상태조회 예약을 DB에서 복구할 수 있게 한다.

BEGIN;

-- 최초 실행과 별도로 자동 재시도 횟수를 보존한다.
-- 서버 재시작 뒤에도 1·5·15분 재시도 정책의 현재 위치를 복구하기 위한 운영 메타데이터다.
ALTER TABLE public.chain_jobs
  ADD COLUMN IF NOT EXISTS retry_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action_type text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_retryable boolean,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_retry_count_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_retry_count_check
      CHECK (retry_count >= 0 AND retry_count <= 3);
  END IF;

  -- retry는 실제 재처리를 뜻하고 status-check는 기존 operationId의 상태만 다시 조회한다.
  -- chain-unknown을 새 체인 제출로 오해하지 않도록 두 동작을 DB에서도 구분한다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_next_action_type_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_next_action_type_check
      CHECK (next_action_type IS NULL OR next_action_type IN ('retry','status-check'));
  END IF;

  -- 예약 종류와 예약 시각은 항상 한 쌍이어야 worker가 불완전한 예약을 집지 않는다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_next_action_pair_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_next_action_pair_check
      CHECK (
        (next_action_type IS NULL AND next_action_at IS NULL)
        OR
        (next_action_type IS NOT NULL AND next_action_at IS NOT NULL)
      );
  END IF;

  -- DB 확정 또는 안전한 abandon이 끝난 terminal Job에는 예약된 재처리가 남으면 안 된다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_terminal_no_next_action_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_terminal_no_next_action_check
      CHECK (
        status='pending'
        OR (next_action_type IS NULL AND next_action_at IS NULL)
      );
  END IF;

  -- 실패 원본의 7일 보관 만료는 체인 결과가 명확히 종료된 abandoned Job에만 기록한다.
  -- chain-unknown/pending은 시간이 지났다는 이유만으로 원본을 삭제하면 안 된다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_raw_expiry_abandoned_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_raw_expiry_abandoned_check
      CHECK (raw_expires_at IS NULL OR status='abandoned');
  END IF;

  -- abandoned_at 역시 실제 terminal abandon 결과와만 함께 존재하도록 한다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chain_jobs'::regclass
      AND conname='chain_jobs_abandoned_at_check'
  ) THEN
    ALTER TABLE public.chain_jobs
      ADD CONSTRAINT chain_jobs_abandoned_at_check
      CHECK (abandoned_at IS NULL OR status='abandoned');
  END IF;
END
$$;

-- worker는 처리 시각이 도래한 pending Job만 훑는다.
CREATE INDEX IF NOT EXISTS chain_jobs_due_action_idx
  ON public.chain_jobs(next_action_at)
  WHERE status='pending' AND next_action_at IS NOT NULL;

-- 안전하게 abandoned 된 뒤 보관 만료가 도래한 미삭제 원본만 cleanup 후보가 된다.
CREATE INDEX IF NOT EXISTS chain_jobs_raw_expiry_idx
  ON public.chain_jobs(raw_expires_at)
  WHERE status='abandoned'
    AND deletion_status='pending'
    AND raw_expires_at IS NOT NULL;

-- 기존 Scope당 pending Job 1개 제약은 재시도/상태조회 중에도 그대로 유지한다.
CREATE UNIQUE INDEX IF NOT EXISTS chain_jobs_one_pending_scope
  ON public.chain_jobs(scope_key)
  WHERE status='pending';

-- 재시도·오류·원본 위치는 Backend 내부 운영 정보다.
-- 브라우저 역할이 직접 읽거나 갱신하지 못하도록 기존 보안 경계를 유지한다.
ALTER TABLE public.chain_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chain_jobs FROM PUBLIC, anon, authenticated;

COMMIT;
