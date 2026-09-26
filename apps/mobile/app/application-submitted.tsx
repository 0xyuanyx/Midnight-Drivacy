import { typography } from "@/theme/typography";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies } from "@/fixtures/demo";
import { canUseLinkedDemoBridge, clearLinkedDemoApplication, getLinkedDemoApplication, type LinkedDemoApplication } from "@/api/linked-demo";
import { parseDriverApplication, type DriverApplicationView } from "@/api/driver-application";
import { useAppState } from "@/state/app-provider";
import { applicationTime } from "@/state/application-time";
import { colors } from "@/theme/tokens";

export default function ApplicationSubmitted() {
  const router = useRouter();
  const { dispatch, state, backend } = useAppState();
  const linkedDemoEnabled = canUseLinkedDemoBridge(state.demoMode);
  const fixtureOnly = state.source !== "backend" && !linkedDemoEnabled;
  const [linked, setLinked] = useState<LinkedDemoApplication | null>(null);
  const [backendApplication, setBackendApplication] = useState<DriverApplicationView | null>(state.backendApplication ?? null);
  const [refreshError, setRefreshError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const refreshInFlight = useRef(false);
  const restartInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      if (state.source === "backend") {
        if (!backend || !state.backendApplication) throw new Error("신청 정보가 없습니다.");
        const application = parseDriverApplication(await backend.api.getDiscountApplication(state.backendApplication.id));
        setBackendApplication(application);
        dispatch({ type: "SYNC_BACKEND_APPLICATION", application });
        setRefreshError(false);
        if (application.stage === "applied" || application.stage === "rejected") router.replace("/application-result");
        return;
      }
      const current = await getLinkedDemoApplication();
      setLinked(current);
      setMissing(current === null);
      setRefreshError(false);
      if (current?.reviewStatus === "APPLIED") {
        dispatch({ type: "APPROVE_APPLICATION" });
        router.replace("/application-result");
      }
    } catch { setRefreshError(true); }
    finally { refreshInFlight.current = false; }
  }, [backend, dispatch, router, state.backendApplication, state.source]);
  async function restartApplication() {
    if (restartInFlight.current) return;
    restartInFlight.current = true;
    setRestarting(true);
    setRefreshError(false);
    try {
      await clearLinkedDemoApplication();
      dispatch({ type: "RESET_APPLICATION" });
      router.replace("/(tabs)/application");
    } catch {
      restartInFlight.current = false;
      setRestarting(false);
      setRefreshError(true);
    }
  }
  useEffect(() => {
    if ((!linkedDemoEnabled && state.source !== "backend") || state.applicationStage !== "pending") return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh, linkedDemoEnabled, state.applicationStage, state.source]);
  const policy = state.source === "backend"
    ? { insurerName: "선택한 보험계약", riderName: backendApplication?.specialContractName ?? "안전운전 특약" }
    : demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

  if (state.applicationStage !== "pending") {
    return (
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />}
        testID="application-submitted-guard-screen"
      >
        <Text style={styles.title}>신청 상태를 다시 확인해 주세요</Text>
      </AppScreen>
    );
  }

  return (
    <View style={styles.page}>
      <AppScreen
        footerPlacement="tabbed"
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <PrimaryButton
            title={restarting ? "다시 준비 중…" : state.source === "backend" ? "처리 상태 새로고침" : linkedDemoEnabled ? missing ? "다시 신청하기" : "처리 상태 새로고침" : "데모 결과 확인"}
            disabled={restarting}
            onPress={() => {
              if (state.source === "backend") { void refresh(); return; }
              if (linkedDemoEnabled) {
                if (missing) void restartApplication();
                else void refresh();
                return;
              }
              dispatch({ type: "APPROVE_APPLICATION" });
              router.replace("/application-result");
            }}
          />
        )}
        testID="application-submitted-screen"
      >
        <PageEyebrow>신청 완료</PageEyebrow>
        <Text style={styles.title}>{state.source === "backend"
          ? backendApplication?.stage === "pending-verification" ? "증명 결과를 검증하고 있어요."
            : backendApplication?.stage === "verification-failed" ? "증명 검증에 실패했어요."
              : "보험사가 결과를 검토하고 있어요."
          : missing ? "신청 기록을 찾지 못했어요." : linkedDemoEnabled ? linked?.reviewStatus === "REJECTED" ? "데모 할인 미적용 상태예요." : "데모 보험사 검토 상태를 확인해요." : "데모 신청을 기록했어요."}</Text>
        <Text style={styles.description}>{missing ? "신청 기록을 확인할 수 없습니다. 다시 제출해 주세요." : fixtureOnly ? "실제 보험사에 전송되지 않은 화면 체험용 신청입니다." : "신청 정보와 처리 상태를 확인하세요."}</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>신청 상태</Text><Text style={styles.badge}>{state.source === "backend"
            ? backendApplication?.stage === "pending-verification" ? "검증 중" : backendApplication?.stage === "verification-failed" ? "검증 실패" : "보험사 검토 중"
            : missing ? "기록 없음" : linked?.reviewStatus === "REJECTED" ? "데모 미적용" : linkedDemoEnabled ? "데모 검토 중" : "데모 기록"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>보험사</Text><Text style={styles.value}>{policy.insurerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>특약</Text><Text style={styles.value}>{policy.riderName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>예상 할인 구간</Text><Text style={styles.value}>{state.totals.expectedDiscountPercent}%</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>제출한 결과</Text>
          <View style={styles.row}><Text style={styles.label}>최종 점수</Text><Text style={styles.value}>{state.totals.score}점 · 조건 충족</Text></View>
          <View style={styles.row}><Text style={styles.label}>평가 기간</Text><Text style={styles.value}>{state.source === "backend" ? state.backendTarget?.evaluationPeriod : "최근 90일"}</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>신청 내역</Text>
          <View style={styles.row}><Text style={styles.label}>신청 번호</Text><Text style={styles.value}>{state.source === "backend" ? backendApplication?.id : linked?.id ?? (linkedDemoEnabled ? "확인 중" : "DR-DEMO-001")}</Text></View>
          <View style={styles.row}><Text style={styles.label}>{state.source === "backend" ? "제출 시각" : "데모 기록 시각"}</Text><Text style={styles.value}>{state.source === "backend" ? applicationTime(backendApplication?.submittedAt) : linkedDemoEnabled ? linked ? applicationTime(linked.submittedAt) : missing ? "기록 없음" : "확인 중" : applicationTime(state.applicationSubmittedAt)}</Text></View>
        </View>
        {refreshError ? <Text style={styles.demoNote}>신청 정보를 불러오지 못했습니다. 다시 시도해 주세요.</Text> : null}
        <Text style={styles.demoNote}>{state.source === "backend" ? "증명 검증과 보험사의 할인 적용 결정은 별도 단계입니다." : "증명·체인 검증 정보는 아직 연결되지 않았습니다."}</Text>
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
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 12, padding: 16 },
  cardHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  badge: { ...typography.badge, backgroundColor: colors.background, borderRadius: 999, color: colors.textSecondary, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 10 },
  label: { ...typography.caption, color: colors.textSecondary, },
  value: { ...typography.label, color: colors.textPrimary, },
  demoNote: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
