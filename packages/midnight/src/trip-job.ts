import { createHash, randomUUID } from "node:crypto";
import {
  CalculateTripRequestSchema, CandidateStateSchema, TripProcessingResultSchema,
  canFinalizeState, type CalculateTripRequest, type CandidateState,
  type ChainConfirmation, type TripProcessingResult,
} from "../../shared/src/bc-contract.js";

export type TripStep = "beginTrip" | `appendRecord:${number}` | "finishTrip" | "cancelTrip";
export interface ApprovalRequest {
  approvalRequestId: string; operationId: string; tripId: string;
  network: string; chainContractAddress: string; step: TripStep;
  previousStateCommitment: string; newStateCommitment: string;
}
// A는 이 인터페이스를 가입자 화면에 연결한다. 승인 응답은 신뢰된 로컬 UI에서
// 받아야 하며, B가 보낸 boolean이나 DB 작업 claim을 월렛 승인으로 대신하지 않는다.
export interface WalletApproval {
  request(input: ApprovalRequest): Promise<"approved" | "cancelled">;
}
export interface StepReceipt { transactionId: string; blockId: string }
export interface StepJournal {
  step: TripStep; approvalRequestId: string;
  phase: "proving" | "awaiting" | "approved" | "submitting" | "submitted" | "confirmed" | "cancelled" | "rejected";
  transactionId?: string; receipt?: StepReceipt;
}
type FailedTripResult = Extract<TripProcessingResult, { status: "failed" }>;
export interface JobJournal {
  operationId: string; scopeKey: string; idempotencyKey: string; fingerprint: string;
  result: TripProcessingResult; steps: StepJournal[];
  retries: number; nextRetryAt?: number; terminalFailure?: FailedTripResult;
}
export interface TransactionHooks {
  balance<R>(run: () => Promise<R>): Promise<R>;
  submit<R>(transactionId: string, run: () => Promise<R>): Promise<R>;
}
// 저장소는 잠금 안의 read/list/write를 원자적으로 직렬화해야 한다.
// 실행 중 원본·ownerSecret·월렛 키는 여기에 넣지 않는다. candidate의 State opening은
// 비공개 집계 상태이므로 이 저장소 역시 접근 제한된 C 처리 영역에 있어야 한다.
export interface JobJournalStore {
  withLock<T>(scopeKey: string, run: () => Promise<T>): Promise<T>;
  read(operationId: string): Promise<JobJournal | undefined>;
  list(scopeKey: string): Promise<JobJournal[]>;
  write(value: JobJournal): Promise<void>;
}
export class JobBlocked extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function canReleaseJournal(job: JobJournal): boolean {
  if (job.result.status !== "failed" || job.result.error.retryable) return false;
  const tripTransactions = job.steps.filter(step => step.step !== "cancelTrip" && step.transactionId);
  // 제출 의도가 전혀 없거나 모든 거래가 원장에서 확정 거부됐다면 체인 pending 상태가 없다.
  if (tripTransactions.every(step => step.phase === "rejected")) return true;
  if (tripTransactions.some(step => step.phase !== "confirmed" && step.phase !== "rejected")) return false;
  // finishTrip이 확정됐다면 취소가 아니라 확정 결과 복구가 우선이다.
  if (tripTransactions.some(step => step.step === "finishTrip" && step.phase === "confirmed")) return false;
  const cancellation = [...job.steps].reverse().find(step => step.step === "cancelTrip");
  return cancellation?.phase === "confirmed";
}

// B는 작업 ID만으로 확정 결과를 재조회한다. 원본/candidate를 다시 전송하지 않는다.
// 호출자 인증·객체 권한은 외부 B↔C API에서 처리하며 이 함수는 내부 저장소 조회만 한다.
export async function getTripStatus(store: JobJournalStore, operationId: string): Promise<TripProcessingResult> {
  const journal = await store.read(operationId);
  if (!journal) throw new JobBlocked("UNKNOWN_OPERATION");
  return TripProcessingResultSchema.parse(journal.result);
}

// B가 미제출 terminal 작업만 해제하도록 C의 모든 단계 intent를 확인한다.
// 마지막 실패 응답에 transactionId가 없어도 이전 단계가 제출됐다면 해제하면 안 된다.
export async function canAbandonTrip(store: JobJournalStore, operationId: string): Promise<boolean> {
  const initial = await store.read(operationId);
  if (!initial) return false;
  return store.withLock(initial.scopeKey, async () => {
    const job = await store.read(operationId);
    return Boolean(job && canReleaseJournal(job));
  });
}

