import { typography } from "@/theme/typography";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoRule } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function Drive() {
  const router = useRouter();
  const { dispatch, state, backend } = useAppState();
  const starting = useRef(false);
  const [startError, setStartError] = useState<string | null>(null);
  useEffect(() => {
    if (state.driveStage === "idle") starting.current = false;
  }, [state.driveStage]);
  const canStart = state.tripsCompleted < 2 && state.driveStage === "idle";
  const live = state.source === "backend";
  const progress = live ? (state.totals.isEligible ? 1 : 0) : Math.min(state.totals.distanceKm / demoRule.minimumDistanceKm, 1);
  const scoreMet = live ? state.totals.isEligible : state.tripsCompleted > 0 && state.totals.score >= demoRule.minimumScore;
  const footer = state.driveStage === "active" ? (
    <PrimaryButton title="주행 체험으로 돌아가기" onPress={() => router.push("/drive-session")} />
  ) : state.driveStage === "result" ? (
    <PrimaryButton title="주행 결과 보기" onPress={() => router.push("/drive-result")} />
  ) : canStart ? (
    <PrimaryButton
      title="주행 체험 시작"
      onPress={async () => {
        if (starting.current) return;
        starting.current = true;
        setStartError(null);
        if (live) {
          if (!backend || !state.selectedPolicyId || !state.backendTarget) {
            setStartError("인증된 운행 연결을 확인할 수 없습니다."); starting.current = false; return;
          }
          try {
            const response = await backend.workflow.start({ insuranceContractId: state.selectedPolicyId,
              specialContractId: state.backendTarget.specialContractId, evaluationPeriod: state.backendTarget.evaluationPeriod });
            const session = response as { sessionId: string; startedAt: string; trip: { id: string } };
            dispatch({ type: "START_BACKEND_TRIP", sessionId: session.sessionId, operationId: session.trip.id,
              startedAt: Date.parse(session.startedAt) });
            router.push("/drive-session");
          } catch {
            setStartError("운행을 시작하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
            starting.current = false;
          }
          return;
        }
        dispatch({ type: "START_TRIP" });
        router.push("/drive-session");
      }}
    />
  ) : state.driveStage === "processing" ? (
    <View style={styles.completeCard}>
      <Text style={styles.completeTitle}>주행 결과를 처리하고 있어요.</Text>
    </View>
  ) : (
    <View style={styles.completeCard}>
      <Text style={styles.completeTitle}>두 번의 주행 체험을 마쳤습니다.</Text>
      <Text style={styles.completeText}>서류 탭에서 할인 신청 결과를 확인해 주세요.</Text>
    </View>
  );

  return (
    <AppScreen
      footerPlacement="tabbed"
      contentContainerStyle={styles.screen}
      fixedFooter={footer}
      testID="drive-screen"
    >
      <ScreenHeader title="주행" onBack={() => router.replace("/(tabs)/home")} />
      <View style={styles.policyLine}>
        <View style={styles.policyIcon}><Text style={styles.policyIconText}>▣</Text></View>
        <Text style={styles.policyText}>미래손해보험 · 안전운전 할인특약</Text>
      </View>
      <Text style={styles.title}>내 안전운전 현황</Text>
      <View style={styles.scoreBlock}>
        <Text style={styles.score}>{state.tripsCompleted === 0 ? "--점" : `${state.totals.score}점`}</Text>
        <Text style={styles.scoreHelper}>{state.tripsCompleted === 0 ? "첫 주행 후 점수를 확인할 수 있어요" : "현재 점수 · 100점 만점"}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{state.tripsCompleted === 0 ? "할인 조건 · 점수 확인" : "할인 조건 · 점수 충족"}</Text>
          <Text style={[styles.successBadge, !scoreMet && styles.neutralBadge]}>{scoreMet ? "점수 충족" : state.tripsCompleted === 0 ? "측정 전" : "미충족"}</Text>
        </View>
        <View style={styles.progressSpace}><ProgressBar progress={progress} /></View>
        <View style={styles.cardFooter}>
        <Text style={styles.cardDetail}>{live ? `서버 확정 누적 ${state.totals.distanceKm} km · ${scoreMet ? "조건 충족" : "조건 확인 중"}` : `누적 ${state.totals.distanceKm} / ${demoRule.minimumDistanceKm} km · 남은 거리 ${Math.max(demoRule.minimumDistanceKm - state.totals.distanceKm, 0)} km`}</Text>
          {!live ? <Text style={styles.percent}>{Math.round(progress * 100)}%</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>평가 기간</Text>
            <Text style={styles.cardDetailTop}>최근 운행을 기준으로 평가해요</Text>
          </View>
          <Text style={styles.day}>{live ? state.backendTarget?.evaluationPeriod : "최근 90일"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>주행 기록</Text>
        <Text style={styles.cardDetailTop}>최근 운행 {state.tripsCompleted}건 · 점수 변화 확인</Text>
      </View>
      {startError ? <Text accessibilityRole="alert" style={styles.error}>{startError}</Text> : null}

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 12 },
  policyLine: { alignItems: "center", flexDirection: "row", marginTop: 24 },
  policyIcon: { alignItems: "center", backgroundColor: "#E9F1FF", borderRadius: 999, height: 24, justifyContent: "center", width: 24 },
  policyIconText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  policyText: { ...typography.eyebrow, color: colors.primary, marginLeft: 8, flexShrink: 1 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  scoreBlock: { alignItems: "center", marginVertical: 22 },
  score: { ...typography.metric, color: colors.textPrimary, },
  scoreHelper: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 12, padding: 16 },
  cardHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  successBadge: { ...typography.badge, backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  neutralBadge: { backgroundColor: colors.background, color: colors.textSecondary },
  progressSpace: { marginTop: 15 },
  cardFooter: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 10 },
  cardDetail: { ...typography.caption, color: colors.textSecondary, },
  cardDetailTop: { ...typography.caption, color: colors.textSecondary, marginTop: 6 },
  percent: { ...typography.label, color: colors.primary, },
  day: { ...typography.label, color: colors.textPrimary },
  completeCard: { backgroundColor: colors.successBackground, borderRadius: 16, padding: 16 },
  completeTitle: { ...typography.cardTitle, color: colors.success, },
  completeText: { ...typography.body, color: colors.textSecondary, marginTop: 5 },
  error: { ...typography.caption, color: "#C12D39", marginTop: 8 },
});
