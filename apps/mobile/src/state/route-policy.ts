import { hasSelectedDemoPolicy, type AppState } from "./app-state";

export type AppRoute = "/onboarding" | "/insurance" | "/(tabs)/home";

export function initialRouteForState(state: AppState): AppRoute {
  if (!state.hasConsented) {
    return "/onboarding";
  }

  return hasSelectedDemoPolicy(state) ? "/(tabs)/home" : "/insurance";
}

/**
 * Returns the route that a hydrated user must visit, or null when their
 * requested route is allowed. Setup routes deliberately redirect forward to
 * keep resumed users from replaying onboarding and to avoid redirect loops.
 */
export function redirectForRoute(pathname: string, state: AppState): AppRoute | null {
  const initialRoute = initialRouteForState(state);

  if (pathname === "/") {
    return initialRoute;
  }

  if (!state.hasConsented) {
    return pathname === "/onboarding" ? null : "/onboarding";
  }

  if (!hasSelectedDemoPolicy(state)) {
    return pathname === "/insurance" ? null : "/insurance";
  }

  return pathname === "/onboarding" || pathname === "/insurance"
    ? "/(tabs)/home"
    : null;
}
