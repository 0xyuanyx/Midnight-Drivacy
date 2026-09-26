import { render, waitFor } from "@testing-library/react-native";
import { Text as MockText } from "react-native";
import { DriverAuthSession, driverId, type EmailAuthAdapter } from "@/auth/driver-auth";

const mockGetCurrentUser = jest.fn();
jest.mock("@/auth/config", () => ({ backendBaseUrl: "https://backend.example.test" }));
jest.mock("@/api/backend", () => ({ createDriverApi: () => ({ getCurrentUser: mockGetCurrentUser }) }));
jest.mock("@/state/app-provider", () => ({
  AppProvider: ({ backendConnection, ephemeral }: { backendConnection?: { userId: string }; ephemeral: boolean }) =>
    <MockText>{backendConnection?.userId ?? (ephemeral ? "signed-out" : "fixture")}</MockText>,
}));

function adapter(userId: string | null): EmailAuthAdapter {
  return { ready: true, userId, sendCode: jest.fn(), verifyCode: jest.fn(), getAccessToken: jest.fn(async () => "access-token") };
}
beforeEach(() => jest.clearAllMocks());

it("accepts only the Backend driver identity", () => {
  expect(driverId({ id: "server-user", role: "DRIVER" })).toBe("server-user");
  expect(() => driverId({ id: "privy-id", role: "INSURER" })).toThrow();
  expect(() => driverId({ role: "DRIVER" })).toThrow();
});

it("does not read Backend data or fixture persistence while signed out", async () => {
  const ui = await render(<DriverAuthSession adapter={adapter(null)} />);
  expect(ui.getByText("signed-out")).toBeTruthy();
  expect(mockGetCurrentUser).not.toHaveBeenCalled();
});

it("restores a server-confirmed driver and removes it after logout", async () => {
  mockGetCurrentUser.mockResolvedValue({ id: "server-user", role: "DRIVER" });
  const ui = await render(<DriverAuthSession adapter={adapter("privy-user")} />);
  await waitFor(() => expect(ui.getByText("server-user")).toBeTruthy());
  await ui.rerender(<DriverAuthSession adapter={adapter(null)} />);
  expect(ui.getByText("signed-out")).toBeTruthy();
  expect(ui.queryByText("server-user")).toBeNull();
});

it("rejects an insurer identity in the subscriber application", async () => {
  mockGetCurrentUser.mockResolvedValue({ id: "insurer", role: "INSURER" });
  const ui = await render(<DriverAuthSession adapter={adapter("privy-user")} />);
  await waitFor(() => expect(mockGetCurrentUser).toHaveBeenCalled());
  expect(ui.getByText("signed-out")).toBeTruthy();
  expect(ui.queryByText("insurer")).toBeNull();
});
