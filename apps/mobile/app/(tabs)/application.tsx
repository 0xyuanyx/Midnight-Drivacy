import { typography } from "@/theme/typography";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies } from "@/fixtures/demo";
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
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

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
        <Text style={styles.description}>두 번의 주행 체험을 완료하면 결과를 확인할 수 있어요.</Text>
        <Card title="현재 진행도">
          <Text style={styles.largeValue}>{state.totals.distanceKm} / 550 km</Text>
          <Text style={styles.cardText}>누적 550 km 이상, 안전운전 점수 80점 이상이 필요합니다.</Text>
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
        <Text style={styles.title}>보험사가 결과를 검토하고 있어요.</Text>
        <Text style={styles.description}>신청 정보와 처리 상태를 확인하세요.</Text>
        <Card title="신청 상태"><Text style={styles.statusBadge}>검토 중</Text><Text style={styles.cardText}>{policy.insurerName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="제출한 결과"><Text style={styles.cardText}>최종 점수 {state.totals.score}점 · 조건 충족{`\n`}평가 기간 최근 90일</Text></Card>
        <Card title="신청 내역"><Text style={styles.cardText}>신청 번호 DR-DEMO-001{`\n`}제출 시각 2026.09.22 10:00</Text></Card>
      </AppScreen>
    );
  }

  if (state.applicationStage === "approved") {
    return (
      <AppScreen
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="결과 자세히 보기" onPress={() => router.push("/application-result")} />}
        testID="application-approved-screen"
      >
        <PageEyebrow>할인 처리 결과</PageEyebrow>
        <Text style={styles.title}>할인 적용 결정이 완료되었어요</Text>
        <Text style={styles.description}>최종 결과를 확인하세요.</Text>
        <View style={styles.resultHero}><Text style={styles.resultValue}>{state.totals.expectedDiscountPercent}%</Text><Text style={styles.resultLabel}>안전운전 할인 적용 결정</Text></View>
        <Card title="처리 상태"><Text style={styles.statusBadge}>적용 결정</Text><Text style={styles.cardText}>{policy.productName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="검증 안내"><Text style={styles.cardText}>증명·체인 검증 정보는 아직 연결되지 않았습니다.</Text></Card>
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
      <Text style={styles.title}>보험사에 보낼 정보를{`\n`}확인해 주세요</Text>
      <Text style={styles.description}>아래에 표시된 정보만 보험사에 보내요.</Text>

      <Card title="제출 대상"><Text style={styles.cardText}>{policy.insurerName} · {policy.riderName}{`\n`}평가기간 최근 90일</Text></Card>
      <Card selected title="제공되는 결과">
        <Text style={styles.checkLine}>✓ 최종 안전운전점수 {state.totals.score}점</Text>
        <Text style={styles.checkLine}>✓ 예상 할인 구간 {state.totals.expectedDiscountPercent}%</Text>
        <Text style={styles.checkLine}>✓ 조건 충족 여부 충족</Text>
        <Text style={styles.checkLine}>✓ 평가기간 및 누적 거리</Text>
      </Card>
      <Card title="제공하지 않는 원본"><Text style={styles.cardText}>정확한 위치 · 이동경로 · 운행시각 · 구간별 속도</Text></Card>
      <Text style={styles.demoNote}>증명 검증 정보는 제출 후 별도로 확인할 수 있습니다.</Text>
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
  checkLine: { ...typography.caption, color: colors.textPrimary, marginTop: 3 },
  largeValue: { ...typography.metricSmall, color: colors.textPrimary, marginTop: 10 },
  statusBadge: { ...typography.badge, alignSelf: "flex-end", backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  resultHero: { alignItems: "center", marginBottom: 24, marginTop: 6 },
  resultValue: { ...typography.metric, color: colors.primary, },
  resultLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  demoNote: { ...typography.caption, color: colors.textSecondary, marginTop: 3, textAlign: "center" },
});
