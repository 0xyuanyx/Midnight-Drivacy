import { act, fireEvent, render } from "@testing-library/react-native";
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

  it("returns an authenticated demo user to insurance selection after reset", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "approved"), demoMode: true }, dispatch, isHydrated: true } as never);
    const ui = await render(<ApplicationResult />);
    await fireEvent.press(ui.getByRole("button", { name: "초기화하기" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "RESET_DEMO" });
    expect(replace).toHaveBeenCalledWith("/insurance");
  });

  it("submits authenticated contract IDs and keeps verification pending", async () => {
    const state: AppState = { ...stateForTrips(2), source: "backend",
      selectedPolicyId: "11111111-1111-4111-8111-111111111111",
      backendTarget: { specialContractId: "22222222-2222-4222-8222-222222222222", evaluationPeriod: "period-1" } };
    const application = { id: "app-1", insuranceContractId: state.selectedPolicyId,
      specialContractId: state.backendTarget!.specialContractId, specialContractName: "안전운전 특약",
      score: 87, distanceM: 550000, conditionsMet: true, expectedDiscountBps: 1000,
      appliedDiscountBps: null, submittedAt: "2026-09-26T00:00:00Z", decidedAt: null,
      verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW" };
    const createDiscountApplication = jest.fn().mockResolvedValue(application);
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true, backend: { api: { createDiscountApplication } } } as never);
    const ui = await render(<ApplicationReview />);
    await fireEvent.press(ui.getByRole("button", { name: "할인 신청 제출" }));
    expect(createDiscountApplication).toHaveBeenCalledWith(state.selectedPolicyId, state.backendTarget!.specialContractId);
    expect(dispatch).toHaveBeenCalledWith({ type: "SYNC_BACKEND_APPLICATION", application: expect.objectContaining({ stage: "pending-verification", reviewStatus: "PENDING_REVIEW" }) });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SUBMIT_APPLICATION" });
  });

  it("keeps a verified backend application pending until the insurer applies it", async () => {
    const application = { id: "app-1", insuranceContractId: "contract-1", specialContractId: "rider-1",
      specialContractName: "안전운전 특약", score: 91, distanceM: 1200, conditionsMet: true,
      expectedDiscountBps: 1000, appliedDiscountBps: null, submittedAt: "2026-09-26T00:00:00Z",
      decidedAt: null, verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW", stage: "pending-verification" };
    const state: AppState = { ...stateForTrips(2, "pending"), source: "backend", selectedPolicyId: "contract-1",
      backendTarget: { specialContractId: "rider-1", evaluationPeriod: "period-1" }, backendApplication: application as AppState["backendApplication"] };
    const getDiscountApplication = jest.fn().mockResolvedValueOnce({ ...application, verificationStatus: "VERIFIED" })
      .mockResolvedValueOnce({ ...application, verificationStatus: "VERIFIED", reviewStatus: "APPLIED", appliedDiscountBps: 800, decidedAt: "2026-09-26T01:00:00Z" });
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true, backend: { api: { getDiscountApplication } } } as never);
    const ui = await render(<ApplicationSubmitted />);
    await act(async () => { await Promise.resolve(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "SYNC_BACKEND_APPLICATION", application: expect.objectContaining({ stage: "pending-insurer" }) });
    expect(replace).not.toHaveBeenCalledWith("/application-result");
    await fireEvent.press(ui.getByRole("button", { name: "처리 상태 새로고침" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SYNC_BACKEND_APPLICATION", application: expect.objectContaining({ stage: "applied", appliedDiscountBps: 800 }) });
    expect(replace).toHaveBeenCalledWith("/application-result");
  });

  it("shows the insurer's applied rate rather than the expected discount and cannot reset real state", async () => {
    const state: AppState = { ...stateForTrips(2, "approved"), source: "backend",
      selectedPolicyId: "contract-1", backendTarget: { specialContractId: "rider-1", evaluationPeriod: "period-1" },
      backendApplication: { id: "app-1", insuranceContractId: "contract-1", specialContractId: "rider-1",
        specialContractName: "안전운전 특약", score: 91, distanceM: 1200, conditionsMet: true,
        expectedDiscountBps: 1000, appliedDiscountBps: 800, submittedAt: "2026-09-26T00:00:00Z",
        decidedAt: "2026-09-26T01:00:00Z", verificationStatus: "VERIFIED", reviewStatus: "APPLIED", stage: "applied" } };
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true } as never);
    const ui = await render(<ApplicationResult />);
    expect(ui.getByText("8%")).toBeTruthy();
    expect(ui.queryByText("10%")).toBeNull();
    expect(ui.queryByRole("button", { name: "초기화하기" })).toBeNull();
  });

  it("does not show fixture 500 km thresholds for an authenticated ineligible driver", async () => {
    const state: AppState = { ...stateForTrips(1), source: "backend", selectedPolicyId: "contract-1",
      backendTarget: { specialContractId: "rider-1", evaluationPeriod: "period-1" },
      totals: { distanceKm: 1.2, score: 91, isEligible: false, expectedDiscountPercent: 0 } };
    mockUseAppState.mockReturnValue({ state, dispatch, isHydrated: true } as never);
    const ui = await render(<Application />);
    expect(ui.queryByText(/500 km/)).toBeNull();
    expect(ui.getByText(/서버 확정 누적/)).toBeTruthy();
  });

  it("shows a readiness summary before the single disclosure review", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(2), dispatch, isHydrated: true });
    const ui = await render(<Application />);
    expect(ui.getByText("할인 신청을 준비했어요")).toBeTruthy();
    expect(ui.queryByText("제공되는 결과")).toBeNull();
    await fireEvent.press(ui.getByRole("button", { name: "신청 내용 검토" }));
    expect(push).toHaveBeenCalledWith("/application-review");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("identifies a locally simulated application before the user submits it", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2), demoMode: true }, dispatch, isHydrated: true });
    const ui = await render(<ApplicationReview />);
    expect(ui.getByText(/실제 보험사에 제출되지 않습니다/)).toBeTruthy();
    expect(ui.getByRole("button", { name: "데모 신청 진행" })).toBeTruthy();
  });

  it("does not present a local result as an insurer decision", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "approved"), demoMode: true }, dispatch, isHydrated: true });
    const ui = await render(<ApplicationResult />);
    expect(ui.getByText(/데모 결과/)).toBeTruthy();
    expect(ui.getByText("데모 확인 시각")).toBeTruthy();
    expect(ui.queryByText("보험사에는 필요한 정보만 보냈어요")).toBeNull();
    expect(ui.queryByText("할인 적용 결정이 완료되었어요")).toBeNull();
  });

  it("renders recorded local times and never invents dates for legacy applications", async () => {
    const date = new Date(2026, 8, 25, 10, 15).getTime();
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "pending"), applicationSubmittedAt: date }, dispatch, isHydrated: true });
    const ui = await render(<ApplicationSubmitted />);
    expect(ui.getByText("2026.09.25 10:15")).toBeTruthy();
    await ui.unmount();
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "approved"), applicationDecidedAt: date }, dispatch, isHydrated: true });
    const result = await render(<ApplicationResult />);
    expect(result.getByText("2026.09.25 10:15")).toBeTruthy();
    mockUseAppState.mockReturnValue({ state: stateForTrips(2, "approved"), dispatch, isHydrated: true });
    await result.rerender(<ApplicationResult />);
    expect(result.getByText("기록 없음")).toBeTruthy();
    expect(result.queryByText("확인 중")).toBeNull();
  });

  it("explains that the application is unavailable before eligibility", async () => {
    const { getByText, queryByRole } = await render(<Application />);

    expect(getByText(/아직 할인 신청 조건을/)).toBeTruthy();
    expect(getByText("누적 500 km 이상, 안전운전 점수 80점 이상이 필요합니다.")).toBeTruthy();
    expect(queryByRole("button", { name: "할인 신청 검토" })).toBeNull();
  });

  it("submits the reviewed result only after the second deterministic trip makes the driver eligible", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2),
      dispatch,
      isHydrated: true,
    });

    const { getByRole } = await render(<Application />);

    await fireEvent.press(getByRole("button", { name: "신청 내용 검토" }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/application-review");
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
    expect(replace).toHaveBeenCalledWith("/(tabs)/application");

    const submitButton = getByRole("button", { name: "데모 신청 진행" });
    await fireEvent.press(submitButton);
    await fireEvent.press(submitButton);
    expect(dispatch).toHaveBeenCalledWith({ type: "SUBMIT_APPLICATION" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/application-submitted");
  });

  it("shows deterministic pending status and offers the demo approval action", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2, "pending"),
      dispatch,
      isHydrated: true,
    });

    const { getByText, getByRole } = await render(<ApplicationSubmitted />);

    expect(getByText("데모 신청을 기록했어요.")).toBeTruthy();
    expect(getByText("데모 기록 시각")).toBeTruthy();
    expect(getByText("신청 번호")).toBeTruthy();
    expect(getByText("DR-DEMO-001")).toBeTruthy();
    expect(getByText(/증명·체인 검증 정보는 아직 연결되지 않았습니다./)).toBeTruthy();

    await fireEvent.press(getByRole("button", { name: "데모 결과 확인" }));

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

  it("keeps the local application tab explicitly in demo mode", async () => {
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "pending"), demoMode: true }, dispatch, isHydrated: true });
    const pending = await render(<Application />);
    expect(pending.getByText("데모 신청을 기록했어요.")).toBeTruthy();
    await pending.unmount();
    mockUseAppState.mockReturnValue({ state: { ...stateForTrips(2, "approved"), demoMode: true }, dispatch, isHydrated: true });
    const result = await render(<Application />);
    expect(result.getByText("데모 결과를 확인했어요")).toBeTruthy();
    expect(result.queryByText("할인 적용 결정이 완료되었어요")).toBeNull();
  });

  it("resets the demo from the result detail and returns to onboarding", async () => {
    mockUseAppState.mockReturnValue({ state: stateForTrips(2, "approved"), dispatch, isHydrated: true });
    const { getByRole } = await render(<ApplicationResult />);
    await fireEvent.press(getByRole("button", { name: "초기화하기" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "RESET_DEMO" });
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });

  it("shows the approved ten percent result and returns to Home", async () => {
    mockUseAppState.mockReturnValue({
      state: stateForTrips(2, "approved"),
      dispatch,
      isHydrated: true,
    });

    const { getByText, getByRole } = await render(<ApplicationResult />);

    expect(getByText("데모 결과를 확인했어요")).toBeTruthy();
    expect(getByText("10%")).toBeTruthy();
    expect(getByText("개인용 자동차보험")).toBeTruthy();
    expect(getByText("안전운전 할인 특약")).toBeTruthy();
    expect(getByText(/실제 보험사 제출·계약 반영·증명 검증은 수행되지 않았습니다./)).toBeTruthy();

    await fireEvent.press(getByRole("button", { name: "홈으로 돌아가기" }));

    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
