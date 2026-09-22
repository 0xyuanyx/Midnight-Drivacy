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
  const { dispatch, state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (!state.totals.isEligible) {
    return (
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="주행으로 이동" onPress={() => router.replace("/drive")} />}
        testID="application-ineligible-screen"
      >
        <PageEyebrow>안전운전 결과 제출</PageEyebrow>
        <Text style={styles.title}>아직 할인 신청 조건을{`\n`}충족하지 않았어요.</Text>
        <Text style={styles.description}>두 번의 모의 주행을 완료하면 결과를 확인할 수 있어요.</Text>
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
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="신청 내역 보기" onPress={() => router.push("/application-submitted")} />}
        testID="application-pending-screen"
      >
        <PageEyebrow>신청 완료</PageEyebrow>
        <Text style={styles.title}>보험사가 결과를 검토하고 있어요.</Text>
        <Text style={styles.description}>표시된 신청 정보는 로컬 데모 상태예요.</Text>
        <Card title="신청 상태"><Text style={styles.statusBadge}>검토 중</Text><Text style={styles.cardText}>{policy.insurerName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="제출한 결과"><Text style={styles.cardText}>최종 점수 {state.totals.score}점 · 조건 충족{`\n`}평가 기간 최근 90일</Text></Card>
        <Card title="신청 내역"><Text style={styles.cardText}>신청 번호 DR-DEMO-001{`\n`}제출 시각 2026.09.22 10:00</Text></Card>
      </AppScreen>
    );
  }

  if (state.applicationStage === "approved") {
    return (
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="결과 자세히 보기" onPress={() => router.push("/application-result")} />}
        testID="application-approved-screen"
      >
        <PageEyebrow>보험사 결정 완료</PageEyebrow>
        <Text style={styles.title}>보험료 할인이 적용되었어요</Text>
        <Text style={styles.description}>로컬 데모의 최종 결과를 확인하세요.</Text>
        <View style={styles.resultHero}><Text style={styles.resultValue}>{state.totals.expectedDiscountPercent}%</Text><Text style={styles.resultLabel}>안전 운전 할인 적용</Text></View>
        <Card title="처리 상태"><Text style={styles.statusBadge}>적용 완료</Text><Text style={styles.cardText}>{policy.productName}{`\n`}{policy.riderName}</Text></Card>
        <Card title="데모 안내"><Text style={styles.cardText}>실제 보험사 결정이나 Midnight 증명·체인 확인 결과가 아닙니다.</Text></Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          title="증명 제출 승인"
          onPress={() => {
            dispatch({ type: "SUBMIT_APPLICATION" });
            router.push("/application-submitted");
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
      <Text style={styles.demoNote}>버튼은 로컬 상태만 변경하며 실제 제출·증명 처리는 수행하지 않습니다.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.7, lineHeight: 32, marginTop: 10 },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 22, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: 16, borderWidth: 1, marginBottom: 10, padding: 16 },
  cardSelected: { borderColor: colors.primary },
  cardTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  cardText: { color: colors.textSecondary, fontSize: 10, lineHeight: 17, marginTop: 8 },
  checkLine: { color: colors.textPrimary, fontSize: 10, lineHeight: 19, marginTop: 3 },
  largeValue: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", marginTop: 10 },
  statusBadge: { alignSelf: "flex-end", backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, fontSize: 9, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  resultHero: { alignItems: "center", marginBottom: 24, marginTop: 6 },
  resultValue: { color: colors.primary, fontSize: 42, fontWeight: "900" },
  resultLabel: { color: colors.textSecondary, fontSize: 10, marginTop: 5 },
  demoNote: { color: colors.textSecondary, fontSize: 9, lineHeight: 15, marginTop: 3, textAlign: "center" },
});
