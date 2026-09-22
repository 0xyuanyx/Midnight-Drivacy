BEGIN;

ALTER TABLE public.driving_sessions
  ADD COLUMN generation_state_commitment text;

ALTER TABLE public.driving_sessions
  ADD CONSTRAINT driving_sessions_generation_state_commitment_format
  CHECK (
    generation_state_commitment IS NULL
    OR char_length(btrim(generation_state_commitment)) BETWEEN 1 AND 1024
  );

-- 기존 Session은 과거 Commitment를 안전하게 복원할 수 없어 NULL로 보존하고, 새 Session에만 부분 UNIQUE 인덱스로 중복 소비를 막는다.
CREATE UNIQUE INDEX driving_sessions_one_per_generation_state
  ON public.driving_sessions(
    evaluation_scope_id,
    generation_state_commitment
  )
  WHERE generation_state_commitment IS NOT NULL;

ALTER TABLE public.driving_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.driving_sessions
FROM PUBLIC, anon, authenticated;

COMMIT;
