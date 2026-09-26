import { typography } from "@/theme/typography";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { DrivingRing } from "@/components/DrivingRing";
import { PageEyebrow } from "@/components/PageEyebrow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";
import { replayProgress } from "@/api/drive-replay";

export default function DriveSession() {
  const router = useRouter();
  const { dispatch, state, backend } = useAppState();
  const finishing = useRef(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [segmentTimings, setSegmentTimings] = useState<Array<{ index: number; durationSeconds: number }> | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (state.source !== "backend" || !backend || !state.backendSession) return;
    let active = true;
    const { sessionId, operationId } = state.backendSession;
    void backend.api.getDrivingSession(sessionId).then((input) => {
      const response = input as { sessionId?: string; trip?: { id?: string; records?: Array<{ index: number; durationSeconds: number }> } };
      if (response.sessionId !== sessionId || response.trip?.id !== operationId || !Array.isArray(response.trip.records)) {
        throw new Error("운행 기록이 일치하지 않습니다.");
      }
      replayProgress(response.trip.records, 0);
      if (active) setSegmentTimings(response.trip.records.map(({ index, durationSeconds }) => ({ index, durationSeconds })));
    }).catch(() => { if (active) setEndError("서버 운행 기록을 확인하지 못했습니다."); });
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - (state.tripStartedAt ?? Date.now())) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [backend, state.backendSession, state.source, state.tripStartedAt]);

  const liveReplay = segmentTimings ? replayProgress(segmentTimings, elapsedSeconds) : null;

  useEffect(() => {
    if (state.driveStage !== "active") router.replace("/(tabs)/drive");
  }, [router, state.driveStage]);

  if (state.driveStage !== "active") return null;

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={(
        <PrimaryButton
          disabled={state.source === "backend" && !liveReplay?.complete}
          title="주행 종료"
          onPress={async () => {
            if (finishing.current) return;
            finishing.current = true;
            if (state.source === "backend") {
              if (!backend) { setEndError("인증된 운행 연결을 확인할 수 없습니다."); finishing.current = false; return; }
              try {
                await backend.workflow.endAndProcess();
              } catch {
                const snapshot = await backend.workflow.snapshot();
                if (!snapshot?.endedAt) {
                  setEndError("운행을 종료하지 못했습니다. 다시 시도해 주세요.");
                  finishing.current = false;
                  return;
                }
              }
              dispatch({ type: "FINISH_BACKEND_TRIP", endedAt: Date.now() });
              router.replace("/drive-processing");
              return;
            }
            dispatch({ type: "FINISH_TRIP" });
            router.replace("/drive-processing");
          }}
        />
      )}
      scrollTestID="drive-session-scroll"
      testID="drive-session-screen"
    >
      <ScreenHeader title="주행 체험" onBack={() => router.replace("/(tabs)/drive")} />
      <PageEyebrow position="withBack">주행 체험 중</PageEyebrow>
      <Text style={styles.title}>기록을 수집하고 있어요</Text>

      <DrivingRing startedAt={state.tripStartedAt} />

      <View style={styles.notice}>
        <View style={styles.noticeLine} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>이 운행의 기록은 점수 계산에만 사용돼요.</Text>
          <Text style={styles.noticeText}>주행 체험에서는 위치 정보를 수집하지 않습니다.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>수집 상태</Text>
        <Text style={styles.normalBadge}>{state.source === "backend" ? `${liveReplay?.completed ?? 0}/${liveReplay?.total ?? "…"} 구간` : "정상"}</Text>
      </View>
      <View style={styles.uploadCard}>
        <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>↑</Text></View>
        <View style={styles.uploadCopy}>
          <Text style={styles.cardTitle}>추가로 제출할 서류가 있나요?</Text>
          <Text style={styles.cardHelper}>현재 파일 전송은 지원하지 않아요.</Text>
        </View>
      </View>
      {endError ? <Text accessibilityRole="alert" style={styles.error}>{endError}</Text> : null}

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
  error: { ...typography.caption, color: "#C12D39", marginTop: 12 },
});
