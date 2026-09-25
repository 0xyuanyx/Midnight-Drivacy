import { typography } from "@/theme/typography";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, tokens } from "@/theme/tokens";

type TabIcon = {
  active: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
  inactive: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
  fallback: string;
};

const tabs = [
  {
    id: "home",
    label: "홈",
    href: "/home",
    icon: {
      active: { ios: "house.fill", android: "home_filled", web: "home_filled" },
      inactive: { ios: "house", android: "home", web: "home" },
      fallback: "⌂",
    } satisfies TabIcon,
  },
  {
    id: "drive",
    label: "주행",
    href: "/drive",
    icon: {
      active: { ios: "car.fill", android: "directions_car_filled", web: "directions_car_filled" },
      inactive: { ios: "car", android: "directions_car", web: "directions_car" },
      fallback: "◉",
    } satisfies TabIcon,
  },
  {
    id: "application",
    label: "서류",
    href: "/application",
    icon: {
      active: { ios: "doc.text.fill", android: "description", web: "description" },
      inactive: { ios: "doc.text", android: "description", web: "description" },
      fallback: "▤",
    } satisfies TabIcon,
  },
] as const;

function isActivePath(pathname: string, href: (typeof tabs)[number]["href"]) {
  if (href === "/application" && pathname.startsWith("/application-")) {
    return true;
  }
  return pathname === href || pathname === `/(tabs)${href}`;
}

/** Floating iOS-style pill navigation shared by the three primary app tabs. */
export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea} testID="bottom-tab-safe-area">
      <View accessibilityRole="tablist" style={styles.tabBar} testID="bottom-tab-pill">
        {tabs.map((tab) => {
          const selected = isActivePath(pathname, tab.href);
          const tintColor = selected ? colors.primary : colors.textPrimary;

          return (
            <Pressable
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab.id}
              onPress={() => router.replace(tab.href as never)}
              style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]}
              testID={`bottom-tab-${tab.id}`}
            >
              <SymbolView
                fallback={<Text style={[styles.fallbackIcon, { color: tintColor }]}>{tab.icon.fallback}</Text>}
                name={selected ? tab.icon.active : tab.icon.inactive}
                size={18}
                tintColor={tintColor}
                type="monochrome"
                weight="semibold"
              />
              <Text style={[styles.label, selected && styles.selectedText]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    alignItems: "center",
    backgroundColor: colors.background,
    paddingBottom: 36,
    paddingTop: 6,
  },
  tabBar: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: "rgba(218, 221, 228, 0.92)",
    borderRadius: 29,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    flexDirection: "row",
    height: 56,
    justifyContent: "space-between",
    maxWidth: 330,
    minWidth: 280,
    padding: 4,
    shadowColor: "#172033",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: "82%",
  },
  tab: {
    alignItems: "center",
    borderRadius: 24,
    flex: 1,
    height: 48,
    justifyContent: "center",
    minWidth: tokens.minTouchTarget,
    paddingHorizontal: 6,
  },
  tabSelected: {
    backgroundColor: "#E8E9ED",
  },
  tabPressed: {
    opacity: 0.7,
  },
  fallbackIcon: {
    fontSize: 18,
    fontWeight: "800",
    height: 18,
    lineHeight: 18,
  },
  label: { ...typography.tab,
    color: colors.textPrimary,
    marginTop: 2,
  },
  selectedText: {
    color: colors.primary,
  },
});
