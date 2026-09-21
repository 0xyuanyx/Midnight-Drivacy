import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/tokens";

type StatusPillTone = "neutral" | "primary" | "success";

export interface StatusPillProps {
  children: React.ReactNode;
  tone?: StatusPillTone;
}

export function StatusPill({ children, tone = "neutral" }: StatusPillProps) {
  return (
    <View style={[styles.pill, tone === "primary" && styles.primary, tone === "success" && styles.success]}>
      <Text style={[styles.text, tone === "primary" && styles.primaryText, tone === "success" && styles.successText]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#E7EAF0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  primary: {
    backgroundColor: "#EAF0FF",
  },
  success: {
    backgroundColor: colors.successBackground,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryText: {
    color: colors.primary,
  },
  successText: {
    color: colors.success,
  },
});
