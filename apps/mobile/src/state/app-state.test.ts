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
  it("keeps backend mode when hydrating a consented account without a selected contract", () => {
    const beforeConsent = normalizePersistedAppState({ hasConsented: false, setupPreviewCompleted: true }, "backend");
    expect(beforeConsent).toMatchObject({ source: "backend", hasConsented: false, setupPreviewCompleted: true });

    const restored = normalizePersistedAppState({
      source: "backend", hasConsented: true, selectedPolicyId: null,
    }, "backend");
    expect(restored).toMatchObject({ source: "backend", hasConsented: true, selectedPolicyId: null });

    const selected = appReducer(restored, { type: "SELECT_DEMO_INSURANCE", policyId: "policy-safe-driver" });
    expect(selected).toMatchObject({ demoMode: true, selectedPolicyId: "policy-safe-driver" });
  });

  it("isolates an authenticated user's selected demo policy from backend operations across hydration", () => {
    const connected = { ...initialAppState, source: "backend" as const, hasConsented: true };
    const selected = appReducer(connected, { type: "SELECT_DEMO_INSURANCE", policyId: "policy-safe-driver" } as never);
    expect(selected).toMatchObject({ demoMode: true, hasConsented: true, selectedPolicyId: "policy-safe-driver" });
    expect(selected.source).toBeUndefined();
    expect(appReducer(selected, { type: "START_TRIP" }).driveStage).toBe("active");
    expect(normalizePersistedAppState(selected, "backend")).toMatchObject({ demoMode: true, selectedPolicyId: "policy-safe-driver" });
    const reset = appReducer(selected, { type: "RESET_DEMO" });
    expect(reset).toMatchObject({ source: "backend", hasConsented: true, selectedPolicyId: null });
    expect(reset.demoMode).toBeUndefined();
    expect(appReducer(connected, { type: "SELECT_INSURANCE", policyId: "policy-safe-driver" })).toBe(connected);
    expect(appReducer(connected, { type: "SELECT_DEMO_INSURANCE", policyId: "unknown" } as never)).toBe(connected);
  });

  it("does not equate verification with insurer approval", () => {
    const selected = appReducer(appReducer(initialAppState, { type: "ACCEPT_CONSENT" }), {
      type: "SELECT_BACKEND_INSURANCE", policyId: "contract-1", specialContractId: "rider-1", evaluationPeriod: "period-1",
    });
    const application = { id: "app-1", insuranceContractId: "contract-1", specialContractId: "rider-1", specialContractName: "안전운전 특약",
      score: 91, distanceM: 1200, conditionsMet: true, expectedDiscountBps: 1000, appliedDiscountBps: null,
      submittedAt: "2026-09-26T00:00:00Z", decidedAt: null, verificationStatus: "VERIFIED" as const,
      reviewStatus: "PENDING_REVIEW" as const, stage: "pending-insurer" as const };
    const verified = appReducer(selected, { type: "SYNC_BACKEND_APPLICATION", application });
    expect(verified.applicationStage).toBe("pending");
    const applied = appReducer(verified, { type: "SYNC_BACKEND_APPLICATION", application: {
      ...application, reviewStatus: "APPLIED", appliedDiscountBps: 800,
      decidedAt: "2026-09-26T01:00:00Z", stage: "applied",
    } });
    expect(applied.applicationStage).toBe("approved");
    expect(applied.backendApplication?.appliedDiscountBps).toBe(800);
    expect(appReducer(verified, { type: "SYNC_BACKEND_APPLICATION", application: { ...application, insuranceContractId: "foreign" } })).toBe(verified);
  });

  it("rechecks persisted backend result IDs instead of trusting cached score or approval", () => {
    const stored = {
      ...initialAppState, source: "backend", hasConsented: true, selectedPolicyId: "contract-1",
      backendTarget: { specialContractId: "rider-1", evaluationPeriod: "period-1" },
      backendSession: { sessionId: "session-1", operationId: "trip-1" }, driveStage: "result",
      tripsCompleted: 2, totals: { distanceKm: 550, score: 100, isEligible: true, expectedDiscountPercent: 12 },
      backendSummary: { operationId: "trip-1", tripId: "trip-1", score: 100 },
      applicationStage: "approved",
    };
    const hydrated = normalizePersistedAppState(stored, "backend");
    expect(hydrated.driveStage).toBe("processing");
    expect(hydrated.totals.distanceKm).toBe(0);
    expect(hydrated.applicationStage).toBe("idle");
    expect(hydrated.backendSummary).toBeUndefined();
  });

  it("uses only a DB-confirmed backend summary for the trip result", () => {
    const selected = appReducer(appReducer(initialAppState, { type: "ACCEPT_CONSENT" }), {
      type: "SELECT_BACKEND_INSURANCE", policyId: "11111111-1111-4111-8111-111111111111",
      specialContractId: "22222222-2222-4222-8222-222222222222", evaluationPeriod: "period-1",
    });
    const active = appReducer(selected, { type: "START_BACKEND_TRIP", sessionId: "session-1", operationId: "trip-1", startedAt: 1000 });
    const processing = appReducer(active, { type: "FINISH_BACKEND_TRIP", endedAt: 3000 });
    expect(processing.totals.distanceKm).toBe(0);
    const result = appReducer(processing, { type: "COMPLETE_BACKEND_TRIP", summary: {
      operationId: "trip-1", tripId: "trip-1", tripCount: 1, tripDistanceM: 1200, totalDistanceM: 1200,
      score: 91, conditionsMet: false, expectedDiscountBps: 0, ruleVersion: 1,
      stateCommitment: "commitment", transactionId: "tx-1",
    } });
    expect(result).toMatchObject({ driveStage: "result", tripsCompleted: 1, totals: { distanceKm: 1.2, score: 91, isEligible: false } });
    expect(appReducer(result, { type: "COMPLETE_BACKEND_TRIP", summary: {
      operationId: "trip-1", tripId: "trip-1", tripCount: 1, tripDistanceM: 1200, totalDistanceM: 1200,
      score: 99, conditionsMet: true, expectedDiscountBps: 1000, ruleVersion: 1,
      stateCommitment: "different", transactionId: "tx-2",
    } })).toBe(result);
  });

  it("retains submission and decision times across retries and hydration, clearing them on reset", () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1800000000000);
    try {
      const ready = completeTrip(completeTrip());
      const pending = appReducer(ready, { type: "SUBMIT_APPLICATION" });
      expect(pending.applicationSubmittedAt).toBe(1800000000000);
      clock.mockReturnValue(1800000060000);
      expect(appReducer(pending, { type: "SUBMIT_APPLICATION" })).toBe(pending);
      const approved = appReducer(pending, { type: "APPROVE_APPLICATION" });
      expect(approved.applicationDecidedAt).toBe(1800000060000);
      const restored = normalizePersistedAppState(approved);
      expect(restored.applicationSubmittedAt).toBe(1800000000000);
      expect(restored.applicationDecidedAt).toBe(1800000060000);
      const reset = appReducer(restored, { type: "RESET_APPLICATION" });
      expect(reset.applicationSubmittedAt).toBeUndefined();
      expect(reset.applicationDecidedAt).toBeUndefined();
      expect(normalizePersistedAppState(approved, "linked").applicationDecidedAt).toBeUndefined();
    } finally { clock.mockRestore(); }
  });
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
