import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProvider, useAppState } from "@/state/app-provider";
import { redirectForRoute } from "@/state/route-policy";
import { colors } from "@/theme/tokens";

function RouteGate() {
  const pathname = usePathname();
  const { isHydrated, state } = useAppState();

  if (!isHydrated) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const redirect = redirectForRoute(pathname, state);
  return redirect ? <Redirect href={redirect} /> : <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <RouteGate />
    </AppProvider>
  );
}
