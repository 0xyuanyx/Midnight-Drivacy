import { render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { AppScreen } from "@/components/AppScreen";

it("uses one footer height for every screen without tabs", async () => {
  const ui = await render(
    <AppScreen fixedFooter={<Text>계속하기</Text>}>
      <Text>화면</Text>
    </AppScreen>,
  );

  expect(StyleSheet.flatten(ui.getByTestId("app-screen-footer").props.style).paddingBottom).toBe(48);
});

it("uses the separate tabbed footer height", async () => {
  const ui = await render(
    <AppScreen footerPlacement="tabbed" fixedFooter={<Text>계속하기</Text>}>
      <Text>화면</Text>
    </AppScreen>,
  );

  expect(StyleSheet.flatten(ui.getByTestId("app-screen-footer").props.style).paddingBottom).toBe(12);
});
