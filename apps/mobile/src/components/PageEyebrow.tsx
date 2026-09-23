import { typography } from "@/theme/typography";
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
  base: { ...typography.eyebrow, color: colors.primary, },
  plain: { marginTop: 41 },
  withBack: { marginTop: 24 },
  afterWordmark: { marginTop: 17 },
});
