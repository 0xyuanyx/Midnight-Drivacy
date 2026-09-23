import type { TextStyle } from "react-native";

const regular = "Pretendard-Regular";
const semibold = "Pretendard-SemiBold";
const bold = "Pretendard-Bold";

function type(fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0): TextStyle {
  return { fontFamily, fontSize, lineHeight, letterSpacing, fontWeight: "normal" };
}

/** Semantic roles: screens may override color/alignment, never type metrics. */
export const typography = {
  display: type(bold, 30, 40, -0.6),
  title: type(bold, 24, 34, -0.4),
  sheetTitle: type(bold, 22, 32, -0.3),
  cardTitle: type(semibold, 16, 24),
  body: type(regular, 16, 25),
  caption: type(regular, 13, 20),
  label: type(semibold, 13, 20),
  badge: type(semibold, 11, 16),
  button: type(semibold, 16, 24),
  eyebrow: type(semibold, 11, 16),
  tab: type(semibold, 10, 14),
  metric: { ...type(bold, 40, 50, -0.8), fontVariant: ["tabular-nums"] } as TextStyle,
  metricSmall: { ...type(bold, 24, 32, -0.3), fontVariant: ["tabular-nums"] } as TextStyle,
  timer: { ...type(regular, 16, 25), fontVariant: ["tabular-nums"] } as TextStyle,
  wordmark: type(bold, 17, 24, -0.5),
};

export const textLayout = {
  titleGap: 8,
  descriptionGap: 8,
  sectionGap: 24,
  cardGap: 12,
  cardInset: 16,
  pageInset: 20,
} as const;
