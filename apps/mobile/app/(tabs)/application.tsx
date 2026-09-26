import { typography } from "@/theme/typography";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies, demoRule } from "@/fixtures/demo";
import { canUseLinkedDemoBridge } from "@/api/linked-demo";
import { applicationTime } from "@/state/application-time";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

function Card({ children, selected = false, title }: { children: React.ReactNode; selected?: boolean; title: string }) {
  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function Application() {
  const router = useRouter();
  const { state } = useAppState();
  const linkedDemoEnabled = canUseLinkedDemoBridge(state.demoMode);
  const live = state.source === "backend";
  const policy = live
    ? { insurerName: "선택한 보험계약", productName: "자동차보험", riderName: state.backendApplication?.specialContractName ?? "선택한 안전운전 특약" }
    : demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (!state.totals.isEligible) {
    return (
      <AppScreen
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="주행으로 이동" onPress={() => router.replace("/drive")} />}
        testID="application-ineligible-screen"
      >
        <PageEyebrow>안전운전 결과 제출</PageEyebrow>
        <Text style={styles.title}>아직 할인 신청 조건을{`\n`}충족하지 않았어요.</Text>
        <Text style={styles.description}>{live ? "서버에서 확정된 운행 결과의 할인 조건을 확인해 주세요." : "두 번의 주행 체험을 완료하면 결과를 확인할 수 있어요."}</Text>
        <Card title="현재 진행도">
          <Text style={styles.largeValue}>{live ? `서버 확정 누적 ${state.totals.distanceKm} km` : `${state.totals.distanceKm} / ${demoRule.minimumDistanceKm} km`}</Text>
          <Text style={styles.cardText}>{live ? `확정 점수 ${state.tripsCompleted === 0 ? "측정 전" : `${state.totals.score}점`} · 조건 ${state.totals.isEligible ? "충족" : "미충족"}` : `누적 ${demoRule.minimumDistanceKm} km 이상, 안전운전 점수 ${demoRule.minimumScore}점 이상이 필요합니다.`}</Text>
        </Card>
      </AppScreen>
    );
  }

  if (state.applicationStage === "pending") {
    return (
      <AppScreen
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="신청 내역 보기" onPress={() => router.push("/application-submitted")} />}
        testID="application-pending-screen"
      >
        <PageEyebrow>신청 완료</PageEyebrow>
        <Text style={styles.title}>{live && state.backendApplication?.stage === "pending-verification" ? "증명 결과를 검증하고 있어요." : linkedDemoEnabled ? "신청 처리 상태를 확인해 주세요." : "보험사가 결과를 검토하고 있어요."}</Text>
        <Text style={styles.description}>신청 정보와 처리 상태를 확인하세요.</Text>
        <Card title="신청 상태"><Text style={[styles.statusBadge, styles.neutralBadge]}>{live ? state.backendApplication?.stage === "verification-failed" ? "검증 실패" : state.backendApplication?.stage === "pending-verification" ? "검증 중" : "보험사 검토 중" : linkedDemoEnabled ? "내역에서 확인" : "검토 중"}</Text><Text style={styles.cardText}>{policy.insurerName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="제출한 결과"><Text style={styles.cardText}>최종 점수 {state.totals.score}점 · 조건 충족{`\n`}평가 기간 {live ? state.backendTarget?.evaluationPeriod : "최근 90일"}</Text></Card>
        <Card title="신청 내역"><Text style={styles.cardText}>{live ? `신청 번호 ${state.backendApplication?.id ?? "확인 중"}` : linkedDemoEnabled ? "신청 번호와 최신 처리 상태는 신청 내역에서 확인할 수 있어요." : `신청 번호 DR-DEMO-001\n제출 시각 ${applicationTime(state.applicationSubmittedAt)}`}</Text></Card>
      </AppScreen>
    );
  }

  if (state.applicationStage === "approved" || (live && state.applicationStage === "rejected")) {
    return (
      <AppScreen
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="결과 자세히 보기" onPress={() => router.push("/application-result")} />}
        testID="application-approved-screen"
      >
        <PageEyebrow>할인 처리 결과</PageEyebrow>
        <Text style={styles.title}>{state.applicationStage === "rejected" ? "할인이 적용되지 않았어요" : "할인 적용 결정이 완료되었어요"}</Text>
        <Text style={styles.description}>최종 결과를 확인하세요.</Text>
        <View style={styles.resultHero}><Text style={styles.resultValue}>{state.applicationStage === "rejected" ? "미적용" : live ? `${(state.backendApplication?.appliedDiscountBps ?? 0) / 100}%` : `${state.totals.expectedDiscountPercent}%`}</Text><Text style={styles.resultLabel}>안전운전 할인 적용 결정</Text></View>
        <Card title="처리 상태"><Text style={styles.statusBadge}>{state.applicationStage === "rejected" ? "미적용 결정" : "적용 결정"}</Text><Text style={styles.cardText}>{policy.productName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="검증 안내"><Text style={styles.cardText}>{live ? "신청 증명 검증과 보험사 적용 결정은 별도로 완료되었습니다." : "증명·체인 검증 정보는 아직 연결되지 않았습니다."}</Text></Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      footerPlacement="tabbed"
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          title="신청 내용 검토"
          onPress={() => {
            router.push("/application-review");
          }}
        />
      )}
      testID="application-eligible-screen"
    >
      <PageEyebrow>안전운전 결과 제출</PageEyebrow>
      <Text style={styles.title}>할인 신청을 준비했어요</Text>
      <Text style={styles.description}>다음 화면에서 제공할 정보를 확인한 뒤 제출해 주세요.</Text>

      <Card title="제출 대상"><Text style={styles.cardText}>{policy.insurerName} · {policy.riderName}{`\n`}평가기간 {live ? state.backendTarget?.evaluationPeriod : "최근 90일"}</Text></Card>
      <Card selected title="신청 조건 충족">
        <Text style={styles.largeValue}>예상 할인 {state.totals.expectedDiscountPercent}%</Text>
        <Text style={styles.cardText}>안전운전 {state.totals.score}점 · 누적 {state.totals.distanceKm} km</Text>
      </Card>
      <Text style={styles.demoNote}>아직 제출되지 않았어요. 예상 할인과 최종 적용 결정은 다를 수 있어요.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 10 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  description: { ...typography.body, color: colors.textSecondary, marginBottom: 24, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 16 },
  cardSelected: { borderColor: colors.primary },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  cardText: { ...typography.caption, color: colors.textSecondary, marginTop: 8 },
  largeValue: { ...typography.metricSmall, color: colors.textPrimary, marginTop: 10 },
  statusBadge: { ...typography.badge, alignSelf: "flex-end", backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  neutralBadge: { backgroundColor: colors.background, color: colors.textSecondary },
  resultHero: { alignItems: "center", marginBottom: 24, marginTop: 6 },
  resultValue: { ...typography.metric, color: colors.primary, },
  resultLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  demoNote: { ...typography.caption, color: colors.textSecondary, marginTop: 3, textAlign: "center" },
});
