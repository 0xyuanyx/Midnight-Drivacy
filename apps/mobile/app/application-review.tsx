import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationReview() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (!state.totals.isEligible || state.applicationStage !== "idle") {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-review-guard-screen">
        <StatusPill tone="neutral">신청 검토</StatusPill>
        <Text style={styles.title}>지금은 신청 검토를 열 수 없어요</Text>
        <Text style={styles.description}>신청 조건과 현재 신청 상태를 다시 확인해 주세요.</Text>
        <View style={styles.footer}>
          <PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="application-review-screen">
      <PrimaryButton title="뒤로" variant="ghost" onPress={() => router.back()} style={styles.backButton} />
      <StatusPill tone="primary">신청 전 검토</StatusPill>
      <Text style={styles.title}>공유할 결과를 확인해 주세요</Text>
      <Text style={styles.description}>아래의 최소 정보만 보험사에 보여주는 로컬 데모 흐름입니다.</Text>

      <View style={styles.reviewCard}>
        <Text style={styles.sectionLabel}>보험사</Text>
        <Text style={styles.value}>{policy.insurerName}</Text>
        <Text style={styles.sectionLabel}>특약</Text>
        <Text style={styles.value}>{policy.riderName}</Text>
        <Text style={styles.sectionLabel}>평가 결과</Text>
        <Text style={styles.value}>안전운전 점수 {state.totals.score}점 · 누적 {state.totals.distanceKm} km</Text>
        <Text style={styles.discount}>예상 할인 {state.totals.expectedDiscountPercent}%</Text>
      </View>

      <InfoCard title="공유하는 정보">
        보험사 이름, 특약 이름, 안전운전 평가 결과처럼 할인 판단에 필요한 최소 정보만 포함합니다.
      </InfoCard>
      <InfoCard title="공유하지 않는 정보">
        정확한 위치·경로·구간별 속도·정확한 운행시각은 공유하지 않습니다.
      </InfoCard>

      <InfoCard title="데모 안내">
        이 화면의 신청 동작은 로컬 상태만 바꿉니다. 실제 보험사 제출, Midnight 증명, 체인 확인은 수행하지 않습니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton
          title="이 결과로 할인 신청하기"
          onPress={() => {
            dispatch({ type: "SUBMIT_APPLICATION" });
            router.replace("/application-submitted");
          }}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  backButton: { alignSelf: "flex-start", marginBottom: 8, width: "auto" },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800", lineHeight: 36, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
  reviewCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 24, padding: 20 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 12 },
  value: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 4 },
  discount: { color: colors.success, fontSize: 22, fontWeight: "800", marginTop: 18 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 28 },
});
