-- Drivacy 첫 수직 기능에서 사용하는 초기 DB 스키마다.
-- 이미 원격 Supabase에 적용된 Migration과 동일한 구조를 저장소에 보존하기 위한 파일이다.
-- 이 파일을 기존 원격 프로젝트에 다시 실행하지 않는다.

BEGIN;

-- Supabase Auth의 사용자 UUID를 서비스 사용자 식별자로 그대로 사용한다.
-- 별도의 사용자 ID를 만들지 않아 Auth 사용자와 서비스 사용자의 연결을 단순하게 유지한다.
CREATE TABLE public.users (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- 역할은 Auth metadata에 직접 의존하지 않고 서비스 DB에서 별도로 관리한다.
-- 현재 MVP에서 허용하는 역할은 DRIVER와 INSURER 두 종류다.
CREATE TABLE public.user_roles (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK (role IN ('DRIVER', 'INSURER')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- 현재 단계에서는 사용자당 하나의 현재 동의 상태만 저장한다.
-- 동의 종류, 문서 버전, 철회 이력은 아직 확정되지 않았으므로 이번 스키마에 포함하지 않는다.
-- consented_at은 원격 적용본과 동일하게 NULL을 허용하며,
-- Shared Consent의 consentedAt 필수 여부와의 차이는 별도 검토 대상으로 남긴다.
CREATE TABLE public.consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
 consented boolean NOT NULL,
 consented_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- 보험사 이름을 보험계약/특약 테이블에 반복 저장하지 않기 위해 별도 테이블로 정규화한다.
CREATE TABLE public.insurers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- 보험계약은 사용자와 보험사를 FK로 연결한다.
-- 상태값의 허용 목록은 아직 확정되지 않았으므로 ENUM으로 고정하지 않고 비어 있지 않은 TEXT만 허용한다.
CREATE TABLE public.insurance_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 insurer_id uuid NOT NULL REFERENCES public.insurers(id) ON DELETE RESTRICT,
 coverage_starts_at timestamptz NOT NULL,
 coverage_ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (length(btrim(status)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT insurance_contracts_coverage_order
   CHECK (coverage_starts_at <= coverage_ends_at)
);

-- 특약은 보험계약에 종속되는 1:N 관계이므로 별도 테이블로 정규화한다.
-- API 응답에서는 FK 조회 결과를 Shared의 specialContracts 배열 형태로 조립한다.
CREATE TABLE public.special_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 insurance_contract_id uuid NOT NULL
   REFERENCES public.insurance_contracts(id)
   ON DELETE RESTRICT,
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 is_eligible boolean NOT NULL,
 status text NOT NULL CHECK (length(btrim(status)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK 기반 조회를 빠르게 하기 위한 인덱스다.
CREATE INDEX insurance_contracts_owner_user_id_idx
ON public.insurance_contracts(owner_user_id);

CREATE INDEX insurance_contracts_insurer_id_idx
ON public.insurance_contracts(insurer_id);

CREATE INDEX special_contracts_insurance_contract_id_idx
ON public.special_contracts(insurance_contract_id);

-- 수정 가능한 업무 테이블의 updated_at을 애플리케이션 코드마다 직접 갱신하지 않고
-- DB 트리거에서 일관되게 갱신하기 위한 함수다.
CREATE FUNCTION public.drivacy_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
 NEW.updated_at = clock_timestamp();
 RETURN NEW;
END;
$$;

-- 브라우저/API 역할이 이 함수를 직접 실행하지 못하도록 실행 권한을 회수한다.
REVOKE ALL
ON FUNCTION public.drivacy_set_updated_at()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

CREATE TRIGGER consents_updated_at
BEFORE UPDATE ON public.consents
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

CREATE TRIGGER insurers_updated_at
BEFORE UPDATE ON public.insurers
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

CREATE TRIGGER insurance_contracts_updated_at
BEFORE UPDATE ON public.insurance_contracts
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

CREATE TRIGGER special_contracts_updated_at
BEFORE UPDATE ON public.special_contracts
FOR EACH ROW EXECUTE FUNCTION public.drivacy_set_updated_at();

-- 현재 프로젝트는 Frontend가 Supabase 업무 테이블을 직접 읽는 구조가 아니라
-- Backend가 객체별 권한을 검사하는 구조를 따른다.
-- 따라서 RLS는 활성화하지만 이번 단계에서 브라우저용 허용 정책은 만들지 않는다.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_contracts ENABLE ROW LEVEL SECURITY;

-- public/anon/authenticated 역할이 업무 테이블에 직접 접근하지 못하도록 권한을 회수한다.
-- 이후 서버 전용 pg 실행 계정과 권한 방식이 확정되면 별도 단계에서 접근 방식을 구성한다.
REVOKE ALL
ON TABLE
 public.users,
 public.user_roles,
 public.consents,
 public.insurers,
 public.insurance_contracts,
 public.special_contracts
FROM PUBLIC, anon, authenticated;

COMMIT;
