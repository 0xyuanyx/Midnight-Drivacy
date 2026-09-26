import { fireEvent, render } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
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
      state: { ...initialAppState, setupPreviewCompleted: true },
      dispatch,
      isHydrated: true,
    });
  });

  it("waits for authenticated Backend consent before advancing", async () => {
    let reject = true;
    const grantConsent = jest.fn(async () => { if (reject) throw new Error("network"); return { consented: true }; });
    mockUseAppState.mockReturnValue({ state: { ...initialAppState, setupPreviewCompleted: true }, dispatch, isHydrated: true,
      backend: { api: { grantConsent } } } as never);
    const ui = await render(<Onboarding />);
    await fireEvent.press(ui.getByRole("button", { name: "동의하고 시작하기" }));
    await fireEvent.press(ui.getByRole("checkbox", { name: "1번째 필수 동의" }));
    await fireEvent.press(ui.getByRole("checkbox", { name: "2번째 필수 동의" }));
    await fireEvent.press(ui.getByRole("button", { name: "동의하고 계속하기" }));
    expect(dispatch).not.toHaveBeenCalledWith({ type: "ACCEPT_CONSENT" });
    reject = false;
    await fireEvent.press(ui.getByRole("button", { name: "동의하고 계속하기" }));
    expect(grantConsent).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({ type: "ACCEPT_CONSENT" });
    expect(replace).toHaveBeenCalledWith("/insurance");
  });

  it("opens the consent sheet from the start action", async () => {
    const { getByRole, getByText, queryByText } = await render(<Onboarding />);

    expect(queryByText(/DriVacy를 시작하려면/)).toBeNull();
    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));

    expect(getByText(/DriVacy를 시작하려면/)).toBeTruthy();
    expect(getByRole("button", { name: "동의하고 계속하기" }).props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it("sends a new user to account setup before insurance consent", async () => {
    mockUseAppState.mockReturnValue({ state: initialAppState, dispatch, isHydrated: true });
    const { getByRole, queryByText } = await render(<Onboarding />);
    await fireEvent.press(getByRole("button", { name: "시작하기" }));
    expect(replace).toHaveBeenCalledWith("/setup");
    expect(queryByText(/DriVacy를 시작하려면/)).toBeNull();
  });

  it("opens each required consent disclosure from its chevron and returns to the list", async () => {
    const { getByRole, getByText, queryByText } = await render(<Onboarding />);

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));

    await fireEvent.press(getByRole("button", { name: "보험 계약 및 특약 조회 동의 상세 보기" }));
    expect(getByText("조회하는 정보")).toBeTruthy();
    expect(getByText(/보험사명, 상품명, 차량번호, 보험기간/)).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "동의 목록으로 돌아가기" }));
    expect(queryByText("조회하는 정보")).toBeNull();

    await fireEvent.press(getByRole("button", { name: "선택한 운행 기록 처리 동의 상세 보기" }));
    expect(getByText("처리하는 운행 정보")).toBeTruthy();
    expect(getByText(/정확한 위치, 이동 경로, 구간별 속도/)).toBeTruthy();
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

  it("extends the consent scrim above the web preview content inset", async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    try {
      const { getByRole, getByTestId } = await render(<Onboarding />);
      await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
      expect(StyleSheet.flatten(getByTestId("consent-backdrop").props.style).top).toBe(-22);
    } finally {
      Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
    }
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

    expect(queryByText(/DriVacy를 시작하려면/)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await fireEvent.press(getByRole("button", { name: "동의하고 시작하기" }));
    expect(getAllByRole("checkbox")[0].props.accessibilityState?.checked).toBe(false);
    expect(getByRole("button", { name: "동의하고 계속하기" }).props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it("returns from an already accepted consent sheet to insurance selection", async () => {
    mockUseAppState.mockReturnValue({
      state: { ...initialAppState, setupPreviewCompleted: true, hasConsented: true },
      dispatch,
      isHydrated: true,
    });
    const { getAllByRole, getByRole } = await render(<Onboarding startWithConsent />);

    expect(getAllByRole("checkbox").every(row => row.props.accessibilityState?.checked)).toBe(true);
    await fireEvent.press(getByRole("button", { name: "닫기" }));
    expect(replace).toHaveBeenCalledWith("/insurance");
  });
});
