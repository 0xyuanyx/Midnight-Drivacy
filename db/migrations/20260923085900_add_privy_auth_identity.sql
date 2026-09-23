BEGIN;

-- 기존 업무 FK가 참조하는 Drivacy UUID PK는 유지하고 Supabase Auth 직접 FK만 제거한다.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- 기존 Supabase Auth 사용자는 자동 변환하지 않는다. 새 Privy 매핑이 있는 행만 이 컬럼을 채운다.
ALTER TABLE public.users
  ADD COLUMN auth_provider text,
  ADD COLUMN auth_provider_user_id text,
  ADD COLUMN email text,
  ADD COLUMN name text,
  ADD COLUMN birth_date date,
  ADD COLUMN phone_number text,
  ADD COLUMN profile_completed_at timestamptz;

-- 공급자 식별자 쌍이 둘 중 하나만 채워진 불완전한 매핑을 DB에서 차단한다.
ALTER TABLE public.users
  ADD CONSTRAINT users_auth_provider_identity_pair
  CHECK (
    (auth_provider IS NULL AND auth_provider_user_id IS NULL)
    OR (
      length(btrim(auth_provider)) > 0
      AND length(btrim(auth_provider_user_id)) > 0
    )
  );

-- 같은 Privy DID로 Drivacy 사용자가 두 번 만들어지는 것을 방지한다.
CREATE UNIQUE INDEX users_auth_provider_user_id_key
  ON public.users (auth_provider, auth_provider_user_id);

COMMIT;
