import type { ChainJobRecoveryService } from "./chain-job-recovery.js";

export const startChainRecoveryWorker = (service: ChainJobRecoveryService, intervalMs = 30_000, limit = 25) => {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // due action과 삭제를 DB에서 다시 읽으므로 프로세스 재시작이나 worker 중복 실행에도 메모리 상태를 신뢰하지 않는다.
      await service.recoverDue(limit);
      await service.cleanupConfirmedRaw(limit);
      await service.cleanupExpiredRaw(limit);
    } catch {
      // 개별 C/Storage 장애로 서버를 종료하지 않고 DB의 pending 상태를 다음 주기에 재시도한다.
    } finally { running = false; }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
