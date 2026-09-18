import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TripJob, getTripStatus, canAbandonTrip, type TripStep, type TransactionHooks } from "../src/trip-job.js";
import { LocalJobStore } from "../src/local-job-store.js";
import { decode, genesis, prepareTrip } from "../src/state-adapter.js";
import { demoScope, demoRule, demoTrip, demoRegisteredRule, demoRequest } from "../probe/driving-fixtures.js";
import type { ChainConfirmation, ConfirmedState } from "../../shared/src/bc-contract.js";

// 전부 로컬 작업 제어 테스트다. 아래 live 메타데이터의 receipt는 합성값이고 실제 체인 증거가 아니다.
const owner = decode("11".repeat(32));
const salt = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
async function setup(decision: "approved" | "cancelled" = "approved") {
  const directory = await mkdtemp(join(tmpdir(), "drivacy-job-test-"));
  const verifiedDirectory = resolve(directory);
  if (dirname(verifiedDirectory) !== resolve(tmpdir()) || !basename(verifiedDirectory).startsWith("drivacy-job-test-")) {
    throw new Error("Test cleanup path is outside its temporary directory");
  }
  const store = new LocalJobStore(join(directory, "jobs.json"));
  const state = genesis(demoScope, demoRule, owner, salt(1));
  const registered = demoRegisteredRule(state.rule.ruleHash, "live", "synthetic-contract", "synthetic-register");
  const previous: ConfirmedState = { kind: "confirmed", state, confirmation: {
    execution: "live", network: "local", adapterProfile: registered.adapterProfile,
    chainContractAddress: registered.chainContractAddress, transactionId: "synthetic-init", blockId: "synthetic-block",
    operationId: "synthetic-genesis", previousStateCommitment: state.stateCommitment,
    newStateCommitment: state.stateCommitment, ruleHash: state.rule.ruleHash, datasetRoot: state.datasetRoot,
    observedAt: "2026-09-18T00:00:00Z",
  } };
  const request = demoRequest(previous, registered, demoTrip(1, salt(2)));
  const prepared = prepareTrip(request, owner, salt(3), salt(4));
  let approvals = 0, balances = 0, submissions = 0, clock = 0;
  const approval = { async request() { approvals++; return decision; } };
  const job = new TripJob(request, prepared.candidate, store, approval, () => clock);
  const observed = (step: TripStep) => ({ transactionId: `synthetic-${step}`, blockId: `block-${step}` });
  const execute = (step: TripStep) => async (hooks: TransactionHooks) => {
    await hooks.balance(async () => { balances++; return {}; });
    await hooks.submit(observed(step).transactionId, async () => { submissions++; });
    return observed(step);
  };
  const run = (step: TripStep) => job.runStep(step, execute(step), r => r);
  const confirmation = (): ChainConfirmation => ({ ...previous.confirmation, operationId: request.operationId,
    previousStateCommitment: state.stateCommitment, newStateCommitment: prepared.candidate.state.stateCommitment,
    datasetRoot: prepared.candidate.state.datasetRoot, ...observed("finishTrip") });
  return { job, request, prepared, store, approval, directory, execute, observed, run, confirmation,
    counts: () => ({ approvals, balances, submissions }), setClock: (value: number) => { clock = value; },
    cleanup: () => rm(verifiedDirectory, { recursive: true, force: true }) };
}
async function using(run: (s: Awaited<ReturnType<typeof setup>>) => Promise<void>, decision?: "approved" | "cancelled") {
  const s = await setup(decision);
  try { await run(s); } finally { await s.cleanup(); }
}

