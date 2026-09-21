import { StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

interface ProgressBarProps {
  progress: number;
  testID?: string;
}

export function ProgressBar({ progress, testID }: ProgressBarProps) {
  const normalizedProgress = Math.max(0, Math.min(progress, 1));

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: normalizedProgress * 100 }} style={styles.track} testID={testID}>
      <View style={[styles.fill, { width: `${normalizedProgress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: "#E2E7F0",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: "100%",
  },
});
