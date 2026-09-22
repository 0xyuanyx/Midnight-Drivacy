import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { Wordmark } from "@/components/Wordmark";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

function homeAction(tripsCompleted: 0 | 1 | 2) {
  if (tripsCompleted === 0) return "첫 모의 주행 시작";
  if (tripsCompleted === 1) return "두 번째 모의 주행 시작";
  return "할인 신청하기";
}

export default function Home() {
  const router = useRouter();
  const { state } = useAppState();
  const progress = Math.min(state.totals.distanceKm / 550, 1);

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          title={homeAction(state.tripsCompleted)}
          onPress={() => router.push((state.tripsCompleted === 2 ? "/application" : "/drive") as never)}
        />
      )}
      testID="home-screen"
    >
      <Wordmark />
      <View style={styles.hero}>
        <PageEyebrow position="afterWordmark">안전운전 할인</PageEyebrow>
        <Text style={styles.title}>민준님, 이번 달도{`\n`}안전하게 달리고 있어요.</Text>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>내 안전운전 점수</Text>
          {state.totals.isEligible ? <Text style={styles.status}>조건 충족</Text> : null}
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{state.totals.score}점</Text>
          <View style={styles.discountBlock}>
            <Text style={styles.discountLabel}>예상 할인</Text>
            <Text style={styles.discountValue}>{state.totals.isEligible ? `${state.totals.expectedDiscountPercent}%` : "—"}</Text>
          </View>
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>할인 조건까지 {Math.round(progress * 100)}%</Text>
          <Text style={styles.distance}>{state.totals.distanceKm} / 550 km</Text>
        </View>
        <ProgressBar progress={progress} />
        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>평가 기간</Text>
            <Text style={styles.metaValue}>D-42</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>누적거리</Text>
            <Text style={styles.metaValue}>{state.totals.distanceKm} km</Text>
          </View>
        </View>
      </View>

      <View style={styles.privacyCard}>
        <View style={styles.privacyIcon}><Text style={styles.privacyCheck}>✓</Text></View>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>보험사에는 결과만 보내요</Text>
          <Text style={styles.privacyText}>위치와 이동경로는 보내지 않아요.</Text>
        </View>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 8 },
  hero: {},
  title: { color: colors.textPrimary, fontSize: 27, fontWeight: "800", letterSpacing: -0.9, lineHeight: 36, marginTop: 9 },
  scoreCard: { backgroundColor: colors.surface, borderRadius: 18, marginTop: 24, padding: 18 },
  scoreHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  scoreLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  status: { backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  scoreRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  scoreValue: { color: colors.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1.2 },
  discountBlock: { alignItems: "flex-end", paddingBottom: 4 },
  discountLabel: { color: colors.textSecondary, fontSize: 10 },
  discountValue: { color: colors.primary, fontSize: 18, fontWeight: "900", marginTop: 3 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, marginTop: 21 },
  progressLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  distance: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  metaRow: { borderTopColor: "#EDF0F4", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", marginTop: 18, paddingTop: 15 },
  metaRight: { marginLeft: "auto" },
  metaLabel: { color: colors.textSecondary, fontSize: 10 },
  metaValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", marginTop: 4 },
  privacyCard: { alignItems: "center", backgroundColor: "#EAF2FF", borderRadius: 16, flexDirection: "row", marginTop: 13, padding: 16 },
  privacyIcon: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 999, height: 28, justifyContent: "center", width: 28 },
  privacyCheck: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  privacyCopy: { flex: 1, marginLeft: 12 },
  privacyTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  privacyText: { color: colors.textSecondary, fontSize: 11, marginTop: 5 },
});
