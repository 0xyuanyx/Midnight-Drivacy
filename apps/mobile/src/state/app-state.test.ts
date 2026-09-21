import {
  appReducer,
  initialAppState,
  normalizePersistedAppState,
} from "./app-state";

describe("appReducer", () => {
  it("starts the deterministic demo at zero kilometres and 100 points", () => {
    expect(initialAppState).toEqual({
      hasConsented: false,
      selectedPolicyId: null,
      tripsCompleted: 0,
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
    const state = appReducer(initialAppState, { type: "COMPLETE_TRIP" });

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
    const afterFirstTrip = appReducer(initialAppState, { type: "COMPLETE_TRIP" });
    const state = appReducer(afterFirstTrip, { type: "COMPLETE_TRIP" });

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
    const completeState = appReducer(
      appReducer(initialAppState, { type: "COMPLETE_TRIP" }),
      { type: "COMPLETE_TRIP" },
    );

    expect(appReducer(completeState, { type: "COMPLETE_TRIP" })).toBe(completeState);
  });

  it("rejects an application submission before the second trip makes it eligible", () => {
    const afterFirstTrip = appReducer(initialAppState, { type: "COMPLETE_TRIP" });

    expect(appReducer(afterFirstTrip, { type: "SUBMIT_APPLICATION" })).toBe(afterFirstTrip);
  });

  it("moves an eligible application into the pending stage", () => {
    const eligibleState = appReducer(
      appReducer(initialAppState, { type: "COMPLETE_TRIP" }),
      { type: "COMPLETE_TRIP" },
    );

    expect(appReducer(eligibleState, { type: "SUBMIT_APPLICATION" }).applicationStage).toBe(
      "pending",
    );
  });

  it("allows demo approval only from the pending application stage", () => {
    const eligibleState = appReducer(
      appReducer(initialAppState, { type: "COMPLETE_TRIP" }),
      { type: "COMPLETE_TRIP" },
    );
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
      totals: {
        distanceKm: 550,
        score: 87,
        isEligible: true,
        expectedDiscountPercent: 10,
      },
      applicationStage: "pending",
    });
  });
});
