import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { demoTrips } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function DriveResult() {
  const router = useRouter();
  const { state } = useAppState();
  const trip = demoTrips[Math.max(state.tripsCompleted - 1, 0)];

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="drive-result-screen">
      <StatusPill tone="success">모의 주행 결과</StatusPill>
      <Text style={styles.title}>주행 기록이{`\n`}추가되었어요</Text>
      <Text style={styles.description}>표시된 값은 결정된 로컬 데모 결과입니다.</Text>

      <View style={styles.deltaCard}>
        <Text style={styles.deltaLabel}>이번 모의 주행</Text>
        <Text style={styles.deltaValue}>+{trip.distanceKm} km</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="누적 거리" value={`${state.totals.distanceKm} km`} />
        <MetricCard label="안전운전 점수" value={`${state.totals.score}점`} />
      </View>

      <InfoCard title="처리 범위">
        실제 Midnight 증명, 체인 반영, 보험사 제출은 아직 이 데모에서 수행하지 않습니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton title="홈으로 돌아가기" onPress={() => router.replace("/(tabs)/home")} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 28 },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 41, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 12 },
  deltaCard: { backgroundColor: colors.successBackground, borderRadius: 20, marginTop: 26, padding: 22 },
  deltaLabel: { color: colors.success, fontSize: 13, fontWeight: "700" },
  deltaValue: { color: colors.success, fontSize: 36, fontWeight: "800", marginTop: 8 },
  metrics: { flexDirection: "row", gap: 12, marginTop: 12 },
  footer: { marginTop: "auto", paddingTop: 28 },
});
