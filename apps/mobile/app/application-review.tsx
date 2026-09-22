import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationReview() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (!state.totals.isEligible || state.applicationStage !== "idle") {
    return (
      <View style={styles.page}>
        <AppScreen
          contentContainerStyle={styles.screen}
          fixedFooter={<PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />}
          testID="application-review-guard-screen"
        >
          <ScreenHeader title="서류" onBack={() => router.replace("/(tabs)/application")} />
          <PageEyebrow position="withBack">안전운전 결과 제출</PageEyebrow>
          <Text style={styles.title}>지금은 신청 검토를 열 수 없어요</Text>
          <Text style={styles.description}>신청 조건과 현재 상태를 서류 탭에서 다시 확인해 주세요.</Text>
        </AppScreen>
        <BottomTabBar />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <PrimaryButton title="증명 제출 승인" onPress={() => { dispatch({ type: "SUBMIT_APPLICATION" }); router.replace("/application-submitted"); }} />
        )}
        testID="application-review-screen"
      >
        <ScreenHeader title="서류" />
        <PageEyebrow position="withBack">안전운전 결과 제출</PageEyebrow>
        <Text style={styles.title}>보험사에 보낼 정보를{`\n`}확인해 주세요</Text>
        <Text style={styles.description}>아래에 표시된 정보만 보험사에 보내요.</Text>
        <View style={styles.card}><Text style={styles.cardTitle}>제출 대상</Text><Text style={styles.cardText}>{policy.insurerName} · {policy.riderName}{`\n`}평가기간 최근 90일</Text></View>
        <View style={[styles.card, styles.selectedCard]}>
          <Text style={styles.cardTitle}>제공되는 결과</Text>
          <Text style={styles.line}>✓ 최종 안전운전점수 {state.totals.score}점</Text>
          <Text style={styles.line}>✓ 예상 할인 구간 {state.totals.expectedDiscountPercent}%</Text>
          <Text style={styles.line}>✓ 조건 충족 여부 충족</Text>
          <Text style={styles.line}>✓ 평가기간 및 누적 거리</Text>
        </View>
        <View style={styles.card}><Text style={styles.cardTitle}>제공하지 않는 원본</Text><Text style={styles.cardText}>정확한 위치·경로·구간별 속도·정확한 운행시각은 공유하지 않습니다.</Text></View>
      </AppScreen>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  screen: { paddingBottom: 8 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.7, lineHeight: 32, marginTop: 9 },
  description: { color: colors.textSecondary, fontSize: 11, marginBottom: 20, marginTop: 7 },
  card: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: 16, borderWidth: 1, marginBottom: 10, padding: 16 },
  selectedCard: { borderColor: colors.primary },
  cardTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  cardText: { color: colors.textSecondary, fontSize: 10, lineHeight: 17, marginTop: 8 },
  line: { color: colors.textPrimary, fontSize: 10, lineHeight: 19, marginTop: 3 },
});
