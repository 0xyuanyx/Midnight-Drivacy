import { StyleSheet, Text, type TextProps } from "react-native";

import { colors } from "@/theme/tokens";

type EyebrowPosition = "plain" | "withBack" | "afterWordmark";

export function PageEyebrow({ children, position = "plain", style, ...props }: TextProps & { position?: EyebrowPosition }) {
  return (
    <Text {...props} style={[styles.base, styles[position], style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  plain: { marginTop: 41 },
  withBack: { marginTop: 24 },
  afterWordmark: { marginTop: 24 },
});
