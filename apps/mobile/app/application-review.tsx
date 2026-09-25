import { typography } from "@/theme/typography";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoPolicies } from "@/fixtures/demo";
import { linkedDemoEnabled, submitLinkedDemoApplication } from "@/api/linked-demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationReview() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (!state.totals.isEligible || state.applicationStage !== "idle") {
    return (
      <View style={styles.page}>
        <AppScreen
          footerPlacement="tabbed"
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
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <PrimaryButton disabled={submitting} title={submitting ? "제출 중…" : "할인 신청 제출"} onPress={async () => {
            if (submitInFlight.current) return;
            submitInFlight.current = true;
            setSubmitting(true);
            setSubmitError(null);
            if (linkedDemoEnabled) {
              try { await submitLinkedDemoApplication(policy.id); }
              catch {
                setSubmitError("신청 정보를 제출하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
                setSubmitting(false);
                submitInFlight.current = false;
                return;
              }
            }
            dispatch({ type: "SUBMIT_APPLICATION", ...(linkedDemoEnabled ? { mode: "linked" as const } : {}) });
            router.replace("/application-submitted");
          }} />
        )}
        testID="application-review-screen"
      >
        <ScreenHeader title="서류" onBack={() => router.replace("/(tabs)/application")} backDisabled={submitting} />
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
        {linkedDemoEnabled ? <Text style={styles.cardText}>제출 결과에는 위치·이동 경로가 포함되지 않습니다. 증명 검증 상태는 별도로 확인할 수 있습니다.</Text> : null}
        {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
      </AppScreen>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  screen: { paddingBottom: 8 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  description: { ...typography.body, color: colors.textSecondary, marginBottom: 24, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 16 },
  selectedCard: { borderColor: colors.primary },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  cardText: { ...typography.caption, color: colors.textSecondary, marginTop: 8 },
  line: { ...typography.caption, color: colors.textPrimary, marginTop: 3 },
  error: { ...typography.caption, color: "#D95362", marginTop: 8 },
});
