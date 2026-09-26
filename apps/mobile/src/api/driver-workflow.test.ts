import { createDriverWorkflow } from "./driver-workflow";

const contractId = "11111111-1111-4111-8111-111111111111";
const riderId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const tripId = "44444444-4444-4444-8444-444444444444";
const session = {
  sessionId, status: "GENERATED", startedAt: "2026-09-26T00:00:00.000Z", endedAt: null,
  trip: { id: tripId, source: "simulated", collectionEnabled: true, datasetSalt: "private-salt", records: [{ index: 0, distanceM: 1200, durationSeconds: 90, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }] },
};

function harness() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
  const calls: Array<{ path: string; key?: string }> = [];
  let failStart = false;
  let status: unknown = { operationId: tripId, status: "awaiting-wallet-approval", approvalRequestId: "approve-1" };
  const api = {
    startDrivingSession: async (_input: unknown, key: string): Promise<unknown> => {
      calls.push({ path: "start", key });
      if (failStart) throw new Error("network");
      return session;
    },
    getDrivingSession: async (): Promise<unknown> => session,
    endDrivingSession: async (): Promise<unknown> => ({ ...session, status: "ENDED", endedAt: "2026-09-26T00:02:00.000Z" }),
    processDrivingSession: async (_id: string, key: string): Promise<unknown> => { calls.push({ path: "process", key }); return { operationId: tripId }; },
    getTripProcessing: async (): Promise<unknown> => status,
  };
  return {
    api, calls, values, storage,
    failNextStart: () => { failStart = true; },
    allowStart: () => { failStart = false; },
    setStatus: (value: unknown) => { status = value; },
  };
}

describe("authenticated driver workflow", () => {
  it("reuses the same start key after an uncertain network failure", async () => {
    const h = harness();
    const flow = createDriverWorkflow(h.api, h.storage, () => "stable-start-key", "driver-a");
    h.failNextStart();
    await expect(flow.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" })).rejects.toThrow("network");
    h.allowStart();
    await flow.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" });
    expect(h.calls).toEqual([{ path: "start", key: "stable-start-key" }, { path: "start", key: "stable-start-key" }]);
    expect(JSON.stringify([...h.values])).not.toContain("private-salt");
    expect(JSON.stringify([...h.values])).not.toContain("records");
  });

  it("does not treat wallet approval, chain observation, or DB pending as a completed trip", async () => {
    const h = harness();
    const flow = createDriverWorkflow(h.api, h.storage, () => "stable-key", "driver-a");
    await flow.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" });
    await flow.endAndProcess();
    h.setStatus({ operationId: tripId, status: "calculated" });
    expect((await flow.poll()).status).toBe("calculated");
    h.setStatus({ operationId: tripId, status: "proving" });
    expect((await flow.poll()).status).toBe("proving");
    h.setStatus({ operationId: tripId, status: "awaiting-wallet-approval", approvalRequestId: "approve-1" });
    expect((await flow.poll()).status).toBe("awaiting-wallet-approval");
    h.setStatus({ operationId: tripId, status: "db-pending", transactionId: "tx-1" });
    expect((await flow.poll()).status).toBe("db-pending");
    expect(await flow.confirmedResult()).toBeNull();
  });

  it("shows only a matching DB-confirmed public summary and recovers by operation ID", async () => {
    const h = harness();
    const flow = createDriverWorkflow(h.api, h.storage, () => "stable-key", "driver-a");
    await flow.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" });
    await flow.endAndProcess();
    h.setStatus({ operationId: tripId, status: "db-confirmed", summary: {
      operationId: tripId, tripId, tripCount: 1, tripDistanceM: 1200, totalDistanceM: 1200,
      score: 91, conditionsMet: false, expectedDiscountBps: 0, ruleVersion: 1,
      stateCommitment: "commitment", transactionId: "tx-1",
    } });
    expect((await flow.poll()).status).toBe("db-confirmed");
    const resumed = createDriverWorkflow(h.api, h.storage, () => "should-not-be-used", "driver-a");
    expect((await resumed.confirmedResult())?.score).toBe(91);
    expect(h.calls.filter((call) => call.path === "process")).toHaveLength(1);
  });

  it("rejects a mismatched or malformed confirmation instead of updating the UI", async () => {
    const h = harness();
    const flow = createDriverWorkflow(h.api, h.storage, () => "stable-key", "driver-a");
    await flow.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" });
    await flow.endAndProcess();
    h.setStatus({ operationId: tripId, status: "db-confirmed", summary: { operationId: "another-trip", score: 100 } });
    await expect(flow.poll()).rejects.toThrow("확정 결과");
  });

  it("does not expose a prior user's workflow after an account switch", async () => {
    const h = harness();
    const firstUser = createDriverWorkflow(h.api, h.storage, () => "key-a", "driver-a");
    await firstUser.start({ insuranceContractId: contractId, specialContractId: riderId, evaluationPeriod: "period-1" });
    const secondUser = createDriverWorkflow(h.api, h.storage, () => "key-b", "driver-b");
    expect(await secondUser.snapshot()).toBeNull();
  });
});
