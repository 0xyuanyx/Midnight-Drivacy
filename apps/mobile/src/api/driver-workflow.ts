/** The persisted workflow contains identifiers and public results only; never trip.records or salts. */
export const DRIVER_WORKFLOW_KEY = "@drivacy/driver-workflow/v1";

export interface DrivingTarget {
  insuranceContractId: string;
  specialContractId: string;
  evaluationPeriod: string;
}

export interface ConfirmedTripSummary {
  operationId: string;
  tripId: string;
  tripCount: number;
  tripDistanceM: number;
  totalDistanceM: number;
  score: number;
  conditionsMet: boolean;
  expectedDiscountBps: number;
  ruleVersion: number;
  stateCommitment: string;
  transactionId: string;
}

export type ProcessingStatus = "calculated" | "proving" | "awaiting-wallet-approval" | "submitted" | "chain-unknown" | "db-pending" | "db-confirmed" | "failed";
export interface ProcessingView {
  operationId: string;
  status: ProcessingStatus;
  approvalRequestId?: string;
  transactionId?: string;
  summary?: ConfirmedTripSummary;
}

interface WorkflowState {
  target: DrivingTarget;
  startKey: string;
  sessionId?: string;
  tripId?: string;
  startedAt?: string;
  endedAt?: string;
  processKey?: string;
  operationId?: string;
  status?: ProcessingStatus;
  summary?: ConfirmedTripSummary;
}

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface DriverWorkflowApi {
  startDrivingSession(target: DrivingTarget, key: string): Promise<unknown>;
  getDrivingSession(id: string): Promise<unknown>;
  endDrivingSession(id: string): Promise<unknown>;
  processDrivingSession(id: string, key: string): Promise<unknown>;
  getTripProcessing(id: string): Promise<unknown>;
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("서버 응답 형식이 올바르지 않습니다.");
  return value as Record<string, unknown>;
};
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const finiteNonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function sessionIds(value: unknown): { sessionId: string; tripId: string; startedAt: string; endedAt?: string } {
  const response = object(value);
  const trip = object(response.trip);
  if (!nonempty(response.sessionId) || !nonempty(trip.id) || !nonempty(response.startedAt)
    || !Array.isArray(trip.records) || (response.status !== "GENERATED" && response.status !== "ENDED")) {
    throw new Error("운행 응답 형식이 올바르지 않습니다.");
  }
  return { sessionId: response.sessionId, tripId: trip.id, startedAt: response.startedAt,
    ...(nonempty(response.endedAt) ? { endedAt: response.endedAt } : {}) };
}

function confirmedSummary(value: unknown, operationId: string): ConfirmedTripSummary {
  const summary = object(value);
  if (summary.operationId !== operationId || !nonempty(summary.tripId)
    || !Number.isInteger(summary.tripCount) || !finiteNonnegative(summary.tripDistanceM)
    || !finiteNonnegative(summary.totalDistanceM) || !finiteNonnegative(summary.score)
    || typeof summary.conditionsMet !== "boolean" || !finiteNonnegative(summary.expectedDiscountBps)
    || !Number.isInteger(summary.ruleVersion) || !nonempty(summary.stateCommitment)
    || !nonempty(summary.transactionId)) throw new Error("확정 결과 형식이 올바르지 않습니다.");
  return summary as unknown as ConfirmedTripSummary;
}

function processingView(value: unknown, operationId: string): ProcessingView {
  const response = object(value);
  if (response.operationId !== operationId) throw new Error("처리 작업 ID가 일치하지 않습니다.");
  const status = response.status;
  if (status !== "calculated" && status !== "proving" && status !== "awaiting-wallet-approval" && status !== "submitted" && status !== "chain-unknown"
    && status !== "db-pending" && status !== "db-confirmed" && status !== "failed") {
    throw new Error("알 수 없는 처리 상태입니다.");
  }
  const view: ProcessingView = { operationId, status };
  if (nonempty(response.approvalRequestId)) view.approvalRequestId = response.approvalRequestId;
  if (nonempty(response.transactionId)) view.transactionId = response.transactionId;
  if (status === "db-confirmed") view.summary = confirmedSummary(response.summary, operationId);
  return view;
}

