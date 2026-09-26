import { initialAppState, type AppState } from "./app-state";
import { initialRouteForState, redirectForRoute } from "./route-policy";

function stateWith(overrides: Partial<AppState>): AppState {
  return { ...initialAppState, ...overrides };
}

describe("route policy", () => {
  it("resumes consented users without a policy at insurance selection", () => {
    expect(initialRouteForState(stateWith({ hasConsented: true }))).toBe("/insurance");
  });

  it("redirects direct protected routes to onboarding before consent", () => {
    expect(redirectForRoute("/drive-session", initialAppState)).toBe("/onboarding");
    expect(redirectForRoute("/insurance", initialAppState)).toBe("/onboarding");
  });

  it("redirects direct protected routes to insurance after consent but before policy selection", () => {
    const consentedState = stateWith({ hasConsented: true });

    expect(redirectForRoute("/consent", consentedState)).toBeNull();
    expect(redirectForRoute("/application-review", consentedState)).toBe("/insurance");
    expect(redirectForRoute("/onboarding", consentedState)).toBe("/insurance");
  });

  it("allows only the focused route that matches a persisted drive stage", () => {
    const readyState = stateWith({ hasConsented: true, selectedPolicyId: "policy-safe-driver" });
    const activeState = stateWith({ hasConsented: true, selectedPolicyId: "policy-safe-driver", driveStage: "active" });
    const processingState = stateWith({ hasConsented: true, selectedPolicyId: "policy-safe-driver", driveStage: "processing" });
    const resultState = stateWith({ hasConsented: true, selectedPolicyId: "policy-safe-driver", tripsCompleted: 1, driveStage: "result" });

    expect(initialRouteForState(readyState)).toBe("/(tabs)/home");
    expect(redirectForRoute("/drive-session", readyState)).toBe("/(tabs)/drive");
    expect(redirectForRoute("/drive-processing", readyState)).toBe("/(tabs)/drive");
    expect(redirectForRoute("/drive-result", readyState)).toBe("/(tabs)/home");
    expect(redirectForRoute("/drive-session", activeState)).toBeNull();
    expect(redirectForRoute("/drive-processing", processingState)).toBeNull();
    expect(redirectForRoute("/drive-result", resultState)).toBeNull();
    expect(redirectForRoute("/insurance", readyState)).toBe("/(tabs)/home");
  });
});
