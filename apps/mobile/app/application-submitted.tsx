import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { InfoCard } from "@/components/InfoCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

export default function ApplicationSubmitted() {
  const router = useRouter();
  const { dispatch, state } = useAppState();

  if (state.applicationStage !== "pending") {
    return (
      <AppScreen contentContainerStyle={styles.screen} testID="application-submitted-guard-screen">
        <StatusPill tone="neutral">신청 상태</StatusPill>
        <Text style={styles.title}>신청 상태를 다시 확인해 주세요</Text>
        <Text style={styles.description}>이 화면은 대기 중인 로컬 데모 신청에서만 열립니다.</Text>
        <View style={styles.footer}>
          <PrimaryButton title="할인 신청으로 돌아가기" onPress={() => router.replace("/(tabs)/application")} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="application-submitted-screen">
      <PrimaryButton title="뒤로" variant="ghost" onPress={() => router.back()} style={styles.backButton} />
      <StatusPill tone="primary">심사 대기</StatusPill>
      <Text style={styles.title}>보험사 심사 대기 중</Text>
      <Text style={styles.description}>로컬 데모에서 제출 후 심사 대기 상태를 보여줍니다.</Text>

      <View style={styles.applicationCard}>
        <Text style={styles.cardLabel}>신청 번호</Text>
        <Text style={styles.cardValue}>DR-DEMO-001</Text>
        <Text style={styles.cardHelper}>2026.09.22 10:00 신청한 데모 건</Text>
      </View>

      <InfoCard title="중요 안내">
        실제 보험사 제출·심사·결정이 이루어진 것은 아닙니다. 아래 버튼은 로컬 데모 결과를 반영하는 동작입니다.
      </InfoCard>

      <View style={styles.footer}>
        <PrimaryButton
          title="데모 결과 반영"
          onPress={() => {
            dispatch({ type: "APPROVE_APPLICATION" });
            router.replace("/application-result");
          }}
        />
        <PrimaryButton title="할인 신청으로 돌아가기" variant="ghost" onPress={() => router.replace("/(tabs)/application")} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 20 },
  backButton: { alignSelf: "flex-start", marginBottom: 8, width: "auto" },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800", lineHeight: 36, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
  applicationCard: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 28, padding: 20 },
  cardLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  cardValue: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 8 },
  cardHelper: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 28 },
});
