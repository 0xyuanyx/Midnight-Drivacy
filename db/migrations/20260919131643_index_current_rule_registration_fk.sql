-- 복합 FK 검사와 참조 무결성 유지 시 source-side 조회를 지원한다.
CREATE INDEX chain_scope_deployments_current_rule_registration_idx
  ON public.chain_scope_deployments(id, current_rule_version_id);
