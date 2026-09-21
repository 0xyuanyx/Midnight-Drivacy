import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusPill } from "@/components/StatusPill";
import { colors } from "@/theme/tokens";

export default function DriveSession() {
  const router = useRouter();

  return (
    <AppScreen contentContainerStyle={styles.screen} scroll={false} testID="drive-session-screen">
      <StatusPill tone="primary">모의 주행 진행 중</StatusPill>
      <View style={styles.centerContent}>
        <Text style={styles.title}>안전운전 기록을{`\n`}시뮬레이션하고 있어요</Text>
        <Text style={styles.description}>이 화면은 정해진 데모 진행도이며 실제 위치나 주행 데이터를 사용하지 않습니다.</Text>

        <View style={styles.distanceCard}>
          <Text style={styles.distanceLabel}>현재 모의 거리</Text>
          <Text style={styles.distanceValue}>67 km</Text>
          <ProgressBar progress={0.68} />
          <Text style={styles.time}>00:18:40 경과</Text>
        </View>
      </View>
      <PrimaryButton title="주행 종료" onPress={() => router.replace("/drive-processing")} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 28 },
  centerContent: { flex: 1, justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: 31, fontWeight: "800", letterSpacing: -0.8, lineHeight: 40 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 16 },
  distanceCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 32, padding: 22 },
  distanceLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  distanceValue: { color: colors.primary, fontSize: 38, fontWeight: "800", marginBottom: 20, marginTop: 9 },
  time: { color: colors.textSecondary, fontSize: 12, marginTop: 10, textAlign: "right" },
});