/** C의 운행 작업 제어기. 네트워크/키를 소유하지 않고 실제 SDK 호출을 감싼다. */
export class TripJob {
  private readonly request: CalculateTripRequest;
  private readonly candidate: CandidateState;
  private readonly scopeKey: string;
  private readonly fingerprint: string;
  private readonly orderedSteps: TripStep[];
  constructor(request: CalculateTripRequest, candidate: CandidateState,
    private readonly store: JobJournalStore, private readonly approval: WalletApproval,
    private readonly now: () => number = Date.now) {
    this.request = CalculateTripRequestSchema.parse(request);
    this.candidate = CandidateStateSchema.parse(candidate);
    if (this.candidate.operationId !== this.request.operationId || this.candidate.tripId !== this.request.trip.id
      || this.candidate.previousStateCommitment !== this.request.previous.state.stateCommitment
      || JSON.stringify(this.candidate.state.scope) !== JSON.stringify(this.request.scope)
      || this.candidate.state.rule.ruleHash !== this.request.approvedRule.ruleHash) throw new JobBlocked("INPUT_MISMATCH");
    this.scopeKey = hash([this.request.scope, this.request.approvedRule.network, this.request.approvedRule.chainContractAddress]);
    // 같은 ID에 다른 기록/Rule/opening/salt를 넣는 요청은 재시도가 아니다.
    // 프로세스 재시작 때도 최초 prepareTrip의 candidate와 salt를 재사용해야 한다.
    this.fingerprint = hash([this.request, this.candidate]);
    this.orderedSteps = ["beginTrip", ...this.request.trip.records.map((_, i) => `appendRecord:${i}` as const), "finishTrip"];
  }
  private identity() {
    return { contractVersion: "bc-v1" as const, execution: this.request.execution,
      operationId: this.request.operationId, tripId: this.request.trip.id };
  }
  private result(value: object): TripProcessingResult {
    return TripProcessingResultSchema.parse({ ...this.identity(), ...value });
  }
  private async load(): Promise<JobJournal> {
    const existing = await this.store.read(this.request.operationId);
    if (existing) {
      if (existing.fingerprint !== this.fingerprint) throw new JobBlocked("IDEMPOTENCY_CONFLICT");
      return existing;
    }
    const others = await this.store.list(this.scopeKey);
    if (others.some(j => j.idempotencyKey === this.request.idempotencyKey)) throw new JobBlocked("IDEMPOTENCY_CONFLICT");
    // 같은 이전 State로 다른 운행을 동시에 시작하면 둘 다 유효한 후보를 만들 수 있다.
    // 확정/실패 여부를 모르는 기존 작업은 먼저 복구한다. B도 별도 DB claim/CAS가 필요하다.
    if (others.some(j => j.result.status !== "chain-confirmed" && !canReleaseJournal(j))) {
      throw new JobBlocked("SCOPE_BUSY");
    }
    const journal: JobJournal = { operationId: this.request.operationId, scopeKey: this.scopeKey,
      idempotencyKey: this.request.idempotencyKey, fingerprint: this.fingerprint,
      result: this.result({ status: "calculated", candidate: this.candidate }), steps: [], retries: 0 };
    await this.store.write(journal);
    return journal;
  }
  async getStatus(): Promise<TripProcessingResult> {
    // 승인창이 열린 동안 실행 잠금은 유지하지만, B는 저장된 상태를 읽을 수 있어야 한다.
    // 로컬 저장소는 JSON 교체가 원자적이므로 읽기에는 실행 잠금이 필요하지 않다.
    const existing = await this.store.read(this.request.operationId);
    if (existing) {
      if (existing.fingerprint !== this.fingerprint) throw new JobBlocked("IDEMPOTENCY_CONFLICT");
      return existing.result;
    }
    return this.store.withLock(this.scopeKey, async () => (await this.load()).result);
  }

