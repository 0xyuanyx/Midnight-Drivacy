import { typography } from "@/theme/typography";
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, tokens } from "@/theme/tokens";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface PrimaryButtonProps extends Omit<PressableProps, "children" | "style"> {
  title: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({
  accessibilityLabel,
  disabled = false,
  title,
  variant = "primary",
  style,
  ...pressableProps
}: PrimaryButtonProps) {
  const isGhost = variant === "ghost";
  const isDisabled = disabled === true;

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        isGhost && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === "primary" && styles.primaryText,
          variant === "secondary" && styles.secondaryText,
          isGhost && styles.ghostText,
          isDisabled && styles.disabledText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.ctaHeight,
    minWidth: tokens.minTouchTarget,
    width: "100%",
    borderRadius: tokens.ctaRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    backgroundColor: "#D4D8E0",
    borderColor: "#D4D8E0",
  },
  pressed: {
    opacity: 0.82,
  },
  text: { ...typography.button,
  },
  primaryText: {
    color: colors.surface,
  },
  secondaryText: {
    color: colors.primary,
  },
  ghostText: {
    color: colors.textSecondary,
  },
  disabledText: {
    color: colors.textSecondary,
  },
});
