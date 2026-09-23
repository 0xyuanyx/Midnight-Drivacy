import { typography } from "@/theme/typography";
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
  wordmark: { ...typography.wordmark, color: colors.textPrimary, },
  accent: { color: colors.primary },
});
