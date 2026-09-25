import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/tokens";

interface AppScreenProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  fixedFooter?: React.ReactNode;
  footerPlacement?: "plain" | "tabbed";
  scroll?: boolean;
  scrollTestID?: string;
  testID?: string;
}

/** Shared safe-area surface for every mobile screen. */
export function AppScreen({
  children,
  contentContainerStyle,
  fixedFooter,
  footerPlacement = "plain",
  scroll = true,
  scrollTestID,
  testID,
}: AppScreenProps) {
  const content = (
    <View style={[styles.content, contentContainerStyle]} testID={testID}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          style={styles.viewport}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={scrollTestID}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.nonScrollContent}>{content}</View>
      )}
      {fixedFooter ? (
        <View style={[styles.fixedFooter, footerPlacement === "tabbed" ? styles.tabbedFooter : styles.plainFooter]} testID="app-screen-footer">
          <View style={styles.fixedFooterInner}>{fixedFooter}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  viewport: { flex: 1, minHeight: 0 },
  nonScrollContent: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  fixedFooter: {
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: colors.background,
    paddingTop: 12,
  },
  plainFooter: { paddingBottom: 48 },
  tabbedFooter: { paddingBottom: 12 },
  fixedFooterInner: {
    maxWidth: 520,
    paddingHorizontal: 20,
    width: "100%",
  },
});
