import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/tokens";

export interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <View accessibilityLabel="Drivacy" accessibilityRole="image" style={styles.row}>
      <View style={[styles.mark, compact && styles.compactMark]}>
        <Text style={[styles.markText, compact && styles.compactMarkText]}>D</Text>
      </View>
      <Text style={[styles.name, compact && styles.compactName]}>Dri<Text style={styles.accent}>V</Text>acy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row", flexWrap: "wrap",
    gap: 10,
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  compactMark: {
    borderRadius: 10,
    height: 32,
    width: 32,
  },
  markText: {
    color: colors.surface,
    fontSize: 26,
    fontWeight: "800",
  },
  compactMarkText: {
    fontSize: 18,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  compactName: {
    fontSize: 18,
  },
  accent: {
    color: colors.primary,
  },
});
