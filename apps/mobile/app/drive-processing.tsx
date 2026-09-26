import { typography } from "@/theme/typography";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { StatusPill } from "@/components/StatusPill";
import { useAppState } from "@/state/app-provider";
import type { ProcessingStatus } from "@/api/driver-workflow";
import { colors } from "@/theme/tokens";

const PROCESSING_DELAY_MS = 650;

export default function DriveProcessing() {
  const router = useRouter();
  const { dispatch, state, backend } = useAppState();
  const live = state.source === "backend";
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.driveStage !== "processing") {
      router.replace("/(tabs)/drive");
      return;
    }

    if (live) {
      if (!backend) { setError("인증된 운행 연결을 확인할 수 없습니다."); return; }
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = async () => {
        try {
          await backend.workflow.endAndProcess();
          const view = await backend.workflow.poll();
          if (!active) return;
          setError(null);
          setStatus(view.status);
          if (view.status === "db-confirmed" && view.summary) {
            dispatch({ type: "COMPLETE_BACKEND_TRIP", summary: view.summary });
            router.replace("/drive-result");
            return;
          }
        } catch {
          if (!active) return;
          setError("처리 상태를 확인하지 못했습니다. 같은 운행을 다시 조회하고 있어요.");
        }
        if (active) timer = setTimeout(() => { void refresh(); }, 3000);
      };
      void refresh();
      return () => { active = false; if (timer) clearTimeout(timer); };
    }
    const timer = setTimeout(() => {
      dispatch({ type: "COMPLETE_TRIP" });
      router.replace("/drive-result");
    }, PROCESSING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [backend, dispatch, live, router, state.driveStage]);

  if (state.driveStage !== "processing") {
    return null;
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} scroll={false} testID="drive-processing-screen">
      <View style={styles.content}>
        <StatusPill tone="primary">주행 결과 처리</StatusPill>
        <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
        <Text style={styles.title}>주행 결과를 계산하고 있어요</Text>
        <Text style={styles.description}>{live ? (
          status === "calculated" ? "운행 계산을 마쳤어요. 증명 생성과 확정을 기다리고 있어요."
            : status === "proving" ? "운행 결과를 증명하고 있어요. 아직 결과가 확정되지 않았습니다."
              : status === "awaiting-wallet-approval" ? "월렛 승인을 기다리고 있어요. 승인 전에는 결과가 확정되지 않습니다."
            : status === "submitted" ? "거래가 제출됐어요. 체인 확인을 기다리고 있어요."
              : status === "chain-unknown" ? "체인 결과를 확인 중이에요. 새 운행을 만들지 않고 같은 작업을 조회합니다."
                : status === "db-pending" ? "체인 결과를 DB에 확정하고 있어요. 아직 주행 결과가 아닙니다."
                  : status === "failed" ? "처리에 실패했어요. 같은 운행의 상태를 다시 확인합니다."
                    : "서버에 운행 처리 상태를 확인하고 있어요. DB에 확정된 뒤 결과를 보여드려요."
        ) : "이 앱은 결정된 로컬 결과를 표시합니다. 실제 Midnight 증명, 체인 확인 또는 보험사 제출을 수행하지 않습니다."}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center" },
  content: { alignItems: "center" },
  spinner: { marginTop: 30 },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 26, textAlign: "center" },
  description: { ...typography.body, color: colors.textSecondary, marginTop: 8, maxWidth: 330, textAlign: "center" },
  error: { ...typography.caption, color: "#C12D39", marginTop: 12, textAlign: "center" },
});
