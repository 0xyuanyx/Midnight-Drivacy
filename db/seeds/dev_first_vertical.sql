-- development/demo only fixture. 실제 보험상품이나 운영 데이터를 의미하지 않는다.
-- 실행 예: psql -v driver_user_id=<개발 DRIVER의 UUID> -f db/seeds/dev_first_vertical.sql
-- 실제 UUID·비밀번호·token은 이 파일이나 Git에 기록하지 않는다.

\if :{?driver_user_id}
\else
\quit
\endif

BEGIN;

-- migration과 fixture를 분리해 schema 이력에 테스트 데이터를 섞지 않는다.
SELECT set_config('drivacy.dev_driver_user_id', :'driver_user_id', true);

DO $$
DECLARE
 driver_id uuid := current_setting('drivacy.dev_driver_user_id')::uuid;
 insurer_id uuid;
 contract_id uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = driver_id) THEN
   RAISE EXCEPTION 'The supplied development DRIVER is not initialized';
 END IF;

 SELECT id INTO insurer_id FROM public.insurers
 WHERE name = 'Drivacy Demo Insurance'
 ORDER BY created_at ASC LIMIT 1;
 IF insurer_id IS NULL THEN
   INSERT INTO public.insurers (name) VALUES ('Drivacy Demo Insurance') RETURNING id INTO insurer_id;
 END IF;

 SELECT id INTO contract_id FROM public.insurance_contracts
 WHERE owner_user_id = driver_id AND status = 'DEMO'
 ORDER BY created_at ASC LIMIT 1;
 IF contract_id IS NULL THEN
   INSERT INTO public.insurance_contracts (
     owner_user_id, insurer_id, coverage_starts_at, coverage_ends_at, status
   ) VALUES (
     driver_id, insurer_id, now(), now(), 'DEMO'
   ) RETURNING id INTO contract_id;
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM public.special_contracts
   WHERE insurance_contract_id = contract_id AND name = 'Safe Driving Special Contract'
 ) THEN
   INSERT INTO public.special_contracts (insurance_contract_id, name, is_eligible, status)
   VALUES (contract_id, 'Safe Driving Special Contract', true, 'DEMO');
 END IF;
END;
$$;

COMMIT;
