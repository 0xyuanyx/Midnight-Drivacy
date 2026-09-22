import { typography } from "@/theme/typography";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { DrivingRing } from "@/components/DrivingRing";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function DriveSession() {
  const router = useRouter();
  const { dispatch, state } = useAppState();

  useEffect(() => {
    if (state.driveStage !== "active") router.replace("/(tabs)/drive");
  }, [router, state.driveStage]);

  if (state.driveStage !== "active") return null;

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          title="주행 종료"
          onPress={() => {
            dispatch({ type: "FINISH_TRIP" });
            router.replace("/drive-processing");
          }}
        />
      )}
      scrollTestID="drive-session-scroll"
      testID="drive-session-screen"
    >
      <ScreenHeader title="모의 주행" />
      <PageEyebrow position="withBack">모의 주행 중</PageEyebrow>
      <Text style={styles.title}>기록을 수집하고 있어요</Text>

      <DrivingRing startedAt={state.tripStartedAt} />

      <View style={styles.notice}>
        <View style={styles.noticeLine} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>이 운행의 기록은 점수 계산에만 사용돼요.</Text>
          <Text style={styles.noticeText}>실제 위치를 수집하지 않는 로컬 모의 주행이며, 보험사 제출도 수행하지 않아요.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>수집 상태</Text>
        <Text style={styles.normalBadge}>정상</Text>
      </View>
      <View style={styles.uploadCard}>
        <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>↑</Text></View>
        <View style={styles.uploadCopy}>
          <Text style={styles.cardTitle}>추가로 제출할 서류가 있나요?</Text>
          <Text style={styles.cardHelper}>현재 데모에서는 파일을 전송하지 않아요.</Text>
        </View>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 24 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 8 },
  notice: { flexDirection: "row", marginBottom: 14 },
  noticeLine: { backgroundColor: colors.primary, borderRadius: 2, width: 3 },
  noticeCopy: { flex: 1, marginLeft: 12 },
  noticeTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  noticeText: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  card: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", justifyContent: "space-between", marginBottom: 12, padding: 16 },
  cardTitle: { ...typography.cardTitle, color: colors.textPrimary, },
  normalBadge: { ...typography.badge, backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  uploadCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", padding: 16 },
  uploadIcon: { alignItems: "center", backgroundColor: "#EAF2FF", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  uploadIconText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  uploadCopy: { flex: 1, marginLeft: 12 },
  cardHelper: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
});
