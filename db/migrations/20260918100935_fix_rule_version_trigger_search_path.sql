-- 이 파일은 원격 Supabase에 이미 적용된 migration의 동일본이다.
-- trigger 함수의 search_path를 고정해 호출 환경의 search_path 영향을 받지 않게 한다.

BEGIN;

ALTER FUNCTION public.drivacy_prevent_approved_rule_version_mutation()
SET search_path = '';

COMMIT;
