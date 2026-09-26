import {
  demoTrips,
  initialDemoTotals,
  isDemoPolicyId,
  type DemoTotals,
} from "@/fixtures/demo";
import type { ConfirmedTripSummary } from "@/api/driver-workflow";
import { parseDriverApplication, type DriverApplicationView } from "@/api/driver-application";

export type TripsCompleted = 0 | 1 | 2;
export type ApplicationStage = "idle" | "pending" | "approved" | "rejected";
export type DriveStage = "idle" | "active" | "processing" | "result";

export interface AppState {
  source?: "backend";
  /** Explicit fixture-only flow entered after a successful empty live insurance lookup. */
  demoMode?: boolean;
  backendTarget?: { specialContractId: string; evaluationPeriod: string };
  backendSession?: { sessionId: string; operationId: string };
  backendSummary?: ConfirmedTripSummary;
  backendApplication?: DriverApplicationView;
  setupPreviewCompleted?: boolean;
  hasConsented: boolean;
  selectedPolicyId: string | null;
  tripsCompleted: TripsCompleted;
  driveStage: DriveStage;
  tripStartedAt?: number;
  tripEndedAt?: number;
  totals: DemoTotals;
  applicationStage: ApplicationStage;
  applicationMode?: "local" | "linked" | "backend";
  applicationSubmittedAt?: number;
  applicationDecidedAt?: number;
}

export type AppAction =
  | { type: "COMPLETE_SETUP_PREVIEW" }
  | { type: "ACCEPT_CONSENT" }
  | { type: "SELECT_INSURANCE"; policyId: string }
  | { type: "SELECT_DEMO_INSURANCE"; policyId: string }
  | { type: "SELECT_BACKEND_INSURANCE"; policyId: string; specialContractId: string; evaluationPeriod: string }
  | { type: "START_BACKEND_TRIP"; sessionId: string; operationId: string; startedAt: number }
  | { type: "FINISH_BACKEND_TRIP"; endedAt: number }
  | { type: "COMPLETE_BACKEND_TRIP"; summary: ConfirmedTripSummary }
  | { type: "SYNC_BACKEND_APPLICATION"; application: DriverApplicationView }
  | { type: "START_TRIP" }
  | { type: "FINISH_TRIP" }
  | { type: "COMPLETE_TRIP" }
  | { type: "DISMISS_TRIP_RESULT" }
  | { type: "SUBMIT_APPLICATION"; mode?: "local" | "linked" }
  | { type: "APPROVE_APPLICATION" }
  | { type: "RESET_APPLICATION" }
  | { type: "RESET_DEMO" }
  | { type: "HYDRATE"; persistedState: unknown; mode?: "local" | "linked" | "backend" };

export const initialAppState: AppState = {
  hasConsented: false,
  selectedPolicyId: null,
  tripsCompleted: 0,
  driveStage: "idle",
  totals: { ...initialDemoTotals },
  applicationStage: "idle",
};

function totalsForTrips(tripsCompleted: TripsCompleted): DemoTotals {
  if (tripsCompleted === 0) {
    return { ...initialDemoTotals };
  }

  const trip = demoTrips[tripsCompleted - 1];
  return { ...trip.cumulativeTotals };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && !Number.isNaN(new Date(value).getTime());
}

function isTripsCompleted(value: unknown): value is TripsCompleted {
  return value === 0 || value === 1 || value === 2;
}

function isApplicationStage(value: unknown): value is ApplicationStage {
  return value === "idle" || value === "pending" || value === "approved" || value === "rejected";
}

function stageForBackendApplication(application: DriverApplicationView): ApplicationStage {
  return application.stage === "applied" ? "approved" : application.stage === "rejected" ? "rejected" : "pending";
}

function isDriveStage(value: unknown): value is DriveStage {
  return value === "idle" || value === "active" || value === "processing" || value === "result";
}

function normalizedDriveStage(value: unknown, tripsCompleted: TripsCompleted): DriveStage {
  if (!isDriveStage(value)) {
    return "idle";
  }

  if ((value === "active" || value === "processing") && tripsCompleted === 2) {
    return "idle";
  }

  return value === "result" && tripsCompleted === 0 ? "idle" : value;
}

export function hasSelectedDemoPolicy(state: Pick<AppState, "hasConsented" | "selectedPolicyId" | "source">): boolean {
  if (!state.hasConsented) return false;
  return state.source === "backend"
    ? typeof state.selectedPolicyId === "string" && state.selectedPolicyId.length > 0
    : isDemoPolicyId(state.selectedPolicyId);
}

