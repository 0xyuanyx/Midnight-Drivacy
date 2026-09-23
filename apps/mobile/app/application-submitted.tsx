import { typography } from "@/theme/typography";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { BottomTabBar } from "@/components/BottomTabBar";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { demoPolicies } from "@/fixtures/demo";
import { clearLinkedDemoApplication, getLinkedDemoApplication, linkedDemoEnabled, type LinkedDemoApplication } from "@/api/linked-demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationSubmitted() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const [linked, setLinked] = useState<LinkedDemoApplication | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [missing, setMissing] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const current = await getLinkedDemoApplication();
      setLinked(current);
      setMissing(current === null);
      setRefreshError(false);
      if (current?.reviewStatus === "APPLIED") {
        dispatch({ type: "APPROVE_APPLICATION" });
        router.replace("/application-result");
      }
    } catch { setRefreshError(true); }
  }, [dispatch, router]);
  useEffect(() => {
    if (!linkedDemoEnabled || state.applicationStage !== "pending") return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh, state.applicationStage]);
  const policy = demoPolicies.find((item) => item.id === state.selectedPolicyId) ?? demoPolicies[0];

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
        contentContainerStyle={styles.screen}
        fixedFooter={(
          <PrimaryButton
            title={linkedDemoEnabled ? missing ? "다시 신청하기" : "처리 상태 새로고침" : "결과 확인"}
            onPress={() => {
              if (linkedDemoEnabled) {
                if (missing) { void clearLinkedDemoApplication(); dispatch({ type: "RESET_APPLICATION" }); router.replace("/(tabs)/application"); }
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
        <Text style={styles.title}>{missing ? "신청 기록을 찾지 못했어요." : linked?.reviewStatus === "REJECTED" ? "할인이 적용되지 않았어요." : "보험사가 결과를 검토하고 있어요."}</Text>
        <Text style={styles.description}>{missing ? "신청 기록을 확인할 수 없습니다. 다시 제출해 주세요." : linkedDemoEnabled ? "신청 정보와 처리 상태를 확인하세요." : "신청 정보와 처리 상태를 확인하세요."}</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>신청 상태</Text><Text style={styles.badge}>{linked?.reviewStatus === "REJECTED" ? "미적용" : "검토 중"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>보험사</Text><Text style={styles.value}>{policy.insurerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>특약</Text><Text style={styles.value}>{policy.riderName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>예상 할인 구간</Text><Text style={styles.value}>{state.totals.expectedDiscountPercent}%</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>제출한 결과</Text>
          <View style={styles.row}><Text style={styles.label}>최종 점수</Text><Text style={styles.value}>{state.totals.score}점 · 조건 충족</Text></View>
          <View style={styles.row}><Text style={styles.label}>평가 기간</Text><Text style={styles.value}>최근 90일</Text></View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>신청 내역</Text>
          <View style={styles.row}><Text style={styles.label}>신청 번호</Text><Text style={styles.value}>{linked?.id ?? (linkedDemoEnabled ? "확인 중" : "DR-DEMO-001")}</Text></View>
          <View style={styles.row}><Text style={styles.label}>제출 시각</Text><Text style={styles.value}>{linked ? new Date(linked.submittedAt).toLocaleString("ko-KR") : linkedDemoEnabled ? "확인 중" : "2026.09.22 10:00"}</Text></View>
        </View>
        {refreshError ? <Text style={styles.demoNote}>신청 정보를 불러오지 못했습니다. 다시 시도해 주세요.</Text> : null}
        <Text style={styles.demoNote}>{linkedDemoEnabled ? "증명·체인 검증 정보는 아직 연결되지 않았습니다." : "증명·체인 검증 정보는 아직 연결되지 않았습니다."}</Text>
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
  badge: { ...typography.badge, backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 10 },
  label: { ...typography.caption, color: colors.textSecondary, },
  value: { ...typography.label, color: colors.textPrimary, },
  demoNote: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
