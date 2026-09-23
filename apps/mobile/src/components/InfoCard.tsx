import { typography } from "@/theme/typography";
import { StyleSheet, Text, View } from "react-native";

import { colors, tokens } from "@/theme/tokens";

interface InfoCardProps {
  title: string;
  children: React.ReactNode;
}

export function InfoCard({ title, children }: InfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: tokens.cardRadius,
    padding: 18,
  },
  title: { ...typography.cardTitle,
    color: colors.textPrimary,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
