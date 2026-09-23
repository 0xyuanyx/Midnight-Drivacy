import { typography } from "@/theme/typography";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { StatusPill } from "@/components/StatusPill";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

const PROCESSING_DELAY_MS = 650;

export default function DriveProcessing() {
  const router = useRouter();
  const { dispatch, state } = useAppState();

  useEffect(() => {
    if (state.driveStage !== "processing") {
      router.replace("/(tabs)/drive");
      return;
    }

    const timer = setTimeout(() => {
      dispatch({ type: "COMPLETE_TRIP" });
      router.replace("/drive-result");
    }, PROCESSING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dispatch, router, state.driveStage]);

  if (state.driveStage !== "processing") {
    return null;
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} scroll={false} testID="drive-processing-screen">
      <View style={styles.content}>
        <StatusPill tone="primary">주행 결과 처리</StatusPill>
        <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
        <Text style={styles.title}>주행 결과를 계산하고 있어요</Text>
        <Text style={styles.description}>
          이 앱은 결정된 로컬 결과를 표시합니다. 실제 Midnight 증명, 체인 확인 또는 보험사 제출을 수행하지 않습니다.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center" },
  content: { alignItems: "center" },
  spinner: { marginTop: 30 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 26, textAlign: "center" },
  description: { ...typography.body, color: colors.textSecondary, marginTop: 8, maxWidth: 330, textAlign: "center" },
});
