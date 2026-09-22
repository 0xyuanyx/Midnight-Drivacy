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

function stateForTrips(tripsCompleted: 0 | 1 | 2): AppState {
  const totals = [
    { distanceKm: 0, score: 100, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 300, score: 92, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 550, score: 87, isEligible: true, expectedDiscountPercent: 10 },
  ][tripsCompleted];

  return {
    hasConsented: true,
    selectedPolicyId: "policy-safe-driver",
    tripsCompleted,
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

  it("offers a simulated drive until both deterministic trips are complete", async () => {
    const { getByRole, rerender, getByText, queryByRole } = await render(<Drive />);

    expect(getByRole("button", { name: "모의 주행 시작" })).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "모의 주행 시작" }));
    expect(push).toHaveBeenCalledWith("/drive-session");

    mockUseAppState.mockReturnValue({ state: stateForTrips(2), dispatch, isHydrated: true });
    await rerender(<Drive />);
    expect(queryByRole("button", { name: "모의 주행 시작" })).toBeNull();
    expect(getByText("두 번의 데모 주행이 완료되었습니다.")).toBeTruthy();
  });

  it("moves a finished simulated drive into processing without changing totals", async () => {
    const { getByRole, getByText } = await render(<DriveSession />);

    expect(getByText("모의 주행 진행 중")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "주행 종료" }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/drive-processing");
  });

  it("processes the local demo exactly once before replacing with the result", async () => {
    jest.useFakeTimers();
    const { getByText, rerender } = await render(<DriveProcessing />);

    expect(getByText("데모 계산을 준비하고 있어요")).toBeTruthy();
    expect(getByText(/실제 Midnight 증명/)).toBeTruthy();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "COMPLETE_TRIP" });

    await rerender(<DriveProcessing />);
    expect(dispatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(replace).toHaveBeenCalledWith("/drive-result");
    jest.useRealTimers();
  });

  it("shows fixture totals and replaces navigation when returning home", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(1), dispatch, isHydrated: true });
    const { getByRole, getByText } = await render(<DriveResult />);

    expect(getByText("+300 km")).toBeTruthy();
    expect(getByText("300 km")).toBeTruthy();
    expect(getByText("92점")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "홈으로 돌아가기" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
