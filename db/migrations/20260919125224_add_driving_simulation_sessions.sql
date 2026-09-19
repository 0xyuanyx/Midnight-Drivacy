-- 모의 운행의 메타데이터와 원본 구간 기록을 분리한다.
-- Session은 이후 상태/검증 이력과 연결하기 위해 남기고, Segment 원본은 체인 확정 후 별도로 삭제할 수 있게 한다.
CREATE TABLE public.driving_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_scope_id uuid NOT NULL REFERENCES public.evaluation_scopes(id) ON DELETE RESTRICT,
  rule_version_id uuid NOT NULL REFERENCES public.rule_versions(id) ON DELETE RESTRICT,
  trip_id text NOT NULL,
  dataset_salt text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'STARTED',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 운행 당시 Rule Version을 고정해 이후 Rule 갱신이 과거 운행의 기준을 바꾸지 않게 한다.
  CONSTRAINT driving_sessions_trip_id_nonempty
    CHECK (char_length(btrim(trip_id)) BETWEEN 1 AND 256),
  CONSTRAINT driving_sessions_dataset_salt_format
    CHECK (dataset_salt ~ '^[0-9a-f]{64}$'),
  CONSTRAINT driving_sessions_idempotency_key_length
    CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  CONSTRAINT driving_sessions_status_check
    CHECK (status IN ('STARTED', 'GENERATED', 'ENDED')),
  CONSTRAINT driving_sessions_end_state_check
    CHECK (
      (status = 'ENDED' AND ended_at IS NOT NULL)
      OR
      (status IN ('STARTED', 'GENERATED') AND ended_at IS NULL)
    ),
  CONSTRAINT driving_sessions_trip_id_unique UNIQUE (trip_id),
  -- 같은 평가 Scope에서 같은 시작 요청을 재시도해도 새 운행과 새 난수를 만들지 않는다.
  CONSTRAINT driving_sessions_scope_idempotency_unique
    UNIQUE (evaluation_scope_id, idempotency_key)
);

-- 같은 Scope의 운행 이력을 시간순으로 조회하는 Backend 경로를 위한 인덱스다.
CREATE INDEX driving_sessions_scope_created_at_idx
  ON public.driving_sessions(evaluation_scope_id, created_at DESC);

-- 특정 Rule Version으로 생성된 운행을 추적하기 위한 FK 조회 인덱스다.
CREATE INDEX driving_sessions_rule_version_id_idx
  ON public.driving_sessions(rule_version_id);

-- 실제 Core/Merkle 입력이 되는 비공개 모의 원본이다.
-- 화면 표시용 값과 계산용 값을 따로 난수 생성하지 않고 이 동일 기록을 기준으로 사용한다.
CREATE TABLE public.driving_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driving_session_id uuid NOT NULL REFERENCES public.driving_sessions(id) ON DELETE RESTRICT,
  segment_index integer NOT NULL,
  distance_m bigint NOT NULL,
  duration_seconds bigint NOT NULL,
  speeding_count bigint NOT NULL,
  acceleration_count bigint NOT NULL,
  braking_count bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_segments_index_range
    CHECK (segment_index >= 0 AND segment_index < 1024),
  CONSTRAINT driving_segments_distance_range
    CHECK (distance_m >= 0 AND distance_m <= 4294967295),
  CONSTRAINT driving_segments_duration_range
    CHECK (duration_seconds >= 0 AND duration_seconds <= 4294967295),
  CONSTRAINT driving_segments_speeding_range
    CHECK (speeding_count >= 0 AND speeding_count <= 4294967295),
  CONSTRAINT driving_segments_acceleration_range
    CHECK (acceleration_count >= 0 AND acceleration_count <= 4294967295),
  CONSTRAINT driving_segments_braking_range
    CHECK (braking_count >= 0 AND braking_count <= 4294967295),
  CONSTRAINT driving_segments_session_index_unique
    UNIQUE (driving_session_id, segment_index)
);

-- 업무 테이블은 브라우저에서 직접 읽지 않고 Backend만 접근한다.
ALTER TABLE public.driving_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_segments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.driving_sessions, public.driving_segments FROM PUBLIC, anon, authenticated;
