import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationResult() {
  const router = useRouter();
  const { state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (state.applicationStage !== "approved") {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-result-guard-screen">
        <StatusPill tone="neutral">결과 확인</StatusPill>
        <Text style={styles.title}>아직 승인 결과가 없어요</Text>
        <Text style={styles.description}>신청 상태를 할인 신청 탭에서 확인해 주세요.</Text>
        <View style={styles.footer}>
          <PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="application-result-screen">
      <PrimaryButton title="뒤로" variant="ghost" onPress={() => router.replace("/(tabs)/application")} style={styles.backButton} />
      <StatusPill tone="success">데모 승인 결과</StatusPill>
      <Text style={styles.title}>할인 10% 적용 결과</Text>
      <Text style={styles.description}>안전운전 평가 결과를 바탕으로 한 로컬 데모 결과입니다.</Text>

      <View style={styles.resultCard}>
        <Text style={styles.resultValue}>{`${state.totals.expectedDiscountPercent}%`}</Text>
        <Text style={styles.resultLabel}>예상 할인율</Text>
      </View>

      <View style={styles.policyCard}>
        <Text style={styles.sectionLabel}>보험사</Text>
        <Text style={styles.value}>{policy.insurerName}</Text>
        <Text style={styles.sectionLabel}>특약</Text>
        <Text style={styles.value}>{policy.riderName}</Text>
      </View>

      <InfoCard title="공개 범위">
        정확한 위치, 이동 경로, 구간별 속도, 정확한 운행시각 없이 평가 결과만 보여주는 화면입니다.
      </InfoCard>
      <InfoCard title="데모 안내">
        로컬 데모 결과이며 실제 보험사 결정·제출, Midnight 증명, 체인 확인을 수행하지 않습니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton title="홈으로 돌아가기" onPress={() => router.replace("/(tabs)/home")} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  backButton: { alignSelf: "flex-start", marginBottom: 8, width: "auto" },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: "800", lineHeight: 38, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
  resultCard: { alignItems: "center", backgroundColor: colors.successBackground, borderRadius: 20, marginTop: 28, padding: 24 },
  resultValue: { color: colors.success, fontSize: 48, fontWeight: "800" },
  resultLabel: { color: colors.success, fontSize: 13, fontWeight: "700", marginTop: 4 },
  policyCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 12, padding: 20 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 8 },
  value: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 4 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 28 },
});
