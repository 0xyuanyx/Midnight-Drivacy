import { typography } from "@/theme/typography";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { Wordmark } from "@/components/Wordmark";
import { demoRule } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { homePresentation } from "@/state/home-presentation";
import { colors } from "@/theme/tokens";

export default function Home() {
  const router = useRouter();
  const { state } = useAppState();
  const presentation = homePresentation(state);
  const live = state.source === "backend";
  const progress = live ? (state.totals.isEligible ? 1 : 0) : Math.min(state.totals.distanceKm / demoRule.minimumDistanceKm, 1);

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      footerPlacement="tabbed"
      fixedFooter={(
        <PrimaryButton
          title={presentation.action}
          onPress={() => router.push(presentation.route)}
        />
      )}
      testID="home-screen"
    >
      <Wordmark />
      <View style={styles.hero}>
        <PageEyebrow position="afterWordmark">안전운전 할인</PageEyebrow>
        <Text style={styles.title}>{presentation.title}</Text>
      </View>

      <View style={styles.scoreCard} testID="home-score-card">
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>내 안전운전 점수</Text>
          {state.totals.isEligible ? <Text style={styles.status}>조건 충족</Text> : null}
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{state.tripsCompleted === 0 ? "--점" : `${state.totals.score}점`}</Text>
          <View style={styles.discountBlock}>
            <Text style={styles.discountLabel}>예상 할인</Text>
            <Text style={styles.discountValue}>{state.totals.isEligible ? `${state.totals.expectedDiscountPercent}%` : "—"}</Text>
          </View>
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{live ? "서버 확정 조건" : `거리 조건 ${Math.round(progress * 100)}%`}</Text>
          <Text style={styles.distance}>{live ? `확정 누적 ${state.totals.distanceKm} km` : `${state.totals.distanceKm} / ${demoRule.minimumDistanceKm} km`}</Text>
        </View>
        <ProgressBar progress={progress} />
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>평가 기간</Text>
          <Text style={styles.metaValue}>{live ? state.backendTarget?.evaluationPeriod : "최근 90일"}</Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="서류에서 할인 신청 상태 확인" onPress={() => router.push("/application")} style={styles.applicationCard}>
        <Text style={styles.privacyTitle}>{presentation.status}</Text>
        <Text style={styles.privacyText}>{presentation.detail}</Text>
        <Text style={styles.applicationLink}>서류에서 확인하기 ›</Text>
      </Pressable>
      <View style={styles.privacyCard}>
        <View style={styles.privacyIcon}><Text style={styles.privacyCheck}>✓</Text></View>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>{live ? "보험사에는 결과만 보내요" : "데모에서는 결과만 표시해요"}</Text>
          <Text style={styles.privacyText}>{live ? "위치와 이동경로는 보내지 않아요." : "실제 보험사 제출이나 위치 수집은 하지 않아요."}</Text>
        </View>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  applicationCard: { backgroundColor: colors.surface, borderRadius: 16, marginTop: 12, padding: 16 },
  applicationLink: { ...typography.label, color: colors.primary, marginTop: 12 },
  screen: { paddingBottom: 8 },
  hero: {},
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  scoreCard: { backgroundColor: colors.surface, borderRadius: 18, marginTop: 18, padding: 16 },
  scoreHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  scoreLabel: { ...typography.cardTitle, color: colors.textPrimary, },
  status: { ...typography.badge, backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  scoreRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  scoreValue: { ...typography.metric, color: colors.textPrimary, },
  discountBlock: { alignItems: "flex-end", paddingBottom: 4 },
  discountLabel: { ...typography.caption, color: colors.textSecondary, },
  discountValue: { ...typography.metricSmall, color: colors.primary, marginTop: 3 },
  progressHeader: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginBottom: 8, marginTop: 12 },
  progressLabel: { ...typography.label, color: colors.textSecondary, },
  distance: { ...typography.label, color: colors.textSecondary, },
  metaRow: { borderTopColor: "#EDF0F4", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10 },
  metaLabel: { ...typography.caption, color: colors.textSecondary, },
  metaValue: { ...typography.label, color: colors.textPrimary },
  privacyCard: { alignItems: "center", backgroundColor: "#EAF2FF", borderRadius: 16, flexDirection: "row", marginTop: 13, padding: 16 },
  privacyIcon: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, height: 28, justifyContent: "center", width: 28 },
  privacyCheck: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  privacyCopy: { flex: 1, marginLeft: 12 },
  privacyTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  privacyText: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
});
