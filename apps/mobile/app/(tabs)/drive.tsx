import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusPill } from "@/components/StatusPill";
import { demoTrips } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function Drive() {
  const router = useRouter();
  const { state } = useAppState();
  const completedTrips = demoTrips.slice(0, state.tripsCompleted);
  const canStart = state.tripsCompleted < 2;

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="drive-screen">
      <StatusPill tone="primary">모의 주행 데모</StatusPill>
      <Text style={styles.title}>다음 안전운전{`\n`}기록을 시작해 볼까요?</Text>
      <Text style={styles.description}>실제 GPS나 주행 데이터는 수집하지 않는 결정된 로컬 시뮬레이션입니다.</Text>

      <View style={styles.metrics}>
        <MetricCard label="현재 거리" value={`${state.totals.distanceKm} km`} />
        <MetricCard label="안전운전 점수" value={`${state.totals.score}점`} />
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.sectionTitle}>데모 주행 진행도</Text>
          <Text style={styles.progressValue}>{state.tripsCompleted} / 2회</Text>
        </View>
        <ProgressBar progress={state.tripsCompleted / 2} />
      </View>

      <InfoCard title="최근 모의 주행">
        {completedTrips.length === 0
          ? "아직 완료된 모의 주행이 없습니다."
          : completedTrips.map((trip) => `${trip.sequence}회차  +${trip.distanceKm} km`).join("  ·  ")}
      </InfoCard>

      <View style={styles.footer}>
        {canStart ? (
          <PrimaryButton title="모의 주행 시작" onPress={() => router.push("/drive-session")} />
        ) : (
          <View style={styles.completeCard}>
            <Text style={styles.completeTitle}>두 번의 데모 주행이 완료되었습니다.</Text>
            <Text style={styles.completeText}>할인 신청은 다음 단계의 데모 화면에서 이어집니다.</Text>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: "800", letterSpacing: -0.8, lineHeight: 39, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 13 },
  metrics: { flexDirection: "row", gap: 12, marginTop: 24 },
  progressSection: { marginVertical: 28 },
  progressHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  progressValue: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  footer: { marginTop: "auto", paddingTop: 24 },
  completeCard: { backgroundColor: "#EAF8F0", borderRadius: 16, padding: 18 },
  completeTitle: { color: colors.success, fontSize: 15, fontWeight: "800" },
  completeText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
});
