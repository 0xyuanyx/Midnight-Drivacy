import { fireEvent, render } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import Onboarding from "../app/onboarding";
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

describe("Onboarding", () => {
  const replace = jest.fn();
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
    mockUseAppState.mockReturnValue({
      state: initialAppState,
      dispatch,
      isHydrated: true,
    });
  });

  it("opens the consent sheet from the start action", async () => {
    const { getByRole, getByText, queryByText } = await render(<Onboarding />);

    expect(queryByText("필수 동의")).toBeNull();
    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));

    expect(getByText("필수 동의")).toBeTruthy();
    expect(getByRole("button", { name: "동의하고 계속하기" }).props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it("explains what is processed, what is shared, and what stays private before consent", async () => {
    const { getByRole, getByText } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));

    expect(getByText("처리하는 정보")).toBeTruthy();
    expect(getByText("보험사에 제공하는 요약")).toBeTruthy();
    expect(getByText("제공하지 않는 정보")).toBeTruthy();
    expect(getByText("정확한 위치·이동 경로·구간별 속도·정확한 운행 시각")).toBeTruthy();
  });

  it("keeps consent content in a bottom-safe-area scroll container", async () => {
    const { getByRole, getByTestId } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));

    const safeArea = getByTestId("consent-sheet-safe-area");
    const sheetScroll = getByTestId("consent-sheet-scroll");

    expect(safeArea.props.edges).toEqual(
      expect.objectContaining({ bottom: "additive", left: "off", right: "off", top: "off" }),
    );
    expect(sheetScroll.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("keeps the consent action disabled until both required rows are checked", async () => {
    const { getAllByRole, getByRole } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
    const continueButton = getByRole("button", { name: "동의하고 계속하기" });
    const consentRows = getAllByRole("checkbox");

    await fireEvent.press(consentRows[0]);
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(consentRows[1]);
    expect(continueButton.props.accessibilityState?.disabled).toBe(false);
  });

  it("dispatches consent and routes to insurance after both rows are accepted", async () => {
    const { getAllByRole, getByRole } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
    for (const row of getAllByRole("checkbox")) {
      await fireEvent.press(row);
    }
    await fireEvent.press(getByRole("button", { name: "동의하고 계속하기" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "ACCEPT_CONSENT" });
    expect(replace).toHaveBeenCalledWith("/insurance");
  });

  it("closes the consent sheet without changing the start state", async () => {
    const { getAllByRole, getByRole, queryByText } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
    await fireEvent.press(getAllByRole("checkbox")[0]);
    await fireEvent.press(getByRole("button", { name: "닫기" }));

    expect(queryByText("필수 동의")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
    expect(getAllByRole("checkbox")[0].props.accessibilityState?.checked).toBe(false);
    expect(getByRole("button", { name: "동의하고 계속하기" }).props.accessibilityState?.disabled).toBe(
      true,
    );
  });
});
