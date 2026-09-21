import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function Index() {
  const { state, isHydrated } = useAppState();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Redirect
      href={state.hasConsented && state.selectedPolicyId ? "/(tabs)/home" : "/onboarding"}
    />
  );
}
