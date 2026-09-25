import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

/** A single completion symbol for finished in-app steps (not service verification). */
export function CompletionMark() {
  return (
    <View accessibilityLabel="단계 완료" style={styles.circle} testID="completion-mark">
      <Text style={styles.check}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.successBackground,
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    marginBottom: 28,
    width: 72,
  },
  check: { color: colors.success, fontSize: 38 },
});
