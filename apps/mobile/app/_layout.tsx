import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import regularFont from "../assets/fonts/Pretendard-Regular.otf";
import semiboldFont from "../assets/fonts/Pretendard-SemiBold.otf";
import boldFont from "../assets/fonts/Pretendard-Bold.otf";

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
  if (redirect) {
    return <Redirect href={redirect} />;
  }

  const navigator = <Stack screenOptions={{ headerShown: false }} />;
  if (Platform.OS !== "web") {
    return navigator;
  }

  return (
    <View style={styles.webStage}>
      <View style={styles.webDevice}>
        <View pointerEvents="none" style={styles.dynamicIsland} />
        <View style={styles.webScreen}>{navigator}</View>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Pretendard-Regular": regularFont,
    "Pretendard-SemiBold": semiboldFont,
    "Pretendard-Bold": boldFont,
  });
  if (!fontsLoaded && !fontError) return <ActivityIndicator color={colors.primary} />;
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <RouteGate />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  webStage: {
    alignItems: "center",
    backgroundColor: "#08080A",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  webDevice: {
    backgroundColor: colors.background,
    borderColor: "#31323A",
    borderRadius: 54,
    borderWidth: 3,
    height: "96%",
    maxHeight: 874,
    maxWidth: 402,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.45,
    shadowRadius: 44,
    width: "100%",
  },
  webScreen: {
    flex: 1,
    paddingTop: 22,
  },
  dynamicIsland: {
    alignSelf: "center",
    backgroundColor: "#050505",
    borderRadius: 999,
    height: 30,
    position: "absolute",
    top: 12,
    width: 112,
    zIndex: 20,
  },
});