export function createDriverWorkflow(api: DriverWorkflowApi, storage: Storage, newKey: () => string, ownerId: string) {
  if (!ownerId) throw new Error("인증된 사용자 ID가 필요합니다.");
  const storageKey = `${DRIVER_WORKFLOW_KEY}/${encodeURIComponent(ownerId)}`;
  const read = async (): Promise<WorkflowState | null> => {
    const stored = await storage.getItem(storageKey);
    if (!stored) return null;
    try {
      const value = object(JSON.parse(stored));
      const target = object(value.target);
      if (!nonempty(value.startKey) || !nonempty(target.insuranceContractId)
        || !nonempty(target.specialContractId) || !nonempty(target.evaluationPeriod)) return null;
      // Drop unrecognized fields from storage, especially any accidentally persisted private payload.
      return { target: target as unknown as DrivingTarget, startKey: value.startKey,
        ...(nonempty(value.sessionId) ? { sessionId: value.sessionId } : {}),
        ...(nonempty(value.tripId) ? { tripId: value.tripId } : {}),
        ...(nonempty(value.startedAt) ? { startedAt: value.startedAt } : {}),
        ...(nonempty(value.endedAt) ? { endedAt: value.endedAt } : {}),
        ...(nonempty(value.processKey) ? { processKey: value.processKey } : {}),
        ...(nonempty(value.operationId) ? { operationId: value.operationId } : {}),
        ...(typeof value.status === "string" ? { status: value.status as ProcessingStatus } : {}),
        ...(value.summary ? { summary: confirmedSummary(value.summary, String(value.operationId)) } : {}),
      };
    } catch { return null; }
  };
  const save = async (state: WorkflowState): Promise<void> => {
    await storage.setItem(storageKey, JSON.stringify(state));
  };

  return {
    snapshot: read,
    async start(target: DrivingTarget) {
      let state = await read();
      const sameTarget = state && JSON.stringify(state.target) === JSON.stringify(target);
      if (state?.sessionId && state.status !== "db-confirmed") {
        if (!sameTarget) throw new Error("이전 운행이 처리 중입니다.");
        return api.getDrivingSession(state.sessionId);
      }
      if (!sameTarget || state?.status === "db-confirmed") {
        state = { target, startKey: newKey() };
        await save(state);
      }
      const response = await api.startDrivingSession(target, state!.startKey);
      const ids = sessionIds(response);
      await save({ ...state!, ...ids });
      return response;
    },
    async endAndProcess(): Promise<string> {
      let state = await read();
      if (!state?.sessionId || !state.tripId) throw new Error("진행 중인 운행이 없습니다.");
      const sessionId = state.sessionId;
      if (!state.endedAt) {
        const ended = sessionIds(await api.endDrivingSession(sessionId));
        if (ended.sessionId !== sessionId || ended.tripId !== state.tripId || !ended.endedAt) throw new Error("운행 종료 응답이 일치하지 않습니다.");
        state = { ...state, endedAt: ended.endedAt };
        await save(state);
      }
      if (state.operationId) return state.operationId;
      if (!state.processKey) {
        state = { ...state, processKey: newKey() };
        await save(state);
      }
      const result = object(await api.processDrivingSession(sessionId, state.processKey!));
      if (!nonempty(result.operationId) || result.operationId !== state.tripId) throw new Error("처리 작업 ID가 운행과 일치하지 않습니다.");
      await save({ ...state, operationId: result.operationId });
      return result.operationId;
    },
    async poll(): Promise<ProcessingView> {
      const state = await read();
      if (!state?.tripId || !state.endedAt) throw new Error("처리 중인 운행이 없습니다.");
      // Backend uses the generated trip ID as the operation ID, including after a lost stage response.
      const operationId = state.operationId ?? state.tripId;
      const view = processingView(await api.getTripProcessing(operationId), operationId);
      if (view.summary && view.summary.tripId !== state.tripId) throw new Error("확정 결과가 운행과 일치하지 않습니다.");
      await save({ ...state, operationId, status: view.status, ...(view.summary ? { summary: view.summary } : {}) });
      return view;
    },
    async confirmedResult(): Promise<ConfirmedTripSummary | null> {
      const state = await read();
      return state?.status === "db-confirmed" ? state.summary ?? null : null;
    },
  };
}
