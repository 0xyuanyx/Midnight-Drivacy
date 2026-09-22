# Shared UI primitives

The Expo Router app uses custom React Native primitives; it has no third-party component library.

## `apps/mobile/src/components/PrimaryButton.tsx` — CTA button

```tsx
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { colors, tokens } from "@/theme/tokens";
type ButtonVariant = "primary" | "secondary" | "ghost";
export interface PrimaryButtonProps extends Omit<PressableProps, "children" | "style"> { title: string; variant?: ButtonVariant; style?: StyleProp<ViewStyle>; }
export function PrimaryButton({ accessibilityLabel, disabled = false, title, variant = "primary", style, ...pressableProps }: PrimaryButtonProps) {
  const isGhost = variant === "ghost"; const isDisabled = disabled === true;
  return <Pressable {...pressableProps} accessibilityLabel={accessibilityLabel ?? title} accessibilityRole="button" accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} style={({ pressed }) => [styles.base, variant === "primary" && styles.primary, variant === "secondary" && styles.secondary, isGhost && styles.ghost, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]}><Text style={[styles.text, variant === "primary" && styles.primaryText, variant === "secondary" && styles.secondaryText, isGhost && styles.ghostText, isDisabled && styles.disabledText]}>{title}</Text></Pressable>;
}
const styles = StyleSheet.create({ base: { minHeight: tokens.ctaHeight, minWidth: tokens.minTouchTarget, width: "100%", borderRadius: tokens.ctaRadius, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }, primary: { backgroundColor: colors.primary }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }, ghost: { backgroundColor: "transparent" }, disabled: { backgroundColor: "#D4D8E0", borderColor: "#D4D8E0" }, pressed: { opacity: 0.82 }, text: { fontSize: 16, fontWeight: "700", lineHeight: 22 }, primaryText: { color: colors.surface }, secondaryText: { color: colors.primary }, ghostText: { color: colors.textSecondary }, disabledText: { color: colors.textSecondary } });
```

## `apps/mobile/src/components/StatusPill.tsx` — status badge

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";
type StatusPillTone = "neutral" | "primary" | "success";
export interface StatusPillProps { children: React.ReactNode; tone?: StatusPillTone; }
export function StatusPill({ children, tone = "neutral" }: StatusPillProps) { return <View style={[styles.pill, tone === "primary" && styles.primary, tone === "success" && styles.success]}><Text style={[styles.text, tone === "primary" && styles.primaryText, tone === "success" && styles.successText]}>{children}</Text></View>; }
const styles = StyleSheet.create({ pill: { alignSelf: "flex-start", backgroundColor: "#E7EAF0", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }, primary: { backgroundColor: "#EAF0FF" }, success: { backgroundColor: colors.successBackground }, text: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" }, primaryText: { color: colors.primary }, successText: { color: colors.success } });
```

## `apps/mobile/src/components/PolicyCard.tsx` — selectable insurance policy

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DemoPolicy } from "@/fixtures/demo";
import { colors, tokens } from "@/theme/tokens";
export interface PolicyCardProps { onPress: () => void; policy: DemoPolicy; selected: boolean; }
export function PolicyCard({ onPress, policy, selected }: PolicyCardProps) { return <Pressable accessibilityLabel={`${policy.productName}${selected ? ", 선택됨" : ""}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.card, selected && styles.selectedCard, pressed && styles.pressed]} testID="policy-card"><View style={styles.cardHeader}><Text style={styles.insurer}>{policy.insurerName}</Text><View style={[styles.radio, selected && styles.selectedRadio]}>{selected ? <View style={styles.radioDot} /> : null}</View></View><Text style={styles.product}>{policy.productName}</Text><Text style={styles.rider}>{policy.riderName}</Text><View style={styles.divider}/><View style={styles.cardFooter}><Text style={styles.footerLabel}>가입 가능한 특약</Text><Text style={styles.footerValue}>{policy.riderName}</Text></View></Pressable>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: "transparent", borderRadius: tokens.cardRadius, borderWidth: 2, marginBottom: 12, padding: 18 }, selectedCard: { borderColor: colors.primary }, pressed: { opacity: 0.86 }, cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, insurer: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" }, product: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 10 }, rider: { color: colors.primary, fontSize: 14, fontWeight: "700", marginTop: 6 }, divider: { backgroundColor: "#ECEEF3", height: 1, marginVertical: 16 }, cardFooter: { gap: 4 }, footerLabel: { color: colors.textSecondary, fontSize: 12 }, footerValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" }, radio: { alignItems: "center", borderColor: "#C4CAD4", borderRadius: 12, borderWidth: 2, height: 24, justifyContent: "center", width: 24 }, selectedRadio: { borderColor: colors.primary }, radioDot: { backgroundColor: colors.primary, borderRadius: 6, height: 12, width: 12 } });
```

## `apps/mobile/src/components/MetricCard.tsx` — compact metric card

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors, tokens } from "@/theme/tokens";
interface MetricCardProps { label: string; value: string; helper?: string; tone?: "default" | "success"; }
export function MetricCard({ label, value, helper, tone = "default" }: MetricCardProps) { return <View style={[styles.card, tone === "success" && styles.successCard]}><Text style={styles.label}>{label}</Text><Text style={[styles.value, tone === "success" && styles.successValue]}>{value}</Text>{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: tokens.cardRadius, flex: 1, minHeight: 112, padding: 16 }, successCard: { backgroundColor: colors.successBackground }, label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" }, value: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 10 }, successValue: { color: colors.success }, helper: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 5 } });
```

## `apps/mobile/src/components/InfoCard.tsx` — explanatory card

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors, tokens } from "@/theme/tokens";
interface InfoCardProps { title: string; children: React.ReactNode; }
export function InfoCard({ title, children }: InfoCardProps) { return <View style={styles.card}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{children}</Text></View>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: tokens.cardRadius, padding: 18 }, title: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" }, body: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 } });
```

## `apps/mobile/src/components/ProgressBar.tsx` — accessible progress track

```tsx
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";
interface ProgressBarProps { progress: number; testID?: string; }
export function ProgressBar({ progress, testID }: ProgressBarProps) { const normalizedProgress = Math.max(0, Math.min(progress, 1)); return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: normalizedProgress * 100 }} style={styles.track} testID={testID}><View style={[styles.fill, { width: `${normalizedProgress * 100}%` }]} /></View>; }
const styles = StyleSheet.create({ track: { backgroundColor: "#E2E7F0", borderRadius: 999, height: 8, overflow: "hidden", width: "100%" }, fill: { backgroundColor: colors.primary, borderRadius: 999, height: "100%" } });
```

## `apps/mobile/src/components/BrandMark.tsx` — logo lockup

```tsx
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";
export interface BrandMarkProps { compact?: boolean; }
export function BrandMark({ compact = false }: BrandMarkProps) { return <View accessibilityLabel="Drivacy" accessibilityRole="image" style={styles.row}><View style={[styles.mark, compact && styles.compactMark]}><Text style={[styles.markText, compact && styles.compactMarkText]}>D</Text></View><Text style={[styles.name, compact && styles.compactName]}>Drivacy</Text></View>; }
const styles = StyleSheet.create({ row: { alignItems: "center", flexDirection: "row", gap: 10 }, mark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, height: 48, justifyContent: "center", width: 48 }, compactMark: { borderRadius: 10, height: 32, width: 32 }, markText: { color: colors.surface, fontSize: 26, fontWeight: "800" }, compactMarkText: { fontSize: 18 }, name: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 }, compactName: { fontSize: 18 } });
```
