import { describe, expect, it, vi } from "vitest";
import type { AdapterRuntime, ConfirmedState, RegisteredRule, Scope, Trip, User } from "@drivacy/shared";

import { ChainProcessingService } from "../src/chain-state/chain-processing-service.js";
import { PgChainProcessingRepository, type ChainProcessingRepository, type ChainProcessingTarget } from "../src/chain-state/chain-processing-repository.js";
import { pollingStatus } from "../src/routes/chain-processing.js";

const runtime: AdapterRuntime = { network: "local", adapterProfile: "drivacy-test" };
const driver: User = { id: "driver", email: "driver@example.invalid", role: "DRIVER" };
const scope: Scope = {
  applicantId: driver.id, contractId: "contract", insurerId: "insurer", endorsementId: "special",
  evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" },
};
const registeredRule: RegisteredRule = {
  approval: "approved", registration: "chain-confirmed", ruleHash: "rule-hash",
  adapterProfile: runtime.adapterProfile, network: runtime.network,
  chainContractAddress: "chain-contract", registrationTransactionId: "registration",
  rule: {
    id: "rule", version: 1, insurerId: scope.insurerId, endorsementId: scope.endorsementId,
    formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2,
    accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000,
    minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200,
  },
};
const confirmedState: ConfirmedState = {
  kind: "confirmed",
  state: {
    scope, rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 0, tripCount: 0,
    totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
    score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "genesis-root",
    stateSalt: "a".repeat(64), stateCommitment: "genesis-commitment",
  },
  confirmation: {
    execution: "live", network: runtime.network, adapterProfile: runtime.adapterProfile,
    chainContractAddress: "chain-contract", transactionId: "genesis-transaction", blockId: "genesis-block",
    operationId: "genesis-operation", previousStateCommitment: "none",
    newStateCommitment: "genesis-commitment", ruleHash: "rule-hash", datasetRoot: "genesis-root",
    observedAt: "2026-09-20T00:00:00.000Z",
  },
};
const trip: Trip = {
  id: "trip-operation", source: "simulated", collectionEnabled: true, datasetSalt: "b".repeat(64),
  records: [{ index: 0, distanceM: 1000, durationSeconds: 60, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }],
};

class MemoryRepository implements ChainProcessingRepository {
  public target: ChainProcessingTarget = {
    sessionId: "session", ownerUserId: driver.id, scope, registeredRule, confirmedState, trip,
  };
  public async findEndedSession(): Promise<ChainProcessingTarget | undefined> { return this.target; }
}

const service = (repository: ChainProcessingRepository) => new ChainProcessingService(
  repository,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  runtime,
);

