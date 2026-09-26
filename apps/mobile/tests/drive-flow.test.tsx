import { act, fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import Drive from "../app/(tabs)/drive";
import DriveProcessing from "../app/drive-processing";
import DriveResult from "../app/drive-result";
import DriveSession from "../app/drive-session";
import { useAppState } from "@/state/app-provider";
import type { AppState } from "@/state/app-state";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/state/app-provider", () => ({
  useAppState: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAppState = useAppState as jest.MockedFunction<typeof useAppState>;

function stateForTrips(tripsCompleted: 0 | 1 | 2, driveStage: AppState["driveStage"] = "idle"): AppState {
  const totals = [
    { distanceKm: 0, score: 100, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 300, score: 92, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 550, score: 87, isEligible: true, expectedDiscountPercent: 10 },
  ][tripsCompleted];

  return {
    hasConsented: true,
    selectedPolicyId: "policy-safe-driver",
    tripsCompleted,
    driveStage,
    totals,
    applicationStage: "idle",
  };
}

describe("Driving flow", () => {
  const dispatch = jest.fn();
  const push = jest.fn();
  const replace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push, replace } as unknown as ReturnType<typeof useRouter>);
    mockUseAppState.mockReturnValue({ state: stateForTrips(0), dispatch, isHydrated: true });
  });

  it("starts an authenticated session before entering the drive screen", async () => {
    const state = { ...stateForTrips(0), source: "backend" as const,
      selectedPolicyId: "11111111-1111-4111-8111-111111111111",
      backendTarget: { specialContractId: "22222222-2222-4222-8222-222222222222", evaluationPeriod: "period-1" } };
    const start = jest.fn().mockResolvedValue({ sessionId: "session-1", startedAt: "2026-09-26T00:00:00Z", trip: { id: "trip-1" } });
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true, backend: { workflow: { start } } } as never);
    const ui = await render(<Drive />);
    await fireEvent.press(ui.getByRole("button", { name: "주행 체험 시작" }));
    expect(start).toHaveBeenCalledWith({ insuranceContractId: state.selectedPolicyId, specialContractId: state.backendTarget.specialContractId, evaluationPeriod: "period-1" });
    expect(dispatch).toHaveBeenCalledWith({ type: "START_BACKEND_TRIP", sessionId: "session-1", operationId: "trip-1", startedAt: Date.parse("2026-09-26T00:00:00Z") });
    expect(push).toHaveBeenCalledWith("/drive-session");
  });

  it("waits for a DB-confirmed result instead of completing after a timer", async () => {
    jest.useFakeTimers();
    const state = { ...stateForTrips(0, "processing"), source: "backend" as const,
      selectedPolicyId: "11111111-1111-4111-8111-111111111111",
      backendTarget: { specialContractId: "22222222-2222-4222-8222-222222222222", evaluationPeriod: "period-1" },
      backendSession: { sessionId: "session-1", operationId: "trip-1" } };
    let status = "db-pending";
    const workflow = { endAndProcess: async () => "trip-1", poll: async () => status === "db-pending"
      ? { operationId: "trip-1", status: "db-pending" }
      : { operationId: "trip-1", status: "db-confirmed", summary: { operationId: "trip-1", tripId: "trip-1", tripCount: 1, tripDistanceM: 1200, totalDistanceM: 1200, score: 91, conditionsMet: false, expectedDiscountBps: 0, ruleVersion: 1, stateCommitment: "commitment", transactionId: "tx-1" } } };
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true, backend: { workflow } } as never);
    const ui = await render(<DriveProcessing />);
    await act(async () => { await Promise.resolve(); });
    expect(ui.getByText(/DB에 확정/)).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(700); await Promise.resolve(); });
    expect(dispatch).not.toHaveBeenCalled();
    status = "db-confirmed";
    await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "COMPLETE_BACKEND_TRIP", summary: expect.objectContaining({ score: 91, operationId: "trip-1" }) });
    expect(replace).toHaveBeenCalledWith("/drive-result");
    jest.useRealTimers();
  });

  it("ends the authenticated session before opening processing", async () => {
    const state = { ...stateForTrips(0, "active"), source: "backend" as const,
      selectedPolicyId: "11111111-1111-4111-8111-111111111111",
      backendTarget: { specialContractId: "22222222-2222-4222-8222-222222222222", evaluationPeriod: "period-1" },
      backendSession: { sessionId: "session-1", operationId: "trip-1" }, tripStartedAt: Date.now() - 3000 };
    const endAndProcess = jest.fn().mockResolvedValue("trip-1");
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true, backend: {
      api: { getDrivingSession: async () => ({ sessionId: "session-1", status: "GENERATED", startedAt: new Date(state.tripStartedAt).toISOString(), endedAt: null,
        trip: { id: "trip-1", source: "simulated", collectionEnabled: true, datasetSalt: "private", records: [{ index: 0, durationSeconds: 1, distanceM: 1200, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }] } }) },
      workflow: { endAndProcess },
    } } as never);
    const ui = await render(<DriveSession />);
    await act(async () => { await Promise.resolve(); });
    expect(ui.getByText("1/1 구간")).toBeTruthy();
    await fireEvent.press(ui.getByRole("button", { name: "주행 종료" }));
    expect(endAndProcess).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "FINISH_BACKEND_TRIP", endedAt: expect.any(Number) });
    expect(replace).toHaveBeenCalledWith("/drive-processing");
  });

  it("renders the confirmed backend trip distance and status without fixture claims", async () => {
    const state = { ...stateForTrips(1, "result"), source: "backend" as const,
      selectedPolicyId: "11111111-1111-4111-8111-111111111111",
      backendSummary: { operationId: "trip-1", tripId: "trip-1", tripCount: 1,
        tripDistanceM: 1200, totalDistanceM: 1200, score: 91, conditionsMet: false,
        expectedDiscountBps: 0, ruleVersion: 1, stateCommitment: "commitment", transactionId: "tx-1" },
      totals: { distanceKm: 1.2, score: 91, isEligible: false, expectedDiscountPercent: 0 } };
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true } as never);
    const ui = await render(<DriveResult />);
    expect(ui.getAllByText("1.2 km")).toHaveLength(2);
    expect(ui.getByText("DB 확정 완료")).toBeTruthy();
    expect(ui.queryByText("로컬 계산 완료")).toBeNull();
  });

  it("authorizes a simulated drive before entering the focused session", async () => {
    const { getByRole, rerender, getByText, queryByRole } = await render(<Drive />);

    expect(getByRole("button", { name: "주행 체험 시작" })).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "주행 체험 시작" }));
    await fireEvent.press(getByRole("button", { name: "주행 체험 시작" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "START_TRIP" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/drive-session");
    expect(push).toHaveBeenCalledTimes(1);

    mockUseAppState.mockReturnValue({ state: stateForTrips(2), dispatch, isHydrated: true });
    await rerender(<Drive />);
    expect(queryByRole("button", { name: "주행 체험 시작" })).toBeNull();
    expect(getByText("두 번의 주행 체험을 마쳤습니다.")).toBeTruthy();
  });

  it("keeps the pre-drive score unmeasured rather than calling 100 points achieved", async () => {
    const { getByText, queryByText } = await render(<Drive />);
    expect(getByText("--점")).toBeTruthy();
    expect(getByText("할인 조건 · 점수 확인")).toBeTruthy();
    expect(queryByText("100점")).toBeNull();
    expect(queryByText("내 보험 조회하기")).toBeNull();
    expect(getByText("누적 0 / 500 km · 남은 거리 500 km")).toBeTruthy();
  });

  it("offers an active trip resume action instead of claiming all trips are complete", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    const { getByRole, queryByText } = await render(<Drive />);

    expect(queryByText("두 번의 주행 체험을 마쳤습니다.")).toBeNull();
    await fireEvent.press(getByRole("button", { name: "주행 체험으로 돌아가기" }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/drive-session");
  });

  it("allows the second drive after the first session returns to idle", async () => {
    const { getByRole, rerender } = await render(<Drive />);
    await fireEvent.press(getByRole("button", { name: "주행 체험 시작" }));

    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    await rerender(<Drive />);
    mockUseAppState.mockReturnValue({ state: stateForTrips(1), dispatch, isHydrated: true });
    await rerender(<Drive />);

    await fireEvent.press(getByRole("button", { name: "주행 체험 시작" }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("moves an active simulated drive into persisted processing without changing totals", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    const { getByRole, getByText } = await render(<DriveSession />);

    expect(getByText("주행 체험 중")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "주행 종료" }));
    await fireEvent.press(getByRole("button", { name: "주행 종료" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "FINISH_TRIP" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/drive-processing");
  });

  it("consumes a persisted processing session once before replacing with the result", async () => {
    jest.useFakeTimers();
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "processing"), dispatch, isHydrated: true });
    const { getByText, rerender } = await render(<DriveProcessing />);

    expect(getByText("주행 결과를 계산하고 있어요")).toBeTruthy();
    expect(getByText(/실제 Midnight 증명/)).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();

    await rerender(<DriveProcessing />);
    expect(dispatch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "COMPLETE_TRIP" });
    expect(replace).toHaveBeenCalledWith("/drive-result");
    jest.useRealTimers();
  });

  it("redirects direct processing without dispatching or changing a trip", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0), dispatch, isHydrated: true });
    await render(<DriveProcessing />);

    expect(dispatch).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/(tabs)/drive");
  });

  it("renders an adaptive scroll container around the simulated drive CTA", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    const { getByRole, getByTestId } = await render(<DriveSession />);

    expect(getByTestId("drive-session-scroll").props.keyboardShouldPersistTaps).toBe("handled");
    expect(getByRole("button", { name: "주행 종료" })).toBeTruthy();
  });

  it("shows fixture totals and replaces navigation when returning home", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(1, "result"), dispatch, isHydrated: true });
    const { getAllByText, getByRole, getByText, getByTestId } = await render(<DriveResult />);

    expect(StyleSheet.flatten(getByTestId("drive-result-screen").props.style).paddingBottom).toBeUndefined();
    expect(getAllByText("92점")).toHaveLength(2);
    expect(getAllByText("300 km")).toHaveLength(2);
    expect(getByText("첫 주행 점수")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "홈으로 돌아가기" }));
    await fireEvent.press(getByRole("button", { name: "뒤로" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("dismisses a result when the result header back action returns home", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(1, "result"), dispatch, isHydrated: true });
    const { getByRole } = await render(<DriveResult />);

    await fireEvent.press(getByRole("button", { name: "뒤로" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "DISMISS_TRIP_RESULT" });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("emphasizes the current score after the second trip, keeping change as context", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(2, "result"), dispatch, isHydrated: true });
    const ui = await render(<DriveResult />);
    expect(ui.getAllByText("87점")).toHaveLength(2);
    expect(ui.queryByText("-5점")).toBeNull();
    expect(ui.getByText("92점 → 87점")).toBeTruthy();
  });
});
