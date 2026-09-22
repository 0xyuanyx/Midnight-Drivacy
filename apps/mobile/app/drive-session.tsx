import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
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

      <View style={styles.ring}>
        <View style={styles.ringInner}>
          <Text style={styles.distance}>12.4 km</Text>
          <Text style={styles.time}>00:18:32</Text>
        </View>
      </View>

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
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: "800", letterSpacing: -0.7, marginTop: 8 },
  ring: { alignItems: "center", alignSelf: "center", borderColor: "#DDE8FF", borderRadius: 999, borderWidth: 18, height: 208, justifyContent: "center", marginVertical: 28, width: 208 },
  ringInner: { alignItems: "center", borderColor: colors.primary, borderRadius: 999, borderRightWidth: 8, borderTopWidth: 8, height: 190, justifyContent: "center", transform: [{ rotate: "8deg" }], width: 190 },
  distance: { color: colors.textPrimary, fontSize: 31, fontWeight: "900", letterSpacing: -0.8, transform: [{ rotate: "-8deg" }] },
  time: { color: colors.textSecondary, fontSize: 12, marginTop: 7, transform: [{ rotate: "-8deg" }] },
  notice: { flexDirection: "row", marginBottom: 14 },
  noticeLine: { backgroundColor: colors.primary, borderRadius: 2, width: 3 },
  noticeCopy: { flex: 1, marginLeft: 12 },
  noticeTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  noticeText: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 5 },
  card: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", justifyContent: "space-between", marginBottom: 10, padding: 16 },
  cardTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  normalBadge: { backgroundColor: colors.successBackground, borderRadius: 999, color: colors.success, fontSize: 9, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  uploadCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", padding: 16 },
  uploadIcon: { alignItems: "center", backgroundColor: "#EAF2FF", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  uploadIconText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  uploadCopy: { flex: 1, marginLeft: 12 },
  cardHelper: { color: colors.textSecondary, fontSize: 10, marginTop: 5 },
});
