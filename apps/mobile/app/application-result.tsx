import { typography } from "@/theme/typography";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationResult() {
  const router = useRouter();
  const { state, dispatch } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (state.applicationStage !== "approved") {
    return (
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />}
        testID="application-result-guard-screen"
      >
        <Text style={styles.title}>아직 승인 결과가 없어요</Text>
      </AppScreen>
    );
  }

  return (
    <View style={styles.page}>
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <View style={{ gap: 0 }}>
            <PrimaryButton title="초기화하기" variant="ghost" onPress={() => {
              dispatch({ type: "RESET_DEMO" });
              router.replace("/onboarding");
            }} />
            <PrimaryButton title="홈으로 돌아가기" onPress={() => router.replace("/(tabs)/home")} />
          </View>
        )}
        testID="application-result-screen"
      >
        <PageEyebrow>보험사 결정 완료</PageEyebrow>
        <Text style={styles.title}>보험료 할인이 적용되었어요</Text>
        <Text style={styles.description}>로컬 데모의 최종 결과를 확인하세요.</Text>
        <View style={styles.resultHero}>
          <Text style={styles.resultValue}>{state.totals.expectedDiscountPercent}%</Text>
          <Text style={styles.resultLabel}>안전 운전 할인 적용</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>처리 상태</Text><Text style={styles.badge}>적용 완료</Text></View>
          <View style={styles.row}><Text style={styles.label}>대상</Text><Text style={styles.value}>{policy.productName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>특약</Text><Text style={styles.value}>{policy.riderName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>결정일</Text><Text style={styles.value}>2026.09.22</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>보험사에는 필요한 정보만 보냈어요</Text>
          <Text style={styles.cardText}>이 화면은 위치나 이동 경로를 포함하지 않는 로컬 데모 결과예요. 실제 보험사 결정·제출, Midnight 증명이나 체인 확인을 수행하지 않았습니다.</Text>
        </View>
      </AppScreen>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  screen: { paddingBottom: 8 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  description: { ...typography.body, color: colors.textSecondary, marginTop: 8 },
  resultHero: { alignItems: "center", marginVertical: 30 },
  resultValue: { ...typography.metric, color: colors.primary, },
  resultLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 12, padding: 16 },
  cardHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  badge: { ...typography.badge, backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 10 },
  label: { ...typography.caption, color: colors.textSecondary, },
  value: { ...typography.label, color: colors.textPrimary, },
  cardText: { ...typography.caption, color: colors.textSecondary, marginTop: 8 },
});
