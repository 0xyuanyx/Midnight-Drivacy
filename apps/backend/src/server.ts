import { loadEnvironment } from "./config/env.js";
import { createDatabasePool } from "./db/pool.js";
import { ExternalRuleRegistrationAdapter } from "./rule-registration/rule-registration-adapter.js";
import { ExternalTripProcessingAdapter } from "./chain-state/trip-processing-adapter.js";
import { startChainRecoveryWorker } from "./chain-state/chain-recovery-worker.js";
import { createRuntime } from "./runtime-app.js";
import { ExternalFinalEvaluationAdapter } from "./final-evaluation/final-evaluation-adapter.js";
import { startFinalEvaluationRecoveryWorker } from "./final-evaluation/final-evaluation-recovery-worker.js";

const environment = loadEnvironment();
const pool = createDatabasePool(environment.databaseUrl);
// 가입자 승인이 필요한 트랜잭션을 Backend 개발자 키로 대신 서명하지 않도록 외부 C/Wallet 실행 경계를 주입한다.
// URL이나 인증값이 없으면 시작 단계에서 실패하므로 로컬 probe 또는 성공 fixture로 production 경로를 우회하지 않는다.
const ruleRegistrationAdapter = new ExternalRuleRegistrationAdapter(
  environment.cWalletAdapterUrl,
  environment.cWalletAdapterToken,
);
const tripProcessingAdapter = new ExternalTripProcessingAdapter(environment.cWalletAdapterUrl, environment.cWalletAdapterToken);
const finalEvaluationAdapter = new ExternalFinalEvaluationAdapter(environment.cWalletAdapterUrl, environment.cWalletAdapterToken);
const { app, recovery, finalEvaluationRecovery } = createRuntime(
  environment, pool, ruleRegistrationAdapter, tripProcessingAdapter, finalEvaluationAdapter);
// retry/status-check/삭제 복구를 실제 서버 수명주기에 연결하되 DB claim/lease가 중복 worker 실행을 차단한다.
const stopChainRecovery = startChainRecoveryWorker(recovery);
const stopFinalEvaluationRecovery = startFinalEvaluationRecoveryWorker(finalEvaluationRecovery);

const server = app.listen(environment.port, () => {
  console.info(`Drivacy backend listening on port ${environment.port}`);
});

let stopping = false;
const shutdown = async () => {
  if (stopping) return; stopping = true;
  stopChainRecovery(); stopFinalEvaluationRecovery();
  // 종료 신호 뒤 새 poll을 막고 HTTP listener와 DB pool을 순서대로 닫는다.
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
