BEGIN;

ALTER TABLE public.discount_applications
  ADD COLUMN recovery_claim_token uuid,
  ADD COLUMN recovery_claim_expires_at timestamptz,
  ADD COLUMN next_status_check_at timestamptz,
  ADD COLUMN last_status_check_at timestamptz,
  ADD COLUMN last_recovery_error_code text,
  ADD CONSTRAINT discount_applications_recovery_claim_pair_check CHECK (
    (recovery_claim_token IS NULL AND recovery_claim_expires_at IS NULL)
    OR (recovery_claim_token IS NOT NULL AND recovery_claim_expires_at IS NOT NULL)
  );

-- 기존 PENDING 행은 즉시 복구 대상이 되며, terminal 행은 worker 대상 인덱스에 포함하지 않는다.
UPDATE public.discount_applications
SET next_status_check_at = submitted_at
WHERE verification_status = 'PENDING' AND next_status_check_at IS NULL;

-- 여러 Backend 인스턴스가 due PENDING 신청만 짧게 claim하도록 부분 인덱스를 둔다.
CREATE INDEX discount_applications_recovery_due_idx
  ON public.discount_applications(next_status_check_at, recovery_claim_expires_at)
  WHERE verification_status = 'PENDING' AND review_status = 'PENDING_REVIEW';

-- 기존 RLS/직접 권한 차단을 유지하며 recovery 컬럼도 브라우저에서 갱신할 수 없게 한다.
ALTER TABLE public.discount_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discount_applications FROM PUBLIC, anon, authenticated;

COMMIT;
