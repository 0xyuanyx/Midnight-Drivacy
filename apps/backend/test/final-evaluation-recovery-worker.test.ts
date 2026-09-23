import { afterEach, describe, expect, it, vi } from "vitest";
import { startFinalEvaluationRecoveryWorker } from "../src/final-evaluation/final-evaluation-recovery-worker.js";

afterEach(() => vi.useRealTimers());

describe("Final Evaluation recovery worker lifecycle", () => {
  it("polls with a bounded batch, prevents overlap, and stops its timer", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const service = { recoverDue: vi.fn(async () => blocked) };
    const stop = startFinalEvaluationRecoveryWorker(service as never, 30_000, 25);

    vi.advanceTimersByTime(60_000);
    expect(service.recoverDue).toHaveBeenCalledTimes(1);
    expect(service.recoverDue).toHaveBeenCalledWith(25);
    release(); await blocked; stop();
    vi.advanceTimersByTime(60_000);
    expect(service.recoverDue).toHaveBeenCalledTimes(1);
  });
});
