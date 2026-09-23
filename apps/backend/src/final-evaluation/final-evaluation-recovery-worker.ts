import type { FinalEvaluationRecoveryService } from "./final-evaluation-recovery.js";

export const startFinalEvaluationRecoveryWorker = (service: FinalEvaluationRecoveryService,
  intervalMs = 30_000, limit = 25) => {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await service.recoverDue(limit); }
    catch { /* DB/C 장애는 다음 주기에 재시도하며 tight loop나 서버 종료로 바꾸지 않는다. */ }
    finally { running = false; }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
