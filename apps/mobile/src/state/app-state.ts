import {
  demoTrips,
  initialDemoTotals,
  isDemoPolicyId,
  type DemoTotals,
} from "@/fixtures/demo";

export type TripsCompleted = 0 | 1 | 2;
export type ApplicationStage = "idle" | "pending" | "approved";
export type DriveStage = "idle" | "active" | "processing" | "result";

export interface AppState {
  hasConsented: boolean;
  selectedPolicyId: string | null;
  tripsCompleted: TripsCompleted;
  driveStage: DriveStage;
  tripStartedAt?: number;
  tripEndedAt?: number;
  totals: DemoTotals;
  applicationStage: ApplicationStage;
}

export type AppAction =
  | { type: "ACCEPT_CONSENT" }
  | { type: "SELECT_INSURANCE"; policyId: string }
  | { type: "START_TRIP" }
  | { type: "FINISH_TRIP" }
  | { type: "COMPLETE_TRIP" }
  | { type: "DISMISS_TRIP_RESULT" }
  | { type: "SUBMIT_APPLICATION" }
  | { type: "APPROVE_APPLICATION" }
  | { type: "RESET_DEMO" }
  | { type: "HYDRATE"; persistedState: unknown };

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

function isTripsCompleted(value: unknown): value is TripsCompleted {
  return value === 0 || value === 1 || value === 2;
}

function isApplicationStage(value: unknown): value is ApplicationStage {
  return value === "idle" || value === "pending" || value === "approved";
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

export function hasSelectedDemoPolicy(state: Pick<AppState, "hasConsented" | "selectedPolicyId">): boolean {
  return state.hasConsented && isDemoPolicyId(state.selectedPolicyId);
}

/** Keeps storage migrations conservative by accepting only public AppState fields. */
export function normalizePersistedAppState(persistedState: unknown): AppState {
  if (!isRecord(persistedState)) {
    return initialAppState;
  }

  const hasConsented = persistedState.hasConsented === true;
  if (!hasConsented) {
    return initialAppState;
  }

  const selectedPolicyId = isDemoPolicyId(persistedState.selectedPolicyId)
    ? persistedState.selectedPolicyId
    : null;
  if (!selectedPolicyId) {
    return { ...initialAppState, hasConsented: true };
  }

  const tripsCompleted = isTripsCompleted(persistedState.tripsCompleted)
    ? persistedState.tripsCompleted
    : initialAppState.tripsCompleted;
  const totals = totalsForTrips(tripsCompleted);
  const applicationStage =
    tripsCompleted === 2 && totals.isEligible && isApplicationStage(persistedState.applicationStage)
      ? persistedState.applicationStage
      : "idle";
  const driveStage = normalizedDriveStage(persistedState.driveStage, tripsCompleted);

  return {
    ...initialAppState,
    hasConsented,
    selectedPolicyId,
    tripsCompleted,
    driveStage,
    tripStartedAt: typeof persistedState.tripStartedAt === "number" && Number.isFinite(persistedState.tripStartedAt) && persistedState.tripStartedAt > 0
      ? persistedState.tripStartedAt : driveStage === "active" ? Date.now() : undefined,
    tripEndedAt: typeof persistedState.tripEndedAt === "number" && Number.isFinite(persistedState.tripEndedAt) && persistedState.tripEndedAt > 0
      ? persistedState.tripEndedAt : undefined,
    totals,
    applicationStage,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ACCEPT_CONSENT":
      return { ...state, hasConsented: true };
    case "SELECT_INSURANCE":
      return state.hasConsented && isDemoPolicyId(action.policyId)
        ? { ...state, selectedPolicyId: action.policyId }
        : state;
    case "START_TRIP":
      return hasSelectedDemoPolicy(state) && state.driveStage === "idle" && state.tripsCompleted < 2
        ? { ...state, driveStage: "active", tripStartedAt: Date.now(), tripEndedAt: undefined }
        : state;
    case "FINISH_TRIP":
      return hasSelectedDemoPolicy(state) && state.driveStage === "active" && state.tripsCompleted < 2
        ? { ...state, driveStage: "processing", tripEndedAt: Date.now() }
        : state;
    case "COMPLETE_TRIP": {
      if (!hasSelectedDemoPolicy(state) || state.driveStage !== "processing") {
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
      return hasSelectedDemoPolicy(state) && state.tripsCompleted === 2 && state.totals.isEligible && state.applicationStage === "idle"
        ? { ...state, applicationStage: "pending" }
        : state;
    case "APPROVE_APPLICATION":
      return hasSelectedDemoPolicy(state) && state.tripsCompleted === 2 && state.totals.isEligible && state.applicationStage === "pending"
        ? { ...state, applicationStage: "approved" }
        : state;
    case "RESET_DEMO":
      return initialAppState;
    case "HYDRATE":
      return normalizePersistedAppState(action.persistedState);
    default:
      return state;
  }
}
