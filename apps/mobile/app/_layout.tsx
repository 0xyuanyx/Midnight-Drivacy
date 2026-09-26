import { useEffect } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import regularFont from "../assets/fonts/Pretendard-Regular.otf";
import semiboldFont from "../assets/fonts/Pretendard-SemiBold.otf";
import boldFont from "../assets/fonts/Pretendard-Bold.otf";

import { useAppState } from "@/state/app-provider";
import AuthProvider from "@/auth/AuthProvider";
import { redirectForRoute } from "@/state/route-policy";
import { colors } from "@/theme/tokens";

function RouteGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { isHydrated, state } = useAppState();
  const redirect = isHydrated ? redirectForRoute(pathname, state) : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  const navigator = <Stack screenOptions={{ headerShown: false }} />;
  const content = <>
    {navigator}
    {(!isHydrated || redirect) && (
      <View style={styles.routeLoading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )}
  </>;
  if (Platform.OS !== "web") {
    return <View style={styles.nativeRoot}>{content}</View>;
  }

  return (
    <View style={styles.webStage}>
      <View style={styles.webDevice}>
        <View pointerEvents="none" style={styles.dynamicIsland} />
        <View style={styles.webScreen}>{content}</View>
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
    <AuthProvider>
      <StatusBar style="dark" />
      <RouteGate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  routeLoading: {
    alignItems: "center",
    backgroundColor: colors.background,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 30,
  },
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
