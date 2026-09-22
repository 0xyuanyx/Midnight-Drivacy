# Layouts

## `apps/mobile/src/components/AppScreen.tsx` — safe scrollable screen shell

```tsx
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";
interface AppScreenProps { children: React.ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; scroll?: boolean; testID?: string; }
export function AppScreen({ children, contentContainerStyle, scroll = true, testID }: AppScreenProps) {
  const content = <View style={[styles.content, contentContainerStyle]} testID={testID}>{children}</View>;
  return <SafeAreaView style={styles.safeArea}>{scroll ? <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}</SafeAreaView>;
}
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.background }, scrollContent: { flexGrow: 1 }, content: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 24 } });
```

## `apps/mobile/src/components/BottomTabBar.tsx` — persistent three-tab navigation

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, tokens } from "@/theme/tokens";
const tabs = [{ id: "home", label: "홈", icon: "⌂", href: "/home" }, { id: "drive", label: "주행", icon: "◌", href: "/drive" }, { id: "application", label: "할인 신청", icon: "%", href: "/application" }] as const;
function isActivePath(pathname: string, href: (typeof tabs)[number]["href"]) { return pathname === href || pathname === `/(tabs)${href}`; }
export function BottomTabBar() { const pathname = usePathname(); const router = useRouter(); return <SafeAreaView edges={["bottom"]} style={styles.safeArea}><View accessibilityRole="tablist" style={styles.tabBar}>{tabs.map((tab) => { const selected = isActivePath(pathname, tab.href); return <Pressable accessibilityLabel={tab.label} accessibilityRole="tab" accessibilityState={{ selected }} key={tab.id} onPress={() => router.replace(tab.href as never)} style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]} testID={`bottom-tab-${tab.id}`}><Text style={[styles.icon, selected && styles.selectedText]}>{tab.icon}</Text><Text style={[styles.label, selected && styles.selectedText]}>{tab.label}</Text></Pressable>; })}</View></SafeAreaView>; }
const styles = StyleSheet.create({ safeArea: { backgroundColor: colors.surface }, tabBar: { alignItems: "center", borderTopColor: "#E7EAF0", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10 }, tab: { alignItems: "center", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: tokens.minTouchTarget, paddingHorizontal: 4, paddingVertical: 6 }, tabSelected: { backgroundColor: "#EAF0FF" }, tabPressed: { opacity: 0.76 }, icon: { color: colors.textSecondary, fontSize: 17, fontWeight: "800", lineHeight: 19 }, label: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 1 }, selectedText: { color: colors.primary } });
```

## `apps/mobile/app/_layout.tsx` — application root

```tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "@/state/app-provider";
export default function RootLayout() { return <AppProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></AppProvider>; }
```

## `apps/mobile/app/(tabs)/_layout.tsx` — tab router

```tsx
import { Tabs } from "expo-router";
import { BottomTabBar } from "@/components/BottomTabBar";
export default function TabLayout() { return <Tabs screenOptions={{ headerShown: false }} tabBar={() => <BottomTabBar />}><Tabs.Screen name="home" /><Tabs.Screen name="drive" /><Tabs.Screen name="application" /></Tabs>; }
```
