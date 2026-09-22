import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoTrips } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function DriveResult() {
  const router = useRouter();
  const { dispatch, state } = useAppState();

  useEffect(() => {
    if (state.driveStage !== "result") router.replace("/(tabs)/drive");
  }, [router, state.driveStage]);

  if (state.driveStage !== "result") return null;
  const trip = demoTrips[Math.max(state.tripsCompleted - 1, 0)];
  const previousScore = state.tripsCompleted === 1 ? 100 : demoTrips[0].cumulativeTotals.score;
  const scoreDelta = state.totals.score - previousScore;

  function returnHome() {
    dispatch({ type: "DISMISS_TRIP_RESULT" });
    router.replace("/(tabs)/home");
  }

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          title="홈으로 돌아가기"
          onPress={returnHome}
        />
      )}
      testID="drive-result-screen"
    >
      <ScreenHeader title="모의 주행" onBack={returnHome} />
      <PageEyebrow position="withBack">주행 처리 완료</PageEyebrow>
      <Text style={styles.title}>이번 주행 결과</Text>
      <View style={styles.resultHero}>
        <Text style={styles.delta}>{scoreDelta > 0 ? "+" : ""}{scoreDelta}점</Text>
        <Text style={styles.deltaHelper}>{previousScore}점 → {state.totals.score}점</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>주행 요약</Text>
        <View style={styles.row}><Text style={styles.label}>이번 거리</Text><Text style={styles.value}>{trip.distanceKm} km</Text></View>
        <View style={styles.row}><Text style={styles.label}>누적 거리</Text><Text style={styles.value}>{state.totals.distanceKm} km</Text></View>
        <View style={styles.row}><Text style={styles.label}>현재 점수</Text><Text style={styles.value}>{state.totals.score}점</Text></View>
        <View style={styles.row}><Text style={styles.label}>처리 상태</Text><Text style={styles.successValue}>로컬 계산 완료</Text></View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>모의 주행을 반영했어요</Text>
        <Text style={styles.cardText}>결정된 데모 기록으로 거리와 점수를 업데이트했어요.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>데모 처리 범위</Text>
        <Text style={styles.cardText}>실제 위치 수집, Midnight 증명, 체인 확인이나 보험사 제출은 수행하지 않았어요.</Text>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 24 },
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: "800", letterSpacing: -0.7, marginTop: 8 },
  resultHero: { alignItems: "center", marginVertical: 24 },
  delta: { color: colors.primary, fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  deltaHelper: { color: colors.textSecondary, fontSize: 11, marginTop: 7 },
  card: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10, padding: 16 },
  cardTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 11 },
  label: { color: colors.textSecondary, fontSize: 10 },
  value: { color: colors.textPrimary, fontSize: 10, fontWeight: "800" },
  successValue: { color: colors.success, fontSize: 10, fontWeight: "800" },
  cardText: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 7 },
});