  async runStep<T>(step: TripStep, execute: (hooks: TransactionHooks) => Promise<T>, receipt: (value: T) => StepReceipt): Promise<StepReceipt> {
    return this.store.withLock(this.scopeKey, async () => {
      if (step === "cancelTrip") throw new JobBlocked("USE_CANCEL_AFTER_SUBMISSION");
      const journal = await this.load();
      const old = journal.steps.find(s => s.step === step);
      // 이미 확정된 단계는 receipt만 반환한다. 다시 서명하거나 제출하지 않는다.
      if (old?.phase === "confirmed") return old.receipt!;
      if (journal.result.status === "chain-confirmed" || journal.result.status === "failed") throw new JobBlocked("TERMINAL_JOB");
      if (old) throw new JobBlocked("RECOVERY_REQUIRED");
      if (step !== this.orderedSteps[journal.steps.length]) throw new JobBlocked("STEP_ORDER");
      const entry: StepJournal = { step, approvalRequestId: randomUUID(), phase: "proving" };
      journal.steps.push(entry);
      journal.result = this.result({ status: "proving" });
      await this.store.write(journal);
      let balancing = false;
      try {
        const value = await execute({
          balance: async run => {
            if (entry.phase !== "proving" || balancing) throw new JobBlocked("BALANCE_ORDER");
            balancing = true;
            entry.phase = "awaiting";
            journal.result = this.result({ status: "awaiting-wallet-approval", approvalRequestId: entry.approvalRequestId });
            await this.store.write(journal);
            const decision = await this.approval.request({ approvalRequestId: entry.approvalRequestId,
              operationId: this.request.operationId, tripId: this.request.trip.id,
              network: this.request.approvedRule.network,
              chainContractAddress: this.request.approvedRule.chainContractAddress, step,
              previousStateCommitment: this.candidate.previousStateCommitment,
              newStateCommitment: this.candidate.state.stateCommitment });
            if (decision !== "approved") {
              entry.phase = "cancelled";
              journal.result = this.result({ status: "failed", error: { code: "APPROVAL_CANCELLED", retryable: false } });
              await this.store.write(journal);
              throw new JobBlocked("APPROVAL_CANCELLED");
            }
            // 승인은 해당 작업과 단계에만 유효하다. 승인 전에 SDK 서명 함수를 호출하지 않는다.
            const balanced = await run();
            entry.phase = "approved";
            await this.store.write(journal);
            return balanced;
          },
          submit: async (transactionId, run) => {
            if (entry.phase !== "approved" || !transactionId) throw new JobBlocked("SUBMIT_WITHOUT_APPROVAL");
            // 통신 전에 거래 ID를 저장한다. 제출 후 연결이 끊겨도 같은 ID로 조회한다.
            // submitting은 노드 수락 확인이 아니라 제출 의도를 기록한 상태다.
            entry.phase = "submitting"; entry.transactionId = transactionId;
            journal.result = this.result({ status: "chain-unknown", transactionId });
            await this.store.write(journal);
            const submitted = await run();
            entry.phase = "submitted";
            journal.result = this.result({ status: "submitted", transactionId });
            await this.store.write(journal);
            return submitted;
          },
        });
        const observed = receipt(value);
        if (entry.phase !== "submitted" || observed.transactionId !== entry.transactionId || !observed.blockId) {
          throw new JobBlocked("RECEIPT_MISMATCH");
        }
        entry.phase = "confirmed"; entry.receipt = observed;
        // begin/append 성공은 운행 전체 확정이 아니다. finish와 실제 원장 검사까지 기다린다.
        journal.result = this.result({ status: "proving" });
        await this.store.write(journal);
        return observed;
      } catch (error) {
        if (entry.transactionId) {
          journal.result = this.result({ status: "chain-unknown", transactionId: entry.transactionId });
          await this.store.write(journal);
        }
        // 제출 전 예외가 증명·통신·UI 오류 중 무엇인지 임의로 분류하지 않는다.
        // 입력·증명 무효를 일시적 실패로 분류해 자동 재시도하는 일을 피한다.
        throw error;
      }
    });
  }

