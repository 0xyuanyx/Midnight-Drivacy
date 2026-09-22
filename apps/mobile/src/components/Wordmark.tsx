import { StyleSheet, Text, type TextStyle, type StyleProp } from "react-native";

import { colors } from "@/theme/tokens";

export function Wordmark({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityLabel="DriVacy" accessibilityRole="text" style={[styles.wordmark, style]}>
      Dri<Text style={styles.accent}>V</Text>acy
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: { color: colors.textPrimary, fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
  accent: { color: colors.primary },
});
