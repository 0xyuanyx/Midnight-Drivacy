import { typography } from "@/theme/typography";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DemoPolicy } from "@/fixtures/demo";
import { colors } from "@/theme/tokens";

export interface PolicyCardProps {
  onPress: () => void;
  policy: DemoPolicy;
  selected: boolean;
}

export function PolicyCard({ onPress, policy, selected }: PolicyCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${policy.productName}${selected ? ", 선택됨" : ""}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selectedCard,
        pressed && styles.pressed,
      ]}
      testID="policy-card"
    >
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.insurer}>{policy.insurerName}</Text>
          <Text style={styles.product}>{policy.productName}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{policy.statusLabel}</Text>
        </View>
      </View>
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>차량</Text>
          <Text style={styles.detailValue}>{policy.vehicleNumber}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>보험기간</Text>
          <Text style={styles.detailValue}>{policy.coveragePeriod}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: "transparent",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  selectedCard: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.86,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    justifyContent: "space-between",
  },
  insurer: { ...typography.cardTitle,
    color: colors.textPrimary,
  },
  product: { ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: colors.successBackground,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { ...typography.badge,
    color: colors.success,
  },
  details: {
    gap: 6,
    marginTop: 17,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    justifyContent: "space-between",
  },
  detailLabel: { ...typography.caption,
    color: colors.textSecondary,
  },
  detailValue: { ...typography.label,
    color: colors.textPrimary,
  },
});
