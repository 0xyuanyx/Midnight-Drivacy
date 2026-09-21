import { StyleSheet, Text } from "react-native";

import { AppScreen } from "@/components/AppScreen";
import { StatusPill } from "@/components/StatusPill";
import { colors } from "@/theme/tokens";

/** Task 4 owns the real discount-application flow. This route only keeps the tab shell complete. */
export default function ApplicationPlaceholder() {
  return (
    <AppScreen contentContainerStyle={styles.screen}>
      <StatusPill tone="primary">할인 신청</StatusPill>
      <Text style={styles.title}>할인 신청을 준비하고 있어요</Text>
      <Text style={styles.description}>이 탭의 신청·심사 화면은 다음 데모 단계에서 연결됩니다.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: 27, fontWeight: "800", lineHeight: 36, marginTop: 20 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },
});
