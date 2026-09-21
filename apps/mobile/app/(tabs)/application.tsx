import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function Application() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (state.applicationStage === "approved") {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-approved-screen">
        <StatusPill tone="success">데모 승인 결과</StatusPill>
        <Text style={styles.title}>할인 10% 적용 결과</Text>
        <Text style={styles.description}>신청 결과를 다시 확인할 수 있어요.</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultValue}>{`${state.totals.expectedDiscountPercent}%`}</Text>
          <Text style={styles.resultLabel}>예상 할인율</Text>
        </View>

        <InfoCard title="가입 정보">
          {`${policy.insurerName} · ${policy.riderName}`}
        </InfoCard>
        <InfoCard title="데모 범위">
          로컬 데모 결과이며 실제 보험사 결정·제출, Midnight 증명, 체인 확인을 수행하지 않습니다.
        </InfoCard>

        <View style={styles.footer}>
          <PrimaryButton title="결과 자세히 보기" onPress={() => router.push("/application-result")} />
          <PrimaryButton title="홈으로 돌아가기" variant="ghost" onPress={() => router.replace("/(tabs)/home")} />
        </View>
      </AppScreen>
    );
  }

  if (state.applicationStage === "pending") {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-pending-screen">
        <StatusPill tone="primary">심사 대기</StatusPill>
        <Text style={styles.title}>보험사 심사 대기 중</Text>
        <Text style={styles.description}>
          로컬 데모에서 신청 후 심사 대기 상태를 표시하고 있어요.
        </Text>

        <View style={styles.applicationCard}>
          <Text style={styles.cardLabel}>신청 번호</Text>
          <Text style={styles.cardValue}>DR-DEMO-001</Text>
          <Text style={styles.cardHelper}>2026.09.22 10:00 신청한 데모 건</Text>
        </View>

        <InfoCard title="중요 안내">
          실제 보험사 제출·심사·결정이 이루어진 것은 아닙니다. 아래 버튼은 데모 결과를 다음 상태로 바꾸는 동작입니다.
        </InfoCard>

        <View style={styles.footer}>
          <PrimaryButton
            title="데모 결과 반영"
            onPress={() => {
              dispatch({ type: "APPROVE_APPLICATION" });
              router.replace("/application-result");
            }}
          />
          <PrimaryButton title="홈으로 돌아가기" variant="ghost" onPress={() => router.replace("/(tabs)/home")} />
        </View>
      </AppScreen>
    );
  }

  if (!state.totals.isEligible) {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-ineligible-screen">
        <StatusPill tone="neutral">신청 전</StatusPill>
        <Text style={styles.title}>아직 할인 신청 조건을 충족하지 않았어요</Text>
        <Text style={styles.description}>두 번의 모의 주행을 완료하면 결과를 확인하고 신청할 수 있습니다.</Text>

        <View style={styles.requirementCard}>
          <Text style={styles.requirementTitle}>현재 진행도</Text>
          <Text style={styles.requirementValue}>{state.totals.distanceKm} / 550 km</Text>
          <Text style={styles.requirementHelper}>누적 550 km 이상, 안전운전 점수 80점 이상이 필요합니다.</Text>
        </View>

        <InfoCard title="개인정보 보호">
          할인 신청 전에는 어떤 결과도 공유하지 않습니다. 이 앱은 상세 위치·경로를 보험사에 제공하지 않는 로컬 데모입니다.
        </InfoCard>

        <View style={styles.footer}>
          <PrimaryButton title="주행으로 이동" onPress={() => router.replace("/drive")} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="application-eligible-screen">
      <StatusPill tone="success">신청 가능</StatusPill>
      <Text style={styles.title}>할인 신청 결과를 확인해 보세요</Text>
      <Text style={styles.description}>보험사와 공유할 최소 결과를 먼저 검토한 뒤 데모 신청을 진행합니다.</Text>

      <View style={styles.applicationCard}>
        <Text style={styles.cardLabel}>예상 할인</Text>
        <Text style={styles.discountValue}>{`${state.totals.expectedDiscountPercent}%`}</Text>
        <Text style={styles.cardHelper}>{policy.riderName}</Text>
      </View>

      <InfoCard title="원본 주행 데이터는 공유하지 않아요">
        보험사에는 안전운전 평가 결과와 특약 정보만 보여줍니다. 정확한 위치, 이동 경로, 구간별 속도, 정확한 운행시각은 포함하지 않습니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton title="할인 신청 검토" onPress={() => router.push("/application-review")} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800", lineHeight: 36, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
  requirementCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 28, padding: 20 },
  requirementTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  requirementValue: { color: colors.textPrimary, fontSize: 30, fontWeight: "800", marginTop: 8 },
  requirementHelper: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 },
  applicationCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 28, padding: 20 },
  cardLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  cardValue: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 8 },
  discountValue: { color: colors.success, fontSize: 38, fontWeight: "800", marginTop: 8 },
  cardHelper: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
  resultCard: { alignItems: "center", backgroundColor: colors.successBackground, borderRadius: 20, marginTop: 28, padding: 24 },
  resultValue: { color: colors.success, fontSize: 44, fontWeight: "800" },
  resultLabel: { color: colors.success, fontSize: 13, fontWeight: "700", marginTop: 4 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 28 },
});
