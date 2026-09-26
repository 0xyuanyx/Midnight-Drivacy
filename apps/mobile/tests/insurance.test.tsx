import { act, fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import Insurance from "../app/insurance";
import { useAppState } from "@/state/app-provider";
import { initialAppState } from "@/state/app-state";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/state/app-provider", () => ({
  useAppState: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAppState = useAppState as jest.MockedFunction<typeof useAppState>;

describe("Insurance selection", () => {
  const replace = jest.fn();
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
    mockUseAppState.mockReturnValue({
      state: initialAppState,
      dispatch,
      isHydrated: true,
    });
  });

  afterEach(async () => {
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("shows deterministic loading before rendering the three policy cards", async () => {
    const { getByText, queryAllByTestId } = await render(<Insurance />);

    expect(getByText("보험 정보를 불러오는 중")).toBeTruthy();
    expect(queryAllByTestId("policy-card")).toHaveLength(0);

    await act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(queryAllByTestId("policy-card")).toHaveLength(3);
  });

  it("returns to the consent sheet from the insurance back action", async () => {
    const { getByRole } = await render(<Insurance />);
    await fireEvent.press(getByRole("button", { name: "뒤로" }));
    expect(replace).toHaveBeenCalledWith("/consent");
  });

  it("enables the selection action only after one policy is selected", async () => {
    const { getByRole, getAllByTestId } = await render(<Insurance />);

    await act(() => {
      jest.advanceTimersByTime(250);
    });

    const confirmButton = getByRole("button", { name: "이 보험 선택하기" });
    expect(confirmButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getAllByTestId("policy-card")[0]);

    expect(confirmButton.props.accessibilityState?.disabled).toBe(false);
  });

  it("shows the policy status, vehicle, and coverage period used to identify each card", async () => {
    const { getAllByText, getByText } = await render(<Insurance />);

    await act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(getAllByText("정상")).toHaveLength(3);
    expect(getByText("12가 3456")).toBeTruthy();
    expect(getAllByText("2026.01–2026.12")).toHaveLength(3);
  });

  it("dispatches the selected policy and routes home after confirmation", async () => {
    const { getByRole, getAllByTestId } = await render(<Insurance />);

    await act(() => {
      jest.advanceTimersByTime(250);
    });
    await fireEvent.press(getAllByTestId("policy-card")[1]);
    const confirmButton = getByRole("button", { name: "이 보험 선택하기" });
    await fireEvent.press(confirmButton);
    await fireEvent.press(confirmButton);

    expect(dispatch).toHaveBeenCalledWith({
      type: "SELECT_INSURANCE",
      policyId: "policy-family-driver",
    });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("uses authenticated contract, rider and server evaluation period instead of fixture IDs", async () => {
    const contractId = "11111111-1111-4111-8111-111111111111";
    const specialContractId = "22222222-2222-4222-8222-222222222222";
    const backend = {
      api: {
        listInsuranceContracts: async () => [{ id: contractId, ownerUserId: "driver-a", insurerName: "실제 보험사", coverageStartsAt: "2026-01-01T00:00:00Z", coverageEndsAt: "2026-12-31T00:00:00Z", status: "ACTIVE", specialContracts: [
          { id: specialContractId, insuranceContractId: contractId, insurerName: "실제 보험사", name: "안전운전 특약", isEligible: true, status: "ACTIVE" },
        ] }],
        selectSpecialContract: async () => ({ insuranceContractId: contractId, specialContractId }),
        listEvaluationPeriods: async () => [{ id: "server-period", startDate: "2026-07-01", endDate: "2026-09-30" }],
      },
    };
    mockUseAppState.mockReturnValue({ state: initialAppState, dispatch, isHydrated: true, backend } as never);
    const ui = await render(<Insurance />);
    await act(async () => { await Promise.resolve(); });
    expect(ui.getByText("실제 보험사")).toBeTruthy();
    expect(ui.queryByText("미래손해보험")).toBeNull();
    await fireEvent.press(ui.getAllByTestId("policy-card")[0]);
    await fireEvent.press(ui.getByRole("button", { name: "이 보험 선택하기" }));
    await act(async () => { await Promise.resolve(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_BACKEND_INSURANCE", policyId: contractId, specialContractId, evaluationPeriod: "server-period" });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("shows three labeled demo policies when an authenticated user has no owned contract", async () => {
    const selectSpecialContract = jest.fn();
    mockUseAppState.mockReturnValue({
      state: { ...initialAppState, source: "backend", hasConsented: true }, dispatch, isHydrated: true,
      backend: { api: { listInsuranceContracts: async () => [], selectSpecialContract } },
    } as never);
    const ui = await render(<Insurance />);
    await act(async () => { await Promise.resolve(); });

    expect(ui.getAllByTestId("policy-card")).toHaveLength(3);
    expect(ui.getByText("표시된 보험은 데모용 예시이며 실제 가입 계약이 아니에요.")).toBeTruthy();
    await fireEvent.press(ui.getAllByTestId("policy-card")[0]);
    await fireEvent.press(ui.getByRole("button", { name: "이 보험 선택하기" }));

    expect(selectSpecialContract).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_DEMO_INSURANCE", policyId: "policy-safe-driver" });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("does not replace a failed authenticated lookup with demo data", async () => {
    mockUseAppState.mockReturnValue({
      state: { ...initialAppState, source: "backend", hasConsented: true }, dispatch, isHydrated: true,
      backend: { api: { listInsuranceContracts: async () => { throw new Error("offline"); } } },
    } as never);
    const ui = await render(<Insurance />);
    await act(async () => { await Promise.resolve(); });

    expect(ui.queryAllByTestId("policy-card")).toHaveLength(0);
    expect(ui.getByText("보험 정보를 불러오지 못했습니다. 다시 시도해 주세요.")).toBeTruthy();
  });
});
