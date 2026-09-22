import { fireEvent, render } from "@testing-library/react-native";
import { usePathname, useRouter } from "expo-router";

import Home from "../app/(tabs)/home";
import { BottomTabBar } from "@/components/BottomTabBar";
import { useAppState } from "@/state/app-provider";
import type { AppState } from "@/state/app-state";

jest.mock("expo-router", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock("@/state/app-provider", () => ({
  useAppState: jest.fn(),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
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
    driveStage: "idle",
    totals,
    applicationStage: "idle",
  };
}

describe("Home and bottom tabs", () => {
  const dispatch = jest.fn();
  const push = jest.fn();
  const replace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue("/home");
    mockUseRouter.mockReturnValue({ push, replace } as unknown as ReturnType<typeof useRouter>);
    mockUseAppState.mockReturnValue({ state: stateForTrips(0), dispatch, isHydrated: true });
  });

  it("keeps one matching tab selected while showing all three destinations", async () => {
    const { getByTestId, getByText } = await render(<BottomTabBar />);

    expect(getByText("홈")).toBeTruthy();
    expect(getByText("주행")).toBeTruthy();
    expect(getByText("서류")).toBeTruthy();
    expect(getByTestId("bottom-tab-home").props.accessibilityState?.selected).toBe(true);
    expect(getByTestId("bottom-tab-drive").props.accessibilityState?.selected).toBe(false);
    expect(getByTestId("bottom-tab-application").props.accessibilityState?.selected).toBe(false);
  });

  it("opens the application flow from the Documents pill tab", async () => {
    const { getByRole } = await render(<BottomTabBar />);

    await fireEvent.press(getByRole("tab", { name: "서류" }));

    expect(replace).toHaveBeenCalledWith("/application");
  });

  it.each([
    [0, "첫 모의 주행 시작"],
    [1, "두 번째 모의 주행 시작"],
    [2, "할인 신청하기"],
  ] as const)("shows the contextual action after %i completed trips", async (tripsCompleted, actionLabel) => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(tripsCompleted),
      dispatch,
      isHydrated: true,
    });

    const { getByRole, getByText } = await render(<Home />);

    expect(getByText(`${stateForTrips(tripsCompleted).totals.distanceKm} km`)).toBeTruthy();
    expect(getByText(`${stateForTrips(tripsCompleted).totals.score}점`)).toBeTruthy();
    expect(getByRole("button", { name: actionLabel })).toBeTruthy();
  });

  it("opens the Driving overview before a first simulated drive starts", async () => {
    const { getByRole } = await render(<Home />);

    await fireEvent.press(getByRole("button", { name: "첫 모의 주행 시작" }));

    expect(push).toHaveBeenCalledWith("/drive");
  });

});
