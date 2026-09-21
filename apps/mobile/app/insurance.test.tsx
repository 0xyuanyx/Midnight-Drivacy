import { act, fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import Insurance from "./insurance";
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

  afterEach(() => {
    jest.runOnlyPendingTimers();
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

  it("dispatches the selected policy and routes home after confirmation", async () => {
    const { getByRole, getAllByTestId } = await render(<Insurance />);

    await act(() => {
      jest.advanceTimersByTime(250);
    });
    await fireEvent.press(getAllByTestId("policy-card")[1]);
    await fireEvent.press(getByRole("button", { name: "이 보험 선택하기" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SELECT_INSURANCE",
      policyId: "policy-family-driver",
    });
    expect(replace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
