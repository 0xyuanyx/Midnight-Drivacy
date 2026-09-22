import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";
import { typography } from "@/theme/typography";

export function elapsedLabel(start: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

export function DrivingRing({ startedAt }: { startedAt?: number }) {
  const fallbackStart = useRef(Date.now()).current;
  const start = startedAt ?? fallbackStart;
  const [now, setNow] = useState(Date.now);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active" || AppState.currentState == null);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const lifecycle = AppState.addEventListener("change", value => {
      setForeground(value === "active");
      if (value === "active") setNow(Date.now());
    });
    return () => { mounted = false; motion.remove(); lifecycle.remove(); };
  }, []);

  useEffect(() => {
    if (!foreground) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [foreground]);

  useEffect(() => {
    if (reduceMotion || !foreground) return;
    const loop = Animated.loop(Animated.timing(rotation, {
      toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    loop.start();
    return () => { loop.stop(); rotation.setValue(0); };
  }, [foreground, reduceMotion, rotation]);

  return (
    <View style={styles.ring}>
      <View style={styles.track} />
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.arc, {
        transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
      }]} />
      <Text style={styles.label}>주행 시간</Text>
      <Text accessibilityLabel={`주행 시간 ${elapsedLabel(start, now)}`} style={styles.time}>{elapsedLabel(start, now)}</Text>
      <Text style={styles.caption}>기록 수집 중</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center", alignSelf: "center", width: 220, height: 220, marginVertical: 28 },
  track: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderColor: "#DDE8FF", borderWidth: 12, borderRadius: 110 },
  arc: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderColor: "transparent", borderTopColor: colors.primary, borderRightColor: colors.primary, borderWidth: 12, borderRadius: 110 },
  label: { ...typography.caption, color: colors.textSecondary },
  time: { ...typography.metricSmall, color: colors.textPrimary, marginTop: 8 },
  caption: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
});
