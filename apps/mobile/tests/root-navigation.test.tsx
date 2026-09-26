import { render, waitFor } from "@testing-library/react-native";
import { usePathname, useRouter } from "expo-router";

import RootLayout from "../app/_layout";
import { useAppState } from "@/state/app-provider";
import { initialAppState } from "@/state/app-state";

jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/auth/AuthProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/state/app-provider", () => ({ useAppState: jest.fn() }));
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    Stack: () => React.createElement(View, { testID: "mounted-stack" }),
    Redirect: () => React.createElement(View, { testID: "unmounted-stack-redirect" }),
    usePathname: jest.fn(),
    useRouter: jest.fn(),
  };
});

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAppState = useAppState as jest.MockedFunction<typeof useAppState>;

it("keeps the root navigator mounted while replacing setup with consent", async () => {
  const replace = jest.fn();
  mockUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
  mockUsePathname.mockReturnValue("/setup");
  mockUseAppState.mockReturnValue({
    state: { ...initialAppState, setupPreviewCompleted: true },
    dispatch: jest.fn(),
    isHydrated: true,
  });

  const ui = await render(<RootLayout />);
  expect(ui.getByTestId("mounted-stack")).toBeTruthy();
  expect(ui.queryByTestId("unmounted-stack-redirect")).toBeNull();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/consent"));

  mockUsePathname.mockReturnValue("/consent");
  await ui.rerender(<RootLayout />);
  expect(ui.getByTestId("mounted-stack")).toBeTruthy();
  expect(replace).toHaveBeenCalledTimes(1);
});
