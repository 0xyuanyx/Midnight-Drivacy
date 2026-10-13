-- 확정 또는 안전 종료 뒤 운행 원본을 지우고 Job/Session 메타데이터만 보존한다.
-- 운영 DB에는 별도 적용이 필요하다. 기존 행을 자동 삭제하지 않는다.
BEGIN;

ALTER TABLE public.driving_sessions
  ALTER COLUMN dataset_salt DROP NOT NULL,
  ADD COLUMN raw_deleted_at timestamptz;

ALTER TABLE public.driving_sessions
  ADD CONSTRAINT driving_sessions_raw_deleted_pair_check
  CHECK ((dataset_salt IS NOT NULL AND raw_deleted_at IS NULL)
      OR (dataset_salt IS NULL AND raw_deleted_at IS NOT NULL));

-- 과거에 외부 source만 삭제되어 DB 구간이 남은 행도 복구 worker의 삭제 대상에 포함한다.
UPDATE public.chain_jobs j SET deletion_status='pending'
WHERE j.deletion_status='deleted' AND j.status IN ('db-confirmed','abandoned')
  AND EXISTS (SELECT 1 FROM public.driving_sessions ds
              WHERE ds.trip_id=j.trip_id AND ds.raw_deleted_at IS NULL);

-- 과거 abandoned 원본도 새 즉시 삭제 정책에 따라 다음 worker 주기에 처리한다.
UPDATE public.chain_jobs SET raw_expires_at=clock_timestamp()
WHERE status='abandoned' AND deletion_status='pending';

COMMIT;
