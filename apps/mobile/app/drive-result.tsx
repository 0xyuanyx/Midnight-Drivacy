import { typography } from "@/theme/typography";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { elapsedLabel } from "@/components/DrivingRing";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoTrips } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { initialRouteForState } from "@/state/route-policy";
import { colors } from "@/theme/tokens";

export default function DriveResult() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const returning = useRef(false);

  useEffect(() => {
    if (state.driveStage !== "result" && !returning.current) router.replace(initialRouteForState(state));
  }, [router, state]);

  if (state.driveStage !== "result") return null;
  const trip = demoTrips[Math.max(state.tripsCompleted - 1, 0)];
  const previousScore = state.tripsCompleted === 1 ? null : demoTrips[0].cumulativeTotals.score;
  const live = state.source === "backend" && Boolean(state.backendSummary);

  function returnHome() {
    if (returning.current) return;
    returning.current = true;
    dispatch({ type: "DISMISS_TRIP_RESULT" });
    router.replace("/(tabs)/home");
  }

  return (
    <AppScreen
      fixedFooter={(
        <PrimaryButton
          title="홈으로 돌아가기"
          onPress={returnHome}
        />
      )}
      testID="drive-result-screen"
    >
      <ScreenHeader title="주행 체험" onBack={returnHome} />
      <PageEyebrow position="withBack">주행 처리 완료</PageEyebrow>
      <Text style={styles.title}>이번 주행 결과</Text>
      <View style={styles.resultHero}>
        <Text style={styles.delta}>{state.totals.score}점</Text>
        <Text style={styles.deltaHelper}>{live ? "서버 확정 점수" : previousScore === null ? "첫 주행 점수" : `${previousScore}점 → ${state.totals.score}점`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>주행 요약</Text>
        {state.tripStartedAt && state.tripEndedAt ? <View style={styles.row}><Text style={styles.label}>주행 시간</Text><Text style={styles.value}>{elapsedLabel(state.tripStartedAt, state.tripEndedAt)}</Text></View> : null}
        <View style={styles.row}><Text style={styles.label}>이번 거리</Text><Text style={styles.value}>{live ? state.backendSummary!.tripDistanceM / 1000 : trip.distanceKm} km</Text></View>
        <View style={styles.row}><Text style={styles.label}>누적 거리</Text><Text style={styles.value}>{state.totals.distanceKm} km</Text></View>
        <View style={styles.row}><Text style={styles.label}>현재 점수</Text><Text style={styles.value}>{state.totals.score}점</Text></View>
        <View style={styles.row}><Text style={styles.label}>처리 상태</Text><Text style={styles.successValue}>{live ? "DB 확정 완료" : "로컬 계산 완료"}</Text></View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>주행 체험을 반영했어요</Text>
        <Text style={styles.cardText}>주행 결과를 반영해 거리와 점수를 업데이트했어요.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>처리 정보</Text>
        <Text style={styles.cardText}>{live
          ? `확정 거래 ${state.backendSummary!.transactionId} · Rule v${state.backendSummary!.ruleVersion}. 보험사 할인 적용 결정은 별도 단계예요.`
          : "실제 위치 수집, Midnight 증명, 체인 확인이나 보험사 제출은 수행하지 않았어요."}</Text>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  resultHero: { alignItems: "center", marginVertical: 24 },
  delta: { ...typography.metric, color: colors.primary, },
  deltaHelper: { ...typography.caption, color: colors.textSecondary, marginTop: 7 },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 12, padding: 16 },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 11 },
  label: { ...typography.caption, color: colors.textSecondary, },
  value: { ...typography.label, color: colors.textPrimary, },
  successValue: { ...typography.label, color: colors.success, },
  cardText: { ...typography.caption, color: colors.textSecondary, marginTop: 7 },
});
