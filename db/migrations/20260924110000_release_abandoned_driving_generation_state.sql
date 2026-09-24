BEGIN;

-- C가 취소 완료를 확인한 terminal 실패 Job만 이전 Confirmed State 점유를 해제한다.
-- 단순 종료/대기/상태 불명 Session까지 해제하면 운전자가 불리한 운행을 버리고
-- 같은 State에서 새 운행을 만들 수 있으므로, 그 경우에는 계속 UNIQUE 대상으로 남긴다.
ALTER TABLE public.driving_sessions
  ADD COLUMN IF NOT EXISTS generation_state_released_at timestamptz;

DROP INDEX IF EXISTS public.driving_sessions_one_per_generation_state;

CREATE UNIQUE INDEX driving_sessions_one_per_generation_state
  ON public.driving_sessions(evaluation_scope_id, generation_state_commitment)
  WHERE generation_state_commitment IS NOT NULL
    AND generation_state_released_at IS NULL;

ALTER TABLE public.driving_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driving_sessions FROM PUBLIC, anon, authenticated;

COMMIT;