describe("ChainProcessingService", () => {
  it("does not expose a C-only chain confirmation as a completed driver result", () => {
    expect(pollingStatus({ status: "chain-confirmed", operationId: "operation", confirmation: { transactionId: "chain-transaction" } } as never))
      .toEqual({ operationId: "operation", status: "db-pending", transactionId: "chain-transaction" });
  });
  it("assembles an ended driving session with its stored rule and confirmed state", async () => {
    const request = await service(new MemoryRepository()).assemble(driver, "session", "session-key");

    expect(request).toMatchObject({
      contractVersion: "bc-v1", execution: "live", operationId: trip.id, idempotencyKey: "session-key",
      scope, approvedRule: registeredRule, previous: confirmedState, trip,
    });
  });

  it("rejects a stored state whose Rule cannot be used for the current session", async () => {
    const repository = new MemoryRepository();
    repository.target = {
      ...repository.target,
      confirmedState: { ...confirmedState, state: { ...confirmedState.state, rule: { ...confirmedState.state.rule, version: 2 } } },
    };

    await expect(service(repository).assemble(driver, "session", "session-key"))
      .rejects.toMatchObject({ code: "DRIVING_SESSION_NOT_READY" });
  });

  it("uses the Session Rule Version rather than the latest Deployment Rule in processing SQL", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PgChainProcessingRepository({ query } as never);

    await repository.findEndedSession(driver.id, "session", runtime);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("rr.rule_version_id=ds.rule_version_id");
    expect(sql).toContain("rv.id=ds.rule_version_id");
    expect(sql).toContain("ds.generation_state_commitment=cs.state_commitment");
    expect(sql).not.toContain("rr.rule_version_id=d.current_rule_version_id");
  });

  it("does not delete a source key when staging conflicts with an existing pending Job", async () => {
    const source = { save: vi.fn().mockResolvedValue("existing-source"), delete: vi.fn() };
    const finalizer = { createJob: vi.fn().mockRejectedValue(new Error("IDEMPOTENCY_CONFLICT")) };
    const guarded = new ChainProcessingService(new MemoryRepository(), finalizer as never, source as never,
      {} as never, {} as never, runtime);

    await expect(guarded.stage(driver, "session", "session-key")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(source.delete).not.toHaveBeenCalled();
  });

  it("starts C once after persisting a new Job and records its returned state", async () => {
    const source = { save: vi.fn().mockResolvedValue("source"), load: vi.fn(), delete: vi.fn() };
    const finalizer = { createJob: vi.fn().mockResolvedValue(true) };
    const status = { contractVersion: "bc-v1", execution: "live", operationId: trip.id,
      tripId: trip.id, status: "proving" } as const;
    const gateway = { startTrip: vi.fn().mockResolvedValue(status), getTripStatus: vi.fn(), canAbandonTrip: vi.fn() };
    const recorder = { recordProcessingResult: vi.fn(), recordProcessingUnknown: vi.fn() };
    const processing = new ChainProcessingService(new MemoryRepository(), finalizer as never, source,
      gateway, recorder, runtime);

    await expect(processing.stage(driver, "session", "session-key")).resolves.toEqual({ operationId: trip.id });
    expect(gateway.startTrip).toHaveBeenCalledWith(expect.objectContaining({ operationId: trip.id }));
    expect(gateway.getTripStatus).not.toHaveBeenCalled();
    expect(recorder.recordProcessingResult).toHaveBeenCalledWith(driver, trip.id, status);
  });

  it("reuses operationId and checks status instead of resubmitting an existing Job", async () => {
    const status = { contractVersion: "bc-v1", execution: "live", operationId: trip.id,
      tripId: trip.id, status: "chain-unknown", transactionId: "transaction" } as const;
    const finalizer = { createJob: vi.fn().mockResolvedValue(false) };
    const gateway = { startTrip: vi.fn(), getTripStatus: vi.fn().mockResolvedValue(status), canAbandonTrip: vi.fn() };
    const recorder = { recordProcessingResult: vi.fn(), recordProcessingUnknown: vi.fn() };
    const processing = new ChainProcessingService(new MemoryRepository(), finalizer as never,
      { save: vi.fn().mockResolvedValue("source"), load: vi.fn(), delete: vi.fn() }, gateway, recorder, runtime);

    await processing.stage(driver, "session", "another-http-key");
    expect(gateway.startTrip).not.toHaveBeenCalled();
    expect(gateway.getTripStatus).toHaveBeenCalledWith(trip.id);
  });

  it("fails closed and schedules status recovery when the C boundary is unavailable", async () => {
    const unavailable = new Error("adapter unavailable");
    const recorder = { recordProcessingResult: vi.fn(), recordProcessingUnknown: vi.fn() };
    const processing = new ChainProcessingService(new MemoryRepository(),
      { createJob: vi.fn().mockResolvedValue(true) } as never,
      { save: vi.fn().mockResolvedValue("source"), load: vi.fn(), delete: vi.fn() },
      { startTrip: vi.fn().mockRejectedValue(unavailable), getTripStatus: vi.fn(), canAbandonTrip: vi.fn() },
      recorder, runtime);

    await expect(processing.stage(driver, "session", "session-key")).rejects.toBe(unavailable);
    expect(recorder.recordProcessingUnknown).toHaveBeenCalledWith(driver, trip.id);
  });

  it("reads an existing operation status through the authorized B finalizer boundary", async () => {
    const status = { contractVersion: "bc-v1", execution: "live", operationId: trip.id,
      tripId: trip.id, status: "awaiting-wallet-approval", approvalRequestId: "approval" } as const;
    const finalizer = { readStatus: vi.fn().mockResolvedValue(status) };
    const processing = new ChainProcessingService(new MemoryRepository(), finalizer as never,
      {} as never, {} as never, {} as never, runtime);

    await expect(processing.getStatus(driver, trip.id)).resolves.toEqual(status);
    expect(finalizer.readStatus).toHaveBeenCalledWith(driver, trip.id);
  });
});
