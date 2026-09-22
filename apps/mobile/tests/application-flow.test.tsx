import { fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import Application from "../app/(tabs)/application";
import ApplicationReview from "../app/application-review";
import ApplicationResult from "../app/application-result";
import ApplicationSubmitted from "../app/application-submitted";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import type { AppState } from "@/state/app-state";

jest.mock("expo-router", () => ({
  usePathname: jest.fn(() => "/application-review"),
  useRouter: jest.fn(),
}));

jest.mock("@/state/app-provider", () => ({
  useAppState: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAppState = useAppState as jest.MockedFunction<typeof useAppState>;

function stateForTrips(
  tripsCompleted: 0 | 1 | 2,
  applicationStage: AppState["applicationStage"] = "idle",
): AppState {
  const totals = [
    { distanceKm: 0, score: 100, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 300, score: 92, isEligible: false, expectedDiscountPercent: 0 },
    { distanceKm: 550, score: 87, isEligible: true, expectedDiscountPercent: 10 },
  ][tripsCompleted];

  return {
    hasConsented: true,
    selectedPolicyId: demoPolicies[0].id,
    tripsCompleted,
    driveStage: "idle",
    totals,
    applicationStage,
  };
}

describe("Discount application flow", () => {
  const dispatch = jest.fn();
  const push = jest.fn();
  const replace = jest.fn();
  const back = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push, replace, back } as unknown as ReturnType<typeof useRouter>);
    mockUseAppState.mockReturnValue({
      state: stateForTrips(1),
      dispatch,
      isHydrated: true,
    });
  });

  it("explains that the application is unavailable before eligibility", async () => {
    const { getByText, queryByRole } = await render(<Application />);

    expect(getByText(/아직 할인 신청 조건을/)).toBeTruthy();
    expect(getByText("누적 550 km 이상, 안전운전 점수 80점 이상이 필요합니다.")).toBeTruthy();
    expect(queryByRole("button", { name: "할인 신청 검토" })).toBeNull();
  });

  it("submits the reviewed result only after the second deterministic trip makes the driver eligible", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2),
      dispatch,
      isHydrated: true,
    });

    const { getByRole } = await render(<Application />);

    await fireEvent.press(getByRole("button", { name: "증명 제출 승인" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "SUBMIT_APPLICATION" });
    expect(push).toHaveBeenCalledWith("/application-submitted");
  });

  it("shows the insurer, rider, evaluation result, and excluded raw driving details in review", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2),
      dispatch,
      isHydrated: true,
    });

    const { getByText, queryByText } = await render(<ApplicationReview />);

    expect(getByText(/미래손해보험/)).toBeTruthy();
    expect(getByText(/안전운전 할인 특약/)).toBeTruthy();
    expect(getByText(/예상 할인 구간 10%/)).toBeTruthy();
    expect(getByText("정확한 위치·경로·구간별 속도·정확한 운행시각은 공유하지 않습니다.")).toBeTruthy();
    expect(queryByText(/GPS|좌표|위도|경도/)).toBeNull();
  });

  it("lets an ineligible direct review route return to the Documents tab", async () => {
    const { getByRole } = await render(<ApplicationReview />);

    await fireEvent.press(getByRole("button", { name: "할인 신청으로 돌아가기" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/application");
  });

  it("can go back from review and submits an eligible application", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2),
      dispatch,
      isHydrated: true,
    });

    const { getByRole } = await render(<ApplicationReview />);

    await fireEvent.press(getByRole("button", { name: "뒤로" }));
    expect(back).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByRole("button", { name: "증명 제출 승인" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SUBMIT_APPLICATION" });
    expect(replace).toHaveBeenCalledWith("/application-submitted");
  });

  it("shows deterministic pending status and offers the demo approval action", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2, "pending"),
      dispatch,
      isHydrated: true,
    });

    const { getByText, getByRole } = await render(<ApplicationSubmitted />);

    expect(getByText("보험사가 결과를 검토하고 있어요.")).toBeTruthy();
    expect(getByText("신청 번호")).toBeTruthy();
    expect(getByText("DR-DEMO-001")).toBeTruthy();
    expect(getByText(/실제 보험사 제출·심사가 아니라/)).toBeTruthy();

    await fireEvent.press(getByRole("button", { name: "데모 결과 반영" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "APPROVE_APPLICATION" });
    expect(replace).toHaveBeenCalledWith("/application-result");
  });

  it("keeps pending applications resumable from the Application tab", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2, "pending"),
      dispatch,
      isHydrated: true,
    });

    const { getByRole } = await render(<Application />);

    await fireEvent.press(getByRole("button", { name: "신청 내역 보기" }));

    expect(push).toHaveBeenCalledWith("/application-submitted");
  });

  it("shows the approved ten percent result and returns to Home", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2, "approved"),
      dispatch,
      isHydrated: true,
    });

    const { getByText, getByRole } = await render(<ApplicationResult />);

    expect(getByText("보험료 할인이 적용되었어요")).toBeTruthy();
    expect(getByText("10%")).toBeTruthy();
    expect(getByText("개인용 자동차보험")).toBeTruthy();
    expect(getByText("안전운전 할인 특약")).toBeTruthy();
    expect(getByText(/실제 보험사 결정·제출/)).toBeTruthy();

    await fireEvent.press(getByRole("button", { name: "홈으로 돌아가기" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
