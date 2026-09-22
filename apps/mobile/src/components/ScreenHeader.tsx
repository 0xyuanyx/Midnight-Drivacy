import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { colors, tokens } from "@/theme/tokens";

export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="뒤로"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack ?? router.back}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", height: 44, justifyContent: "space-between" },
  back: {
    alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, height: tokens.minTouchTarget,
    justifyContent: "center", width: tokens.minTouchTarget,
  },
  backIcon: { color: colors.textPrimary, fontSize: 31, fontWeight: "300", lineHeight: 32, marginLeft: -2, marginTop: -2 },
  pressed: { opacity: 0.7 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  spacer: { height: tokens.minTouchTarget, width: tokens.minTouchTarget },
});
