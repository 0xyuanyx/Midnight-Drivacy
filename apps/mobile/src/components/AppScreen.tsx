import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/tokens";

interface AppScreenProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  fixedFooter?: React.ReactNode;
  scroll?: boolean;
  scrollTestID?: string;
  testID?: string;
}

/** Shared safe-area surface for every mobile screen. */
export function AppScreen({
  children,
  contentContainerStyle,
  fixedFooter,
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
          contentContainerStyle={[styles.scrollContent, fixedFooter ? styles.scrollContentWithFooter : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={scrollTestID}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.nonScrollContent, fixedFooter ? styles.nonScrollContentWithFooter : null]}>{content}</View>
      )}
      {fixedFooter ? (
        <View pointerEvents="box-none" style={styles.fixedFooter}>
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
  scrollContentWithFooter: {
    paddingBottom: 82,
  },
  nonScrollContent: {
    flex: 1,
  },
  nonScrollContentWithFooter: {
    paddingBottom: 82,
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
    bottom: 0,
    left: 0,
    paddingBottom: 12,
    position: "absolute",
    right: 0,
  },
  fixedFooterInner: {
    maxWidth: 520,
    paddingHorizontal: 20,
    width: "100%",
  },
});
