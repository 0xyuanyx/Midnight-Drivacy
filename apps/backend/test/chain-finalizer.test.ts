import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ChainFinalizer } from "../src/chain-state/chain-finalizer.js";
import { CalculateTripRequestSchema, type CalculateTripRequest, type ConfirmedState, type RegisteredRule, type TripProcessingResult, type User } from "@drivacy/shared";

const actor: User = { id: "driver", email: "driver@example.invalid", role: "DRIVER" };
const scope = { applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "endorsement", evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } };
const registeredRule: RegisteredRule = { approval: "approved", registration: "chain-confirmed", ruleHash: "rule-hash", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address", registrationTransactionId: "rule-registration", rule: { id: "rule", version: 1, insurerId: "insurer", endorsementId: "endorsement", formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 } };
const previous: ConfirmedState = { kind: "confirmed", state: { scope, rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 0, tripCount: 0, totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }, score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "genesis-root", stateSalt: "a".repeat(64), stateCommitment: "previous" }, confirmation: { execution: "live", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address", transactionId: "genesis-transaction", blockId: "genesis-block", operationId: "genesis-operation", previousStateCommitment: "none", newStateCommitment: "previous", ruleHash: "rule-hash", datasetRoot: "genesis-root", observedAt: "2026-09-20T00:00:00Z" } };
const request: CalculateTripRequest = { contractVersion: "bc-v1", execution: "live", operationId: "operation", idempotencyKey: "idempotency", scope, approvedRule: registeredRule, previous, trip: { id: "trip", source: "simulated", collectionEnabled: true, datasetSalt: "b".repeat(64), records: [{ index: 0, distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }] } };
const confirmedResult: TripProcessingResult = { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "chain-confirmed", candidate: { kind: "candidate", operationId: "operation", tripId: "trip", previousStateCommitment: "previous", state: { ...previous.state, version: 1, tripCount: 1, totals: { distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }, datasetRoot: "dataset-root", stateCommitment: "new-state" }, explanation: { previousScore: 100, newScore: 100, scoreDelta: 0, tripTotals: { distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }, ruleVersion: 1, penalties: { speeding: 0, acceleration: 0, braking: 0 } } }, confirmation: { execution: "live", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address", transactionId: "transaction", blockId: "block", operationId: "operation", previousStateCommitment: "previous", newStateCommitment: "new-state", ruleHash: "rule-hash", datasetRoot: "dataset-root", observedAt: "2026-09-20T00:00:00Z" } };

type Job = { operation_id: string; scope_key: string; trip_id: string; previous_commitment: string; source_key: string; status: "pending" | "db-confirmed" | "abandoned"; request_hash: string; claim_token: string | null; claim_valid: boolean; confirmed_result: TripProcessingResult | null; deletion_status: "pending" | "deleted" };

/** Transaction-aware fixture for the SQL CAS/state-update path, without a live Supabase project. */
const fixture = () => {
  const state = { confirmed_state: previous, registered_rule: registeredRule, state_commitment: "previous", version: 0 };
  const parsedRequest = CalculateTripRequestSchema.parse(request);
  const job: Job = { operation_id: "operation", scope_key: createHash("sha256").update(JSON.stringify(parsedRequest.scope)).digest("hex"), trip_id: "trip", previous_commitment: "previous", source_key: "private-source", status: "pending", request_hash: createHash("sha256").update(JSON.stringify(parsedRequest)).digest("hex"), claim_token: "claim", claim_valid: true, confirmed_result: null, deletion_status: "pending" };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("UPDATE public.chain_jobs j SET claim_token")) {
      const [token, , ownerId] = values as [string, string, string];
      if (job.status !== "pending" || job.claim_token !== null || ownerId !== actor.id) return { rows: [], rowCount: 0 };
      job.claim_token = token; job.claim_valid = true;
      return { rows: [{ operation_id: job.operation_id }], rowCount: 1 };
    }
    if (sql.includes("insurance_contracts c")) return { rows: [{ id: "contract" }], rowCount: 1 };
    if (sql.includes("SELECT j.* FROM public.chain_jobs")) return { rows: [job], rowCount: 1 };
    if (sql.includes("SELECT *, claim_expires_at")) return { rows: [{ ...job, claim_valid: job.claim_valid }], rowCount: 1 };
    if (sql.includes("SELECT * FROM public.chain_states")) return { rows: [state], rowCount: 1 };
    if (sql.includes("UPDATE public.chain_states")) {
      const [, , , , commitment, version] = values as [unknown, string, number, string, string, number];
      if (state.state_commitment !== commitment || state.version !== version) return { rows: [], rowCount: 0 };
      const [confirmed, newCommitment, newVersion] = values as [ConfirmedState, string, number];
      state.confirmed_state = confirmed; state.state_commitment = newCommitment; state.version = newVersion;
      return { rows: [{ scope_key: "scope" }], rowCount: 1 };
    }
    if (sql.includes("UPDATE public.chain_jobs SET status='db-confirmed'")) { job.status = "db-confirmed"; job.confirmed_result = values?.[0] as TripProcessingResult; return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { state, job, query, pool: { query, connect: vi.fn().mockResolvedValue(client) } as unknown as Pool };
};
const finalizer = (db: ReturnType<typeof fixture>, result: TripProcessingResult, sourceRequest = request) => {
  const chain = { getTripStatus: vi.fn(async () => result), canAbandonTrip: vi.fn(async () => false) };
  const source = { load: vi.fn(async () => sourceRequest), delete: vi.fn(async () => undefined) };
  return { service: new ChainFinalizer(db.pool, chain, source), chain, source };
};

describe("ChainFinalizer confirmed-state boundary", () => {
  it("leases a pending job to one owning DRIVER and rejects a competing claim", async () => {
    const db = fixture(); db.job.claim_token = null;
    const service = finalizer(db, confirmedResult).service;
    await expect(service.claim(actor, "operation")).resolves.toEqual(expect.any(String));
    await expect(service.claim(actor, "operation")).rejects.toThrow("CLAIM_UNAVAILABLE");
    const otherDriver = { ...actor, id: "other-driver" };
    const otherDb = fixture(); otherDb.job.claim_token = null;
    await expect(finalizer(otherDb, confirmedResult).service.claim(otherDriver, "operation")).rejects.toThrow("CLAIM_UNAVAILABLE");
  });

  it("atomically persists only a verified chain-confirmed Candidate as a Confirmed State", async () => {
    const db = fixture();
    await expect(finalizer(db, confirmedResult).service.finalize(actor, "operation", "claim")).resolves.toEqual(confirmedResult);
    expect(db.state).toMatchObject({ state_commitment: "new-state", version: 1 });
    expect(db.state.confirmed_state).toMatchObject({ kind: "confirmed", state: { stateCommitment: "new-state" } });
    expect(db.job).toMatchObject({ status: "db-confirmed", confirmed_result: confirmedResult });
    const calls = db.query.mock.calls.map(call => String(call[0]));
    expect(calls.findIndex(sql => sql.includes("UPDATE public.chain_states"))).toBeLessThan(calls.findIndex(sql => sql.includes("UPDATE public.chain_jobs SET status='db-confirmed'")));
  });

  it.each<TripProcessingResult>([
    { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "calculated", candidate: confirmedResult.candidate },
    { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "proving" },
    { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "awaiting-wallet-approval", approvalRequestId: "approval" },
    { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "submitted", transactionId: "transaction" },
    { contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "chain-unknown", transactionId: "transaction" },
  ])("does not mutate the DB for %# status", async result => {
    const db = fixture();
    await expect(finalizer(db, result).service.finalize(actor, "operation", "claim")).resolves.toBeUndefined();
    expect(db.state.state_commitment).toBe("previous");
    expect(db.job.status).toBe("pending");
  });

  it("rejects a Candidate whose previous commitment is not the job and DB state", async () => {
    const db = fixture(); const inconsistent = structuredClone(confirmedResult);
    inconsistent.candidate.previousStateCommitment = "other-previous"; inconsistent.confirmation.previousStateCommitment = "other-previous";
    await expect(finalizer(db, inconsistent).service.finalize(actor, "operation", "claim")).rejects.toThrow("CONFIRMATION_MISMATCH");
    expect(db.state.state_commitment).toBe("previous"); expect(db.job.status).toBe("pending");
  });

  it("uses CAS to reject a job after its captured state becomes stale", async () => {
    const db = fixture(); db.state.state_commitment = "newer-state"; db.state.version = 1;
    await expect(finalizer(db, confirmedResult).service.finalize(actor, "operation", "claim")).rejects.toThrow("STALE_DB_STATE");
    expect(db.job.status).toBe("pending");
  });

  it("does not accept a result bound to another operation, trip, or scope", async () => {
    const wrongOperation = structuredClone(confirmedResult); wrongOperation.operationId = "other-operation"; wrongOperation.candidate.operationId = "other-operation"; wrongOperation.confirmation.operationId = "other-operation";
    const wrongTrip = structuredClone(confirmedResult); wrongTrip.tripId = "other-trip"; wrongTrip.candidate.tripId = "other-trip";
    const wrongScope = structuredClone(confirmedResult); wrongScope.candidate.state.scope = { ...scope, contractId: "other-contract" };
    for (const result of [wrongOperation, wrongTrip, wrongScope]) {
      const db = fixture();
      await expect(finalizer(db, result).service.finalize(actor, "operation", "claim")).rejects.toThrow("CONFIRMATION_MISMATCH");
      expect(db.state.version).toBe(0); expect(db.job.status).toBe("pending");
    }
  });

  it.each<RegisteredRule>([
    { ...registeredRule, ruleHash: "other-rule-hash" },
    { ...registeredRule, network: "preprod" },
    { ...registeredRule, adapterProfile: "other-profile" },
    { ...registeredRule, chainContractAddress: "other-contract-address" },
    { ...registeredRule, rule: { ...registeredRule.rule, id: "other-rule" } },
    { ...registeredRule, rule: { ...registeredRule.rule, version: 2 } },
  ])("does not finalize when a registered Rule binding differs", async changedRule => {
    const db = fixture(); db.state.registered_rule = changedRule;
    await expect(finalizer(db, confirmedResult).service.finalize(actor, "operation", "claim")).rejects.toThrow("REGISTERED_RULE_MISMATCH");
    expect(db.state.version).toBe(0); expect(db.job.status).toBe("pending");
  });

  it("returns the existing result without another chain read or state update after db-confirmed", async () => {
    const db = fixture(); db.job.status = "db-confirmed"; db.job.confirmed_result = confirmedResult;
    const { service, chain } = finalizer(db, confirmedResult);
    await expect(service.finalize(actor, "operation", "anything")).resolves.toEqual(confirmedResult);
    expect(chain.getTripStatus).not.toHaveBeenCalled(); expect(db.state.version).toBe(0);
  });

  it("requires a current claim and the owning DRIVER before a DB confirmation", async () => {
    const expired = fixture(); expired.job.claim_valid = false;
    await expect(finalizer(expired, confirmedResult).service.finalize(actor, "operation", "claim")).rejects.toThrow("STALE_CLAIM");
    const insurer = { ...actor, role: "INSURER" as const }; const unauthorized = fixture();
    await expect(finalizer(unauthorized, confirmedResult).service.finalize(insurer, "operation", "claim")).rejects.toThrow("NOT_AUTHORIZED");
    const wrongToken = fixture();
    await expect(finalizer(wrongToken, confirmedResult).service.finalize(actor, "operation", "another-claim")).rejects.toThrow("STALE_CLAIM");
    expect(expired.state.version).toBe(0); expect(unauthorized.state.version).toBe(0); expect(wrongToken.state.version).toBe(0);
  });

  it("deletes private input only after db-confirmed, and deletion is idempotent", async () => {
    const db = fixture(); const { service, source } = finalizer(db, confirmedResult);
    await expect(service.deleteConfirmedSource(actor, "operation")).rejects.toThrow("DB_NOT_CONFIRMED");
    db.job.status = "db-confirmed"; db.job.confirmed_result = confirmedResult;
    await service.deleteConfirmedSource(actor, "operation"); db.job.deletion_status = "deleted";
    await service.deleteConfirmedSource(actor, "operation"); expect(source.delete).toHaveBeenCalledTimes(1);
  });
});

describe("ChainFinalizer trust-boundary errors", () => {
  it("maps C read failures and malformed status payloads to CHAIN_STATUS_UNAVAILABLE", async () => {
    for (const read of [async () => { throw new Error("transport"); }, async () => ({ bad: true } as never)]) {
      const db = fixture(); const service = new ChainFinalizer(db.pool, { getTripStatus: read, async canAbandonTrip() { return false; } }, { async load() { return request; }, async delete() {} });
      await expect(service.finalize(actor, "operation", "claim")).rejects.toThrow("CHAIN_STATUS_UNAVAILABLE");
    }
  });
  it("maps an invalid private source payload to SOURCE_PAYLOAD_INVALID", async () => {
    const db = fixture(); const service = new ChainFinalizer(db.pool, { async getTripStatus() { return confirmedResult; }, async canAbandonTrip() { return false; } }, { async load() { return { bad: true } as never; }, async delete() {} });
    await expect(service.finalize(actor, "operation", "claim")).rejects.toThrow("SOURCE_PAYLOAD_INVALID");
  });
});