/** Keeps storage migrations conservative by accepting only public AppState fields. */
export function normalizePersistedAppState(persistedState: unknown, currentMode: "local" | "linked" | "backend" = "local"): AppState {
  const unselectedState: AppState = currentMode === "backend"
    ? { ...initialAppState, source: "backend" }
    : initialAppState;
  if (!isRecord(persistedState)) {
    return unselectedState;
  }

  const hasConsented = persistedState.hasConsented === true;
  const setupPreviewCompleted = persistedState.setupPreviewCompleted === true;
  if (!hasConsented) {
    return setupPreviewCompleted ? { ...unselectedState, setupPreviewCompleted: true } : unselectedState;
  }

  if (currentMode === "backend" && persistedState.source === "backend" && typeof persistedState.selectedPolicyId === "string") {
    const target = isRecord(persistedState.backendTarget) ? persistedState.backendTarget : {};
    if (typeof target.specialContractId === "string" && typeof target.evaluationPeriod === "string") {
      const session = isRecord(persistedState.backendSession) ? persistedState.backendSession : {};
      const validSession = typeof session.sessionId === "string" && typeof session.operationId === "string";
      const stage = persistedState.driveStage === "active" && !validTimestamp(persistedState.tripEndedAt)
        ? "active" : "processing";
      let backendApplication: DriverApplicationView | undefined;
      try {
        if (persistedState.backendApplication) backendApplication = parseDriverApplication(persistedState.backendApplication);
      } catch { /* Keep an invalid persisted application out of the UI. */ }
      if (backendApplication?.insuranceContractId !== persistedState.selectedPolicyId
        || backendApplication?.specialContractId !== target.specialContractId) backendApplication = undefined;
      return {
        ...initialAppState, source: "backend", hasConsented: true,
        setupPreviewCompleted, selectedPolicyId: persistedState.selectedPolicyId,
        backendTarget: { specialContractId: target.specialContractId, evaluationPeriod: target.evaluationPeriod },
        ...(validSession ? { backendSession: { sessionId: session.sessionId as string, operationId: session.operationId as string } } : {}),
        driveStage: validSession ? stage : "idle",
        tripStartedAt: validTimestamp(persistedState.tripStartedAt) ? persistedState.tripStartedAt : undefined,
        tripEndedAt: validTimestamp(persistedState.tripEndedAt) ? persistedState.tripEndedAt : undefined,
        tripsCompleted: 0,
        totals: { ...initialDemoTotals },
        ...(backendApplication ? { backendApplication, applicationMode: "backend" as const } : {}),
        applicationStage: backendApplication ? "pending" : "idle",
      };
    }
  }

  const demoMode = currentMode === "backend" && persistedState.demoMode === true;
  const selectedPolicyId = isDemoPolicyId(persistedState.selectedPolicyId)
    ? persistedState.selectedPolicyId
    : null;
  if (!selectedPolicyId) {
    return { ...unselectedState, hasConsented: true, ...(setupPreviewCompleted ? { setupPreviewCompleted: true } : {}) };
  }

  const tripsCompleted = isTripsCompleted(persistedState.tripsCompleted)
    ? persistedState.tripsCompleted
    : initialAppState.tripsCompleted;
  const totals = totalsForTrips(tripsCompleted);
  const applicationMode = persistedState.applicationMode === "linked" ? "linked" : "local";
  const applicationStage =
    tripsCompleted === 2 && totals.isEligible && isApplicationStage(persistedState.applicationStage)
      && applicationMode === (demoMode ? "local" : currentMode) ? persistedState.applicationStage
      : "idle";
  const driveStage = normalizedDriveStage(persistedState.driveStage, tripsCompleted);

  return {
    ...initialAppState,
    hasConsented,
    ...(demoMode ? { demoMode: true } : {}),
    ...(setupPreviewCompleted ? { setupPreviewCompleted: true } : {}),
    selectedPolicyId,
    tripsCompleted,
    driveStage,
    tripStartedAt: typeof persistedState.tripStartedAt === "number" && Number.isFinite(persistedState.tripStartedAt) && persistedState.tripStartedAt > 0
      ? persistedState.tripStartedAt : driveStage === "active" ? Date.now() : undefined,
    tripEndedAt: typeof persistedState.tripEndedAt === "number" && Number.isFinite(persistedState.tripEndedAt) && persistedState.tripEndedAt > 0
      ? persistedState.tripEndedAt : undefined,
    totals,
    applicationStage,
    applicationMode,
    ...(applicationStage !== "idle" && applicationMode === "local" && validTimestamp(persistedState.applicationSubmittedAt)
      ? { applicationSubmittedAt: persistedState.applicationSubmittedAt } : {}),
    ...(applicationStage === "approved" && applicationMode === "local" && validTimestamp(persistedState.applicationDecidedAt)
      ? { applicationDecidedAt: persistedState.applicationDecidedAt } : {}),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "COMPLETE_SETUP_PREVIEW":
      return { ...state, setupPreviewCompleted: true };
    case "ACCEPT_CONSENT":
      return { ...state, hasConsented: true };
    case "SELECT_INSURANCE":
      return state.hasConsented && state.source !== "backend" && isDemoPolicyId(action.policyId)
        ? { ...state, selectedPolicyId: action.policyId }
        : state;
    case "SELECT_DEMO_INSURANCE":
      return state.hasConsented && state.source === "backend" && isDemoPolicyId(action.policyId)
        ? { ...initialAppState, hasConsented: true, setupPreviewCompleted: true,
          demoMode: true, selectedPolicyId: action.policyId }
        : state;
    case "SELECT_BACKEND_INSURANCE":
      return state.hasConsented && action.policyId && action.specialContractId && action.evaluationPeriod
        ? { ...initialAppState, hasConsented: true, setupPreviewCompleted: state.setupPreviewCompleted,
          source: "backend", selectedPolicyId: action.policyId,
          backendTarget: { specialContractId: action.specialContractId, evaluationPeriod: action.evaluationPeriod } }
        : state;
    case "START_BACKEND_TRIP":
      return state.source === "backend" && hasSelectedDemoPolicy(state) && state.driveStage === "idle" && state.tripsCompleted < 2
        ? { ...state, driveStage: "active", backendSession: { sessionId: action.sessionId, operationId: action.operationId },
          tripStartedAt: action.startedAt, tripEndedAt: undefined }
        : state;
    case "FINISH_BACKEND_TRIP":
      return state.source === "backend" && state.driveStage === "active" && state.backendSession
        ? { ...state, driveStage: "processing", tripEndedAt: action.endedAt }
        : state;
    case "COMPLETE_BACKEND_TRIP": {
      const summary = action.summary;
      if (state.source !== "backend" || state.driveStage !== "processing"
        || !state.backendSession || state.backendSession.operationId !== summary.operationId
        || summary.tripId !== summary.operationId) return state;
      return { ...state, driveStage: "result", backendSummary: summary,
        tripsCompleted: Math.min(summary.tripCount, 2) as TripsCompleted,
        totals: { distanceKm: summary.totalDistanceM / 1000, score: summary.score,
          isEligible: summary.conditionsMet, expectedDiscountPercent: summary.expectedDiscountBps / 100 } };
    }
    case "SYNC_BACKEND_APPLICATION": {
      const application = action.application;
      if (state.source !== "backend" || state.selectedPolicyId !== application.insuranceContractId
        || state.backendTarget?.specialContractId !== application.specialContractId) return state;
      return { ...state, backendApplication: application,
        applicationStage: stageForBackendApplication(application), applicationMode: "backend" };
    }
    case "START_TRIP":
      return state.source !== "backend" && hasSelectedDemoPolicy(state) && state.driveStage === "idle" && state.tripsCompleted < 2
        ? { ...state, driveStage: "active", tripStartedAt: Date.now(), tripEndedAt: undefined }
        : state;
    case "FINISH_TRIP":
      return state.source !== "backend" && hasSelectedDemoPolicy(state) && state.driveStage === "active" && state.tripsCompleted < 2
        ? { ...state, driveStage: "processing", tripEndedAt: Date.now() }
        : state;
    case "COMPLETE_TRIP": {
      if (state.source === "backend" || !hasSelectedDemoPolicy(state) || state.driveStage !== "processing") {
        return state;
      }

      const nextTrip = demoTrips[state.tripsCompleted];
      if (!nextTrip) {
        return state;
      }

      return {
        ...state,
        tripsCompleted: nextTrip.sequence,
        driveStage: "result",
        totals: { ...nextTrip.cumulativeTotals },
      };
    }
    case "DISMISS_TRIP_RESULT":
      return state.driveStage === "result" ? { ...state, driveStage: "idle" } : state;
    case "SUBMIT_APPLICATION":
      return state.source !== "backend" && hasSelectedDemoPolicy(state) && state.tripsCompleted === 2 && state.totals.isEligible && state.applicationStage === "idle"
        ? { ...state, applicationStage: "pending", applicationMode: action.mode ?? "local", applicationSubmittedAt: action.mode === "linked" ? undefined : Date.now(), applicationDecidedAt: undefined }
        : state;
    case "APPROVE_APPLICATION":
      return state.source !== "backend" && hasSelectedDemoPolicy(state) && state.tripsCompleted === 2 && state.totals.isEligible && state.applicationStage === "pending"
        ? { ...state, applicationStage: "approved", applicationDecidedAt: state.applicationMode === "linked" ? undefined : Date.now() }
        : state;
    case "RESET_DEMO":
      return state.demoMode
        ? { ...initialAppState, source: "backend", setupPreviewCompleted: true, hasConsented: true }
        : initialAppState;
    case "RESET_APPLICATION":
      return state.applicationStage !== "idle" ? { ...state, applicationStage: "idle", applicationMode: undefined, applicationSubmittedAt: undefined, applicationDecidedAt: undefined } : state;
    case "HYDRATE":
      return normalizePersistedAppState(action.persistedState, action.mode);
    default:
      return state;
  }
}
