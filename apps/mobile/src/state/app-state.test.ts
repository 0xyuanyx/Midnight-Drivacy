import {
  appReducer,
  initialAppState,
  normalizePersistedAppState,
} from "./app-state";

function readyState() {
  return appReducer(
    appReducer(initialAppState, { type: "ACCEPT_CONSENT" }),
    { type: "SELECT_INSURANCE", policyId: "policy-safe-driver" },
  );
}

function completeTrip(state = readyState()) {
  const readyForNextTrip = state.driveStage === "result"
    ? appReducer(state, { type: "DISMISS_TRIP_RESULT" } as never)
    : state;
  const activeState = appReducer(readyForNextTrip, { type: "START_TRIP" } as never);
  const processingState = appReducer(activeState, { type: "FINISH_TRIP" } as never);
  return appReducer(processingState, { type: "COMPLETE_TRIP" });
}

describe("appReducer", () => {
  it("starts the deterministic demo at zero kilometres and 100 points", () => {
    expect(initialAppState).toEqual({
      hasConsented: false,
      selectedPolicyId: null,
      tripsCompleted: 0,
      driveStage: "idle",
      totals: {
        distanceKm: 0,
        score: 100,
        isEligible: false,
        expectedDiscountPercent: 0,
      },
      applicationStage: "idle",
    });
  });

  it("uses the first trip fixture totals without unlocking the application", () => {
    const state = completeTrip();

    expect(state).toMatchObject({
      tripsCompleted: 1,
      totals: {
        distanceKm: 300,
        score: 92,
        isEligible: false,
        expectedDiscountPercent: 0,
      },
    });
  });

  it("uses the second trip fixture totals and unlocks the ten percent application", () => {
    const afterFirstTrip = completeTrip();
    const state = completeTrip(afterFirstTrip);

    expect(state).toMatchObject({
      tripsCompleted: 2,
      totals: {
        distanceKm: 550,
        score: 87,
        isEligible: true,
        expectedDiscountPercent: 10,
      },
    });
  });

  it("leaves the finished demo unchanged when a third trip is completed", () => {
    const completeState = completeTrip(completeTrip());

    expect(appReducer(completeState, { type: "COMPLETE_TRIP" })).toBe(completeState);
  });

  it("rejects an application submission before the second trip makes it eligible", () => {
    const afterFirstTrip = completeTrip();

    expect(appReducer(afterFirstTrip, { type: "SUBMIT_APPLICATION" })).toBe(afterFirstTrip);
  });

  it("does not reuse a local-only approval as a linked insurer decision", () => {
    const ready = completeTrip(completeTrip());
    const local = appReducer(appReducer(ready, { type: "SUBMIT_APPLICATION" }), { type: "APPROVE_APPLICATION" });
    expect(normalizePersistedAppState(local, "linked").applicationStage).toBe("idle");
    const linked = appReducer(ready, { type: "SUBMIT_APPLICATION", mode: "linked" });
    expect(normalizePersistedAppState(linked, "linked").applicationStage).toBe("pending");
  });

  it("moves an eligible application into the pending stage", () => {
    const eligibleState = completeTrip(completeTrip());

    expect(appReducer(eligibleState, { type: "SUBMIT_APPLICATION" }).applicationStage).toBe(
      "pending",
    );
  });

  it("allows demo approval only from the pending application stage", () => {
    const eligibleState = completeTrip(completeTrip());
    const pendingState = appReducer(eligibleState, { type: "SUBMIT_APPLICATION" });

    expect(appReducer(pendingState, { type: "APPROVE_APPLICATION" }).applicationStage).toBe(
      "approved",
    );
    expect(appReducer(eligibleState, { type: "APPROVE_APPLICATION" })).toBe(eligibleState);
  });

  it("resets the demo back to the original state", () => {
    const changedState = appReducer(initialAppState, { type: "ACCEPT_CONSENT" });

    expect(appReducer(changedState, { type: "RESET_DEMO" })).toEqual(initialAppState);
  });

  it("hydrates only recognized persisted fields and derives its totals from completed trips", () => {
    expect(
      normalizePersistedAppState({
        hasConsented: true,
        selectedPolicyId: "policy-safe-driver",
        tripsCompleted: 2,
        applicationStage: "pending",
        totals: { distanceKm: 4, score: 2 },
        ignored: "not state",
      }),
    ).toEqual({
      hasConsented: true,
      selectedPolicyId: "policy-safe-driver",
      tripsCompleted: 2,
      driveStage: "idle",
      totals: {
        distanceKm: 550,
        score: 87,
        isEligible: true,
        expectedDiscountPercent: 10,
      },
      applicationStage: "pending",
      applicationMode: "local",
      tripStartedAt: undefined,
      tripEndedAt: undefined,
    });
  });

  it("drops an unknown persisted policy and every policy-scoped field", () => {
    expect(
      normalizePersistedAppState({
        hasConsented: true,
        selectedPolicyId: "policy-tampered",
        tripsCompleted: 2,
        applicationStage: "approved",
      }),
    ).toEqual({ ...initialAppState, hasConsented: true });
  });

  it("drops persisted policy, trip, and application state when consent is absent", () => {
    expect(
      normalizePersistedAppState({
        hasConsented: false,
        selectedPolicyId: "policy-safe-driver",
        tripsCompleted: 2,
        applicationStage: "pending",
      }),
    ).toEqual(initialAppState);
  });

  it("does not select an unknown policy or start a trip before a valid policy is selected", () => {
    const consentedState = appReducer(initialAppState, { type: "ACCEPT_CONSENT" });

    expect(appReducer(consentedState, { type: "SELECT_INSURANCE", policyId: "policy-tampered" })).toBe(
      consentedState,
    );
    expect(appReducer(consentedState, { type: "START_TRIP" } as never)).toBe(consentedState);
  });

  it("does not approve a pending application unless the policy-scoped state is eligible", () => {
    const invalidPendingState = {
      ...initialAppState,
      hasConsented: true,
      selectedPolicyId: "policy-safe-driver",
      applicationStage: "pending" as const,
    };

    expect(appReducer(invalidPendingState, { type: "APPROVE_APPLICATION" })).toBe(invalidPendingState);
  });

  it("consumes a valid processing session once and rejects direct completion", () => {
    const ready = readyState();
    const active = appReducer(ready, { type: "START_TRIP" } as never);
    const processing = appReducer(active, { type: "FINISH_TRIP" } as never);
    const result = appReducer(processing, { type: "COMPLETE_TRIP" });

    expect(appReducer(ready, { type: "COMPLETE_TRIP" })).toBe(ready);
    expect(active.driveStage).toBe("active");
    expect(processing.driveStage).toBe("processing");
    expect(result).toMatchObject({ tripsCompleted: 1, driveStage: "result" });
    expect(appReducer(result, { type: "COMPLETE_TRIP" })).toBe(result);
  });
});
