import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
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

  it("raises the pill above the bottom edge while keeping the score card compact", async () => {
    const tabView = await render(<BottomTabBar />);
    expect(StyleSheet.flatten(tabView.getByTestId("bottom-tab-safe-area").props.style).paddingBottom).toBe(36);
    await tabView.unmount();
    const homeView = await render(<Home />);
    const card = StyleSheet.flatten(homeView.getByTestId("home-score-card").props.style);
    expect(card.padding).toBe(16);
    expect(card.marginTop).toBe(18);
  });

  it("shows confirmed backend distance without the fixture threshold", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(1), source: "backend",
      selectedPolicyId: "contract-1", backendTarget: { specialContractId: "rider-1", evaluationPeriod: "period-1" },
      totals: { distanceKm: 1.2, score: 91, isEligible: false, expectedDiscountPercent: 0 } },
      dispatch, isHydrated: true } as never);
    const ui = await render(<Home />);
    expect(ui.getByText("확정 누적 1.2 km")).toBeTruthy();
    expect(ui.queryByText(/500 km/)).toBeNull();
  });

  it.each([
    [0, "첫 주행 체험 시작"],
    [1, "두 번째 주행 체험 시작"],
    [2, "할인 신청하기"],
  ] as const)("shows the contextual action after %i completed trips", async (tripsCompleted, actionLabel) => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(tripsCompleted),
      dispatch,
      isHydrated: true,
    });

    const { getByRole, getByText } = await render(<Home />);

    expect(getByText(`${stateForTrips(tripsCompleted).totals.distanceKm} / 500 km`)).toBeTruthy();
    expect(getByText(tripsCompleted === 0 ? "--점" : `${stateForTrips(tripsCompleted).totals.score}점`)).toBeTruthy();
    expect(getByRole("button", { name: actionLabel })).toBeTruthy();
  });

  it("opens the Driving overview before a first simulated drive starts", async () => {
    const { getByRole } = await render(<Home />);

    await fireEvent.press(getByRole("button", { name: "첫 주행 체험 시작" }));

    expect(push).toHaveBeenCalledWith("/drive");
  });

  it.each([
    ["pending", "신청 내역 확인하기", "데모 신청 기록"],
    ["approved", "할인 결과 확인하기", "데모 결과 확인"],
  ] as const)("connects Home to Documents after application is %s", async (applicationStage, action, status) => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2), applicationStage }, dispatch, isHydrated: true });
    const view = await render(<Home />);
    expect(view.getByText(status)).toBeTruthy();
    expect(view.getByText("데모에서는 결과만 표시해요")).toBeTruthy();
    expect(view.queryByText("적용 결정 완료")).toBeNull();
    expect(view.queryByRole("button", { name: "할인 신청하기" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: action }));
    expect(push).toHaveBeenCalledWith("/application");
  });

  it("resumes an active trip from Home instead of starting another", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(0), driveStage: "active" }, dispatch, isHydrated: true });
    const view = await render(<Home />);
    await fireEvent.press(view.getByRole("button", { name: "주행 체험으로 돌아가기" }));
    expect(push).toHaveBeenCalledWith("/drive-session");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("allows checking Documents from Home before eligibility", async () => {
    const view = await render(<Home />);
    await fireEvent.press(view.getByRole("button", { name: "서류에서 할인 신청 상태 확인" }));
    expect(push).toHaveBeenCalledWith("/application");
  });

});