describe("wallet approval and C job lifecycle (offline synthetic receipts)", () => {
  it("requires approval for each stage and only finalizes after every stage", () => using(async s => {
    await s.run("beginTrip");
    expect((await s.job.getStatus()).status).toBe("proving");
    await expect(s.job.confirm(s.confirmation())).rejects.toThrow("INCOMPLETE_JOB");
    await s.run("appendRecord:0"); await s.run("finishTrip");
    expect((await s.job.confirm(s.confirmation())).status).toBe("chain-confirmed");
    expect(s.counts()).toEqual({ approvals: 3, balances: 3, submissions: 3 });
  }));
  it("cancellation never balances, submits or automatically retries", () => using(async s => {
    await expect(s.run("beginTrip")).rejects.toThrow("APPROVAL_CANCELLED");
    expect(await s.job.getStatus()).toMatchObject({ status: "failed", error: { code: "APPROVAL_CANCELLED", retryable: false } });
    await expect(s.job.retryTemporaryFailure()).rejects.toThrow("RETRY_BLOCKED");
    expect(s.counts()).toEqual({ approvals: 1, balances: 0, submissions: 0 });
    expect(await canAbandonTrip(s.store, s.request.operationId)).toBe(true);
  }, "cancelled"));
  it("never releases a terminal job that submitted an earlier step", () => using(async s => {
    expect(await canAbandonTrip(s.store, s.request.operationId)).toBe(false);
    await s.run("beginTrip");
    const cancelled = new TripJob(s.request, s.prepared.candidate, s.store, { async request() { return "cancelled" as const; } });
    await expect(cancelled.runStep("appendRecord:0", s.execute("appendRecord:0"), r => r)).rejects.toThrow("APPROVAL_CANCELLED");
    expect(await canAbandonTrip(s.store, s.request.operationId)).toBe(false);
  }));
  it("persists approval waiting so status can be read while execution is locked", () => using(async s => {
    let release!: (value: "approved") => void;
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    const pending = new TripJob(s.request, s.prepared.candidate, s.store, {
      request() { requested(); return new Promise(resolve => { release = resolve; }); },
    });
    const execution = pending.runStep("beginTrip", s.execute("beginTrip"), r => r);
    await started;
    expect(await pending.getStatus()).toMatchObject({ status: "awaiting-wallet-approval" });
    await expect(s.run("beginTrip")).rejects.toThrow("STORE_BUSY");
    release("approved"); await execution;
  }));
  it("blocks submission without approval", () => using(async s => {
    await expect(s.job.runStep("beginTrip", h => h.submit("tx", async () => s.observed("beginTrip")), r => r))
      .rejects.toThrow("SUBMIT_WITHOUT_APPROVAL");
    expect(s.counts().submissions).toBe(0);
  }));
  it("saves the ID before sending and recovers an ambiguous submission without resending", () => using(async s => {
    await expect(s.job.runStep("beginTrip", async h => {
      await h.balance(async () => ({}));
      return h.submit(s.observed("beginTrip").transactionId, async () => {
        expect(await s.job.getStatus()).toMatchObject({ status: "chain-unknown", transactionId: "synthetic-beginTrip" });
        throw new Error("Connection lost after send");
      });
    }, r => r)).rejects.toThrow("Connection lost");
    const reloaded = new TripJob(s.request, s.prepared.candidate, new LocalJobStore(join(s.directory, "jobs.json")), s.approval);
    expect((await reloaded.getStatus()).status).toBe("chain-unknown");
    await expect(reloaded.runStep("beginTrip", s.execute("beginTrip"), r => r)).rejects.toThrow("RECOVERY_REQUIRED");
    await reloaded.recoverStep("beginTrip", s.observed("beginTrip"));
    await reloaded.runStep("beginTrip", async () => { throw new Error("Resent"); }, r => r as never);
    expect(s.counts().approvals).toBe(1);
  }));
  it("keeps a final result across restart and a simulated B save failure", () => using(async s => {
    await s.run("beginTrip"); await s.run("appendRecord:0"); await s.run("finishTrip");
    const result = await s.job.confirm(s.confirmation());
    const reloaded = new TripJob(s.request, s.prepared.candidate, new LocalJobStore(join(s.directory, "jobs.json")), s.approval);
    expect(await reloaded.getStatus()).toEqual(result);
    expect(await getTripStatus(new LocalJobStore(join(s.directory, "jobs.json")), s.request.operationId)).toEqual(result);
    await reloaded.runStep("finishTrip", async () => { throw new Error("Resent"); }, r => r as never);
    expect(s.counts().submissions).toBe(3);
  }));
  it("rejects changed input with the same operation ID", () => using(async s => {
    await s.job.getStatus();
    const changed = new TripJob({ ...s.request, trip: { ...s.request.trip, datasetSalt: salt(5) } }, s.prepared.candidate, s.store, s.approval);
    await expect(changed.getStatus()).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  }));
  it("blocks another job for the same scope and duplicate idempotency keys", () => using(async s => {
    await s.run("beginTrip");
    const request = { ...s.request, operationId: "other-operation", idempotencyKey: "other-key" };
    const candidate = { ...s.prepared.candidate, operationId: request.operationId };
    await expect(new TripJob(request, candidate, s.store, s.approval).getStatus()).rejects.toThrow("SCOPE_BUSY");
    await expect(new TripJob({ ...request, idempotencyKey: s.request.idempotencyKey }, candidate, s.store, s.approval).getStatus())
      .rejects.toThrow("IDEMPOTENCY_CONFLICT");
  }));
  it("rejects skipping or reordering a stage", () => using(async s => {
    await expect(s.run("finishTrip")).rejects.toThrow("STEP_ORDER");
    await s.run("beginTrip");
    await expect(s.run("finishTrip")).rejects.toThrow("STEP_ORDER");
  }));
  it("rejects a receipt for another transaction", () => using(async s => {
    await expect(s.job.runStep("beginTrip", s.execute("beginTrip"), r => ({ ...r, transactionId: "wrong" }))).rejects.toThrow("RECEIPT_MISMATCH");
    await expect(s.job.recoverStep("beginTrip", { transactionId: "wrong", blockId: "block" })).rejects.toThrow("RECEIPT_MISMATCH");
  }));
  it("rejects a final confirmation for a different contract", () => using(async s => {
    await s.run("beginTrip"); await s.run("appendRecord:0"); await s.run("finishTrip");
    await expect(s.job.confirm({ ...s.confirmation(), chainContractAddress: "wrong" })).rejects.toThrow("CONFIRMATION_MISMATCH");
  }));
  it("allows exactly three classified pre-submission retries at 1, 5, 15 minutes", () => using(async s => {
    let clock = 0;
    for (const delay of [60_000, 300_000, 900_000]) {
      await expect(s.job.runStep("beginTrip", async () => { throw new Error("Temporary"); }, r => r as never)).rejects.toThrow("Temporary");
      await s.job.failBeforeSubmission("TEMPORARY_FAILURE");
      expect((await s.job.getRetryInfo()).nextRetryAt).toBe(clock + delay);
      await expect(s.job.retryTemporaryFailure()).rejects.toThrow("RETRY_BLOCKED");
      clock += delay; s.setClock(clock); await s.job.retryTemporaryFailure();
    }
    await expect(s.job.runStep("beginTrip", async () => { throw new Error("Temporary"); }, r => r as never)).rejects.toThrow("Temporary");
    await s.job.failBeforeSubmission("TEMPORARY_FAILURE");
    expect(await s.job.getRetryInfo()).toEqual({ retries: 3, nextRetryAt: undefined });
    expect(await s.job.getStatus()).toMatchObject({ status: "failed", error: { code: "RETRIES_EXHAUSTED", retryable: false } });
    expect(await canAbandonTrip(s.store, s.request.operationId)).toBe(true);
    await expect(s.job.retryTemporaryFailure()).rejects.toThrow("RETRY_BLOCKED");
    const nextRequest = { ...s.request, operationId: "after-exhaustion", idempotencyKey: "after-exhaustion" };
    const next = new TripJob(nextRequest, { ...s.prepared.candidate, operationId: nextRequest.operationId }, s.store, s.approval);
    expect(await next.getStatus()).toMatchObject({ status: "calculated", operationId: nextRequest.operationId });
  }));
  it("does not retry a proof error or any error after submission", () => using(async s => {
    await expect(s.job.runStep("beginTrip", async () => { throw new Error("Proof"); }, r => r as never)).rejects.toThrow("Proof");
    await s.job.failBeforeSubmission("PROOF_INVALID");
    await expect(s.job.retryTemporaryFailure()).rejects.toThrow("RETRY_BLOCKED");
  }));
  it("keeps post-submission failure ambiguous until C verifies a definite chain rejection", () => using(async s => {
    await expect(s.job.runStep("beginTrip", async h => {
      await h.balance(async () => ({}));
      await h.submit(s.observed("beginTrip").transactionId, async () => ({}));
      throw new Error("Indexer timeout");
    }, r => r as never)).rejects.toThrow("Indexer timeout");
    await expect(s.job.failBeforeSubmission("TEMPORARY_FAILURE")).rejects.toThrow("RECOVERY_REQUIRED");
    await expect(s.job.retryTemporaryFailure()).rejects.toThrow("RETRY_BLOCKED");
    expect((await s.job.getStatus()).status).toBe("chain-unknown");
    await s.job.rejectStep("beginTrip", s.observed("beginTrip").transactionId);
    expect(await s.job.getStatus()).toMatchObject({ status: "failed", error: { code: "CHAIN_REJECTED", retryable: false } });
    await expect(s.job.recoverStep("beginTrip", s.observed("beginTrip"))).rejects.toThrow("TERMINAL_JOB");
  }));
  it("does not send when recording the transaction ID fails", () => using(async s => {
    const store = new LocalJobStore(join(s.directory, "jobs.json"));
    const originalWrite = store.write.bind(store);
    store.write = async value => {
      if (value.steps.at(-1)?.phase === "submitting") throw new Error("Journal unavailable");
      await originalWrite(value);
    };
    const job = new TripJob(s.request, s.prepared.candidate, store, s.approval);
    await expect(job.runStep("beginTrip", s.execute("beginTrip"), r => r)).rejects.toThrow("Journal unavailable");
    expect(s.counts().submissions).toBe(0);
  }));
  it("never stores raw records or the evaluation owner secret", () => using(async s => {
    await s.run("beginTrip");
    const stored = await readFile(join(s.directory, "jobs.json"), "utf8");
    expect(stored).not.toContain('"records"');
    expect(stored).not.toContain('"ownerSecret"');
    expect(stored).not.toContain('"datasetSalt"');
  }));
});
