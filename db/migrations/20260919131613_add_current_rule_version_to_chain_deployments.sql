-- 현재 적용 Rule은 단순 APPROVED가 아니라 이 Deployment에 실제 chain-confirmed 등록된 버전이어야 한다.
-- nullable로 시작해 최초 deployment 생성 직후 registration을 저장한 뒤 같은 transaction에서 current를 설정할 수 있게 한다.
ALTER TABLE public.chain_scope_deployments
  ADD COLUMN current_rule_version_id uuid;

-- rule_registrations의 (deployment, rule_version) UNIQUE를 참조해
-- 다른 Deployment에만 등록된 Rule Version이나 미등록 Rule을 current로 지정하지 못하게 한다.
ALTER TABLE public.chain_scope_deployments
  ADD CONSTRAINT chain_scope_deployments_current_rule_registration_fkey
  FOREIGN KEY (id, current_rule_version_id)
  REFERENCES public.rule_registrations (
    chain_scope_deployment_id,
    rule_version_id
  )
  ON DELETE RESTRICT;
