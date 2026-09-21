import { StyleSheet, Text, View } from "react-native";

import { colors, tokens } from "@/theme/tokens";

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "success";
}

export function MetricCard({ label, value, helper, tone = "default" }: MetricCardProps) {
  return (
    <View style={[styles.card, tone === "success" && styles.successCard]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === "success" && styles.successValue]}>{value}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: tokens.cardRadius,
    flex: 1,
    minHeight: 112,
    padding: 16,
  },
  successCard: {
    backgroundColor: colors.successBackground,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  value: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 10,
  },
  successValue: {
    color: colors.success,
  },
  helper: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
});
