import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DemoPolicy } from "@/fixtures/demo";
import { colors, tokens } from "@/theme/tokens";

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
        <Text style={styles.insurer}>{policy.insurerName}</Text>
        <View style={[styles.radio, selected && styles.selectedRadio]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </View>
      <Text style={styles.product}>{policy.productName}</Text>
      <Text style={styles.rider}>{policy.riderName}</Text>
      <View style={styles.divider} />
      <View style={styles.cardFooter}>
        <Text style={styles.footerLabel}>가입 가능한 특약</Text>
        <Text style={styles.footerValue}>{policy.riderName}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: "transparent",
    borderRadius: tokens.cardRadius,
    borderWidth: 2,
    marginBottom: 12,
    padding: 18,
  },
  selectedCard: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.86,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  insurer: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  product: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  rider: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  divider: {
    backgroundColor: "#ECEEF3",
    height: 1,
    marginVertical: 16,
  },
  cardFooter: {
    gap: 4,
  },
  footerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  footerValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  radio: {
    alignItems: "center",
    borderColor: "#C4CAD4",
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  selectedRadio: {
    borderColor: colors.primary,
  },
  radioDot: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
});
