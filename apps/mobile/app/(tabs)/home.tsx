import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusPill } from "@/components/StatusPill";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

function homeAction(tripsCompleted: 0 | 1 | 2) {
  if (tripsCompleted === 0) return "첫 모의 주행 시작";
  if (tripsCompleted === 1) return "두 번째 모의 주행 시작";
  return "할인 신청하기";
}

export default function Home() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];
  const actionLabel = homeAction(state.tripsCompleted);
  const distanceProgress = state.totals.distanceKm / 550;

  function continueDemo() {
    router.push((state.tripsCompleted === 2 ? "/application" : "/drive") as never);
  }

  function resetDemo() {
    dispatch({ type: "RESET_DEMO" });
    router.replace("/onboarding");
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="home-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>안녕하세요, 드라이버님</Text>
          <Text style={styles.policyName}>{policy.riderName}</Text>
        </View>
        <StatusPill tone="primary">로컬 데모</StatusPill>
      </View>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>안전운전 점수</Text>
        <Text style={styles.scoreValue}>{state.totals.score}점</Text>
        <Text style={styles.scoreNote}>결정된 데모 주행 결과로 표시됩니다.</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="누적 주행 거리" value={`${state.totals.distanceKm} km`} helper="할인 조건 기준 550 km" />
        <MetricCard
          helper={state.totals.isEligible ? "조건을 충족했어요" : "조건 달성 후 확인"
          }
          label="예상 할인"
          tone={state.totals.isEligible ? "success" : "default"}
          value={state.totals.isEligible ? `${state.totals.expectedDiscountPercent}%` : "—"}
        />
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.sectionTitle}>할인 조건 진행도</Text>
          <Text style={styles.progressValue}>{state.totals.distanceKm} / 550 km</Text>
        </View>
        <ProgressBar progress={distanceProgress} />
        <Text style={styles.progressHint}>
          {state.totals.isEligible ? "두 번의 데모 주행으로 조건을 충족했어요." : "두 번의 모의 주행 후 할인 조건을 확인할 수 있어요."}
        </Text>
      </View>

      <InfoCard title="개인정보는 직접 공유하지 않아요">
        이 화면은 로컬 데모 데이터입니다. 실제 Midnight 증명, 체인 확인 또는 보험사 제출을 수행하지 않습니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton title={actionLabel} onPress={continueDemo} />
        <PrimaryButton title="데모 초기화" variant="ghost" onPress={resetDemo} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  greeting: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  policyName: { color: colors.textSecondary, fontSize: 13, marginTop: 7 },
  scoreCard: { backgroundColor: colors.primary, borderRadius: 20, marginTop: 24, padding: 22 },
  scoreLabel: { color: "#DDE8FF", fontSize: 13, fontWeight: "700" },
  scoreValue: { color: colors.surface, fontSize: 42, fontWeight: "800", letterSpacing: -1, marginTop: 8 },
  scoreNote: { color: "#DDE8FF", fontSize: 12, marginTop: 5 },
  metrics: { flexDirection: "row", gap: 12, marginTop: 12 },
  progressSection: { marginBottom: 20, marginTop: 28 },
  progressHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  progressValue: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  progressHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 9 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 24 },
});
