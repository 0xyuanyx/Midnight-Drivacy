import { fireEvent, render } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { AppProvider, useAppState } from "./app-provider";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

function Probe() {
  const { backend, dispatch, state } = useAppState();
  return <>
    <Text>{backend ? "live API available" : "live API unavailable"}</Text>
    <Text>{state.selectedPolicyId ?? "no policy"}</Text>
    <Pressable onPress={() => dispatch({ type: "ACCEPT_CONSENT" })}><Text>consent</Text></Pressable>
    <Pressable onPress={() => dispatch({ type: "SELECT_DEMO_INSURANCE", policyId: "policy-safe-driver" } as never)}><Text>demo policy</Text></Pressable>
  </>;
}

it("removes live API access after a signed-in user selects a fixture policy", async () => {
  const ui = await render(<AppProvider backendConnection={{
    userId: "driver-1", baseUrl: "http://127.0.0.1:3000", getAccessToken: async () => "test-token",
  }}><Probe /></AppProvider>);
  expect(ui.getByText("live API available")).toBeTruthy();
  await fireEvent.press(ui.getByText("consent"));
  await fireEvent.press(ui.getByText("demo policy"));
  expect(ui.getByText("policy-safe-driver")).toBeTruthy();
  expect(ui.getByText("live API unavailable")).toBeTruthy();
});
