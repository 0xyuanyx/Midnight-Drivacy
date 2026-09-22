import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/tokens";

interface AppScreenProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  scrollTestID?: string;
  testID?: string;
}

/** Shared safe-area surface for every mobile screen. */
export function AppScreen({
  children,
  contentContainerStyle,
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
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={scrollTestID}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
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
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
});
