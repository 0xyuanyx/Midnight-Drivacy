import { act, fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

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

  it("authorizes a simulated drive before entering the focused session", async () => {
    const { getByRole, rerender, getByText, queryByRole } = await render(<Drive />);

    expect(getByRole("button", { name: "주행 체험 시작" })).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "주행 체험 시작" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "START_TRIP" });
    expect(push).toHaveBeenCalledWith("/drive-session");

    mockUseAppState.mockReturnValue({ state: stateForTrips(2), dispatch, isHydrated: true });
    await rerender(<Drive />);
    expect(queryByRole("button", { name: "주행 체험 시작" })).toBeNull();
    expect(getByText("두 번의 주행 체험을 마쳤습니다.")).toBeTruthy();
  });

  it("offers an active trip resume action instead of claiming all trips are complete", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    const { getByRole, queryByText } = await render(<Drive />);

    expect(queryByText("두 번의 주행 체험을 마쳤습니다.")).toBeNull();
    await fireEvent.press(getByRole("button", { name: "주행 체험으로 돌아가기" }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/drive-session");
  });

  it("moves an active simulated drive into persisted processing without changing totals", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(0, "active"), dispatch, isHydrated: true });
    const { getByRole, getByText } = await render(<DriveSession />);

    expect(getByText("주행 체험 중")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "주행 종료" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "FINISH_TRIP" });
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
    const { getAllByText, getByRole, getByText } = await render(<DriveResult />);

    expect(getByText("-8점")).toBeTruthy();
    expect(getAllByText("300 km")).toHaveLength(2);
    expect(getByText("92점")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "홈으로 돌아가기" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("dismisses a result when the result header back action returns home", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(1, "result"), dispatch, isHydrated: true });
    const { getByRole } = await render(<DriveResult />);

    await fireEvent.press(getByRole("button", { name: "뒤로" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "DISMISS_TRIP_RESULT" });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
