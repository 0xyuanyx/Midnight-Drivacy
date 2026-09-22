import { hasSelectedDemoPolicy, type AppState } from "./app-state";

export type AppRoute =
  | "/onboarding"
  | "/insurance"
  | "/(tabs)/home"
  | "/(tabs)/drive"
  | "/drive-session"
  | "/drive-processing"
  | "/drive-result";

export function initialRouteForState(state: AppState): AppRoute {
  if (!state.hasConsented) {
    return "/onboarding";
  }

  if (!hasSelectedDemoPolicy(state)) {
    return "/insurance";
  }

  switch (state.driveStage) {
    case "active":
      return "/drive-session";
    case "processing":
      return "/drive-processing";
    case "result":
      return "/drive-result";
    default:
      return "/(tabs)/home";
  }
}

function routeForDriveStage(state: AppState): AppRoute {
  switch (state.driveStage) {
    case "active":
      return "/drive-session";
    case "processing":
      return "/drive-processing";
    case "result":
      return "/drive-result";
    default:
      return "/(tabs)/drive";
  }
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

  const isFocusedDriveRoute = pathname === "/drive-session" || pathname === "/drive-processing" || pathname === "/drive-result";
  if (isFocusedDriveRoute) {
    const expectedRoute = routeForDriveStage(state);
    return pathname === expectedRoute ? null : expectedRoute;
  }

  return pathname === "/onboarding" || pathname === "/insurance"
    ? "/(tabs)/home"
    : null;
}
