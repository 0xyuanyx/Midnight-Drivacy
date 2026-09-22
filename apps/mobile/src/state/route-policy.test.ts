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

    expect(redirectForRoute("/application-review", consentedState)).toBe("/insurance");
    expect(redirectForRoute("/onboarding", consentedState)).toBe("/insurance");
  });

  it("allows protected routes for a consented user with a valid policy", () => {
    const readyState = stateWith({ hasConsented: true, selectedPolicyId: "policy-safe-driver" });

    expect(initialRouteForState(readyState)).toBe("/(tabs)/home");
    expect(redirectForRoute("/drive-session", readyState)).toBeNull();
    expect(redirectForRoute("/insurance", readyState)).toBe("/(tabs)/home");
  });
});