  /** 제출 전의 오류를 신뢰된 어댑터가 분류한다. 모르는 SDK 예외는 자동 재시도하지 않는다. */
  async failBeforeSubmission(code: "TEMPORARY_FAILURE" | "PROOF_INVALID" | "INVALID_INPUT"): Promise<void> {
    await this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      const entry = journal.steps.at(-1);
      if (!entry || entry.transactionId || entry.phase === "confirmed" || entry.phase === "cancelled"
        || journal.result.status === "chain-confirmed" || journal.result.status === "failed") throw new JobBlocked("RECOVERY_REQUIRED");
      // 허용한 재시도까지 소진하면 terminal 오류로 바꾼다. 더 실행할 수 없는
      // 미제출 작업이 다음 운행을 영구히 막지 않도록 B가 안전한 종료를 확인한다.
      const finalCode = code === "TEMPORARY_FAILURE" && journal.retries >= 3 ? "RETRIES_EXHAUSTED" : code;
      journal.result = this.result({ status: "failed", error: { code: finalCode, retryable: finalCode === "TEMPORARY_FAILURE" } });
      if (code === "TEMPORARY_FAILURE" && journal.retries < 3) {
        journal.nextRetryAt = this.now() + [60_000, 300_000, 900_000][journal.retries]!;
      } else delete journal.nextRetryAt;
      await this.store.write(journal);
    });
  }
  async getRetryInfo(): Promise<{ retries: number; nextRetryAt?: number }> {
    return this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      return { retries: journal.retries, nextRetryAt: journal.nextRetryAt };
    });
  }
  /** B 스케줄러가 호출할 재시도 입구. 새 candidate/salt를 만들거나 기존 성공 단계를 반복하지 않는다. */
  async retryTemporaryFailure(): Promise<void> {
    await this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      if (journal.result.status !== "failed" || journal.result.error.code !== "TEMPORARY_FAILURE"
        || journal.nextRetryAt === undefined || journal.retries >= 3
        || this.now() < journal.nextRetryAt || journal.steps.at(-1)?.transactionId) throw new JobBlocked("RETRY_BLOCKED");
      journal.steps.pop(); journal.retries++;
      delete journal.nextRetryAt;
      journal.result = this.result({ status: "proving" });
      await this.store.write(journal);
    });
  }

  /** 신뢰된 C 어댑터만 indexer의 실제 성공 receipt를 검증한 뒤 호출한다. */
  async recoverStep(step: TripStep, observed: StepReceipt): Promise<void> {
    await this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      const entry = journal.steps.find(s => s.step === step);
      if (!entry?.transactionId || entry.transactionId !== observed.transactionId || !observed.blockId) throw new JobBlocked("RECEIPT_MISMATCH");
      if (entry.phase === "confirmed") {
        if (entry.receipt?.blockId !== observed.blockId) throw new JobBlocked("RECEIPT_MISMATCH");
        return;
      }
      if (journal.result.status === "failed") throw new JobBlocked("TERMINAL_JOB");
      if (entry.phase !== "submitting" && entry.phase !== "submitted") throw new JobBlocked("RECOVERY_REQUIRED");
      entry.phase = "confirmed"; entry.receipt = observed;
      journal.result = this.result({ status: "proving" });
      await this.store.write(journal);
    });
  }

  /** 단순 조회 timeout이 아니라 해당 Tx의 확정 실패를 C가 검증했을 때만 호출한다. */
  async rejectStep(step: TripStep, transactionId: string): Promise<void> {
    await this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      const entry = journal.steps.find(s => s.step === step);
      if (!entry || entry.transactionId !== transactionId || entry.phase === "confirmed"
        || journal.result.status === "chain-confirmed") throw new JobBlocked("RECEIPT_MISMATCH");
      entry.phase = "rejected";
      journal.result = this.result({ status: "failed", error: { code: "CHAIN_REJECTED", retryable: false, transactionId } });
      await this.store.write(journal);
    });
  }

  /**
   * 앞 단계가 체인에 반영된 terminal 운행을 가입자 승인 cancelTrip으로 닫는다.
   * B는 이 receipt가 저장되고 canAbandonTrip이 true가 된 뒤에만 DB scope를 해제한다.
   */
  async cancelAfterSubmission<T>(execute: (hooks: TransactionHooks) => Promise<T>,
    receipt: (value: T) => StepReceipt): Promise<StepReceipt> {
    return this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      const existing = [...journal.steps].reverse().find(step => step.step === "cancelTrip");
      if (existing?.phase === "confirmed") return existing.receipt!;
      if (existing) throw new JobBlocked("CANCELLATION_RECOVERY_REQUIRED");
      if (journal.result.status !== "failed" || journal.result.error.retryable) {
        throw new JobBlocked("CANCELLATION_NOT_ALLOWED");
      }
      const tripTransactions = journal.steps.filter(step => step.transactionId);
      if (!tripTransactions.some(step => step.phase === "confirmed")
        || tripTransactions.some(step => step.phase !== "confirmed" && step.phase !== "rejected")
        || tripTransactions.some(step => step.step === "finishTrip" && step.phase === "confirmed")) {
        throw new JobBlocked("CANCELLATION_NOT_READY");
      }
      const terminalFailure = journal.result;
      journal.terminalFailure = terminalFailure;
      const entry: StepJournal = { step: "cancelTrip", approvalRequestId: randomUUID(), phase: "proving" };
      journal.steps.push(entry);
      journal.result = this.result({ status: "proving" });
      await this.store.write(journal);
      let balancing = false;
      try {
        const value = await execute({
          balance: async run => {
            if (entry.phase !== "proving" || balancing) throw new JobBlocked("BALANCE_ORDER");
            balancing = true;
            entry.phase = "awaiting";
            journal.result = this.result({ status: "awaiting-wallet-approval", approvalRequestId: entry.approvalRequestId });
            await this.store.write(journal);
            const decision = await this.approval.request({ approvalRequestId: entry.approvalRequestId,
              operationId: this.request.operationId, tripId: this.request.trip.id,
              network: this.request.approvedRule.network,
              chainContractAddress: this.request.approvedRule.chainContractAddress, step: "cancelTrip",
              previousStateCommitment: this.candidate.previousStateCommitment,
              newStateCommitment: this.candidate.previousStateCommitment });
            if (decision !== "approved") {
              entry.phase = "cancelled";
              journal.result = terminalFailure;
              await this.store.write(journal);
              throw new JobBlocked("APPROVAL_CANCELLED");
            }
            const balanced = await run();
            entry.phase = "approved";
            await this.store.write(journal);
            return balanced;
          },
          submit: async (transactionId, run) => {
            if (entry.phase !== "approved" || !transactionId) throw new JobBlocked("SUBMIT_WITHOUT_APPROVAL");
            entry.phase = "submitting";
            entry.transactionId = transactionId;
            journal.result = this.result({ status: "chain-unknown", transactionId });
            await this.store.write(journal);
            const submitted = await run();
            entry.phase = "submitted";
            journal.result = this.result({ status: "submitted", transactionId });
            await this.store.write(journal);
            return submitted;
          },
        });
        const observed = receipt(value);
        if (entry.phase !== "submitted" || observed.transactionId !== entry.transactionId || !observed.blockId) {
          throw new JobBlocked("RECEIPT_MISMATCH");
        }
        entry.phase = "confirmed";
        entry.receipt = observed;
        journal.result = terminalFailure;
        await this.store.write(journal);
        return observed;
      } catch (error) {
        if (entry.transactionId) {
          journal.result = this.result({ status: "chain-unknown", transactionId: entry.transactionId });
        } else {
          journal.result = terminalFailure;
        }
        await this.store.write(journal);
        throw error;
      }
    });
  }

  /** 결과 불명 cancelTrip의 실제 성공 receipt를 조회한 뒤 재제출 없이 종료한다. */
  async recoverCancellation(observed: StepReceipt): Promise<void> {
    await this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      const entry = [...journal.steps].reverse().find(step => step.step === "cancelTrip");
      if (!entry?.transactionId || entry.transactionId !== observed.transactionId || !observed.blockId
        || !journal.terminalFailure) throw new JobBlocked("RECEIPT_MISMATCH");
      if (entry.phase === "confirmed") {
        if (entry.receipt?.blockId !== observed.blockId) throw new JobBlocked("RECEIPT_MISMATCH");
        return;
      }
      if (entry.phase !== "submitting" && entry.phase !== "submitted") throw new JobBlocked("RECOVERY_REQUIRED");
      entry.phase = "confirmed";
      entry.receipt = observed;
      journal.result = journal.terminalFailure;
      await this.store.write(journal);
    });
  }

  /** finish 성공과 실제 원장 일치 확인 후의 C 결과다. B는 DB CAS 후 원본을 삭제한다. */
  async confirm(confirmation: ChainConfirmation): Promise<TripProcessingResult> {
    return this.store.withLock(this.scopeKey, async () => {
      const journal = await this.load();
      if (journal.result.status === "chain-confirmed") return journal.result;
      const final = journal.steps.at(-1);
      if (journal.steps.length !== this.orderedSteps.length || journal.steps.some(s => s.phase !== "confirmed")
        || final?.step !== "finishTrip" || final.receipt?.transactionId !== confirmation.transactionId
        || final.receipt.blockId !== confirmation.blockId) throw new JobBlocked("INCOMPLETE_JOB");
      const result = this.result({ status: "chain-confirmed", candidate: this.candidate, confirmation });
      if (!canFinalizeState(result, this.request)) throw new JobBlocked("CONFIRMATION_MISMATCH");
      // B의 DB 저장이 실패해도 C의 확정 결과를 유지하고 같은 ID로 다시 조회한다.
      journal.result = result;
      await this.store.write(journal);
      return result;
    });
  }
}
