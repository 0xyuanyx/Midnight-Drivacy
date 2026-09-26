import { typography } from "@/theme/typography";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies } from "@/fixtures/demo";
import { canUseLinkedDemoBridge, clearLinkedDemoApplication, getLinkedDemoApplication } from "@/api/linked-demo";
import { useAppState } from "@/state/app-provider";
import { applicationTime } from "@/state/application-time";
import { colors } from "@/theme/tokens";

export default function ApplicationResult() {
  const router = useRouter();
  const { state, dispatch } = useAppState();
  const linkedDemoEnabled = canUseLinkedDemoBridge(state.demoMode);
  const [decidedAt, setDecidedAt] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const resetInFlight = useRef(false);
  useEffect(() => {
    if (!linkedDemoEnabled || state.applicationStage !== "approved") return;
    let active = true;
    void getLinkedDemoApplication().then((application) => { if (active) setDecidedAt(application?.decidedAt ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [linkedDemoEnabled, state.applicationStage]);
  const live = state.source === "backend";
  const rejected = live && state.applicationStage === "rejected";
  const policy = live
    ? { productName: "선택한 보험계약", riderName: state.backendApplication?.specialContractName ?? "안전운전 특약" }
    : demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (state.applicationStage !== "approved" && !rejected) {
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
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <View style={{ gap: 0 }}>
            {resetError ? <Text accessibilityRole="alert" style={styles.resetError}>초기화하지 못했어요. 다시 시도해주세요.</Text> : null}
            {!live ? <PrimaryButton title={resetting ? "초기화 중…" : "초기화하기"} disabled={resetting} variant="ghost" onPress={async () => {
              if (resetInFlight.current) return;
              resetInFlight.current = true;
              setResetting(true);
              setResetError(false);
              try {
                if (linkedDemoEnabled) await clearLinkedDemoApplication();
                dispatch({ type: "RESET_DEMO" });
                router.replace(state.demoMode ? "/insurance" : "/onboarding");
              } catch {
                resetInFlight.current = false;
                setResetting(false);
                setResetError(true);
              }
            }} /> : null}
            <PrimaryButton title="홈으로 돌아가기" disabled={resetting} onPress={() => router.replace("/(tabs)/home")} />
          </View>
        )}
        testID="application-result-screen"
      >
        <PageEyebrow>할인 처리 결과</PageEyebrow>
        <Text style={styles.title}>{live ? rejected ? "할인이 적용되지 않았어요" : "할인 적용 결정이 완료되었어요" : "데모 결과를 확인했어요"}</Text>
        <Text style={styles.description}>{live ? "최종 결과를 확인하세요." : "실제 보험사 결정이 아닌 화면 체험 결과입니다."}</Text>
        <View style={styles.resultHero}>
          <Text style={styles.resultValue}>{rejected ? "미적용" : live ? `${(state.backendApplication?.appliedDiscountBps ?? 0) / 100}%` : `${state.totals.expectedDiscountPercent}%`}</Text>
          <Text style={styles.resultLabel}>{live ? rejected ? "보험사 미적용 결정" : "안전운전 할인 적용 결정" : "예상 할인 적용 예시"}</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>처리 상태</Text><Text style={styles.badge}>{live ? rejected ? "미적용 결정" : "적용 결정" : "데모 예시"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>대상</Text><Text style={styles.value}>{policy.productName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>특약</Text><Text style={styles.value}>{policy.riderName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>{live ? "결정 시각" : "데모 확인 시각"}</Text><Text style={styles.value}>{applicationTime(live ? state.backendApplication?.decidedAt : linkedDemoEnabled ? decidedAt : state.applicationDecidedAt)}</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{live ? "보험사에는 필요한 정보만 보냈어요" : "화면 체험 안내"}</Text>
          <Text style={styles.cardText}>{live
            ? "신청의 증명 검증과 보험사 적용 결정은 각각 확인되었습니다. 위치와 이동 경로는 표시하지 않습니다."
            : "실제 보험사 제출·계약 반영·증명 검증은 수행되지 않았습니다. 위치와 이동 경로는 표시하지 않습니다."}</Text>
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
  resetError: { ...typography.caption, color: "#BC344B", textAlign: "center" },
});
