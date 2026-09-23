# Theme

## Token summary

| Token | Value |
| --- | --- |
| Background / surface | `#F2F2F7` / `#FFFFFF` |
| Primary | `#2E6EED` |
| Text | `#1E1E1E`, secondary `#66758C` |
| Success | `#2E9D65`, background `#EAF8F0` |
| Font | `Pretendard, System` |
| Card radius | `16` (screens sometimes use `20`) |
| CTA | 54px height, 27px radius; minimum touch target 44px |
| Layout | screen max width 520px, 24px horizontal/vertical padding |

## Raw source — `apps/mobile/src/theme/tokens.ts`

```ts
export const colors = { background: "#F2F2F7", surface: "#FFFFFF", primary: "#2E6EED", textPrimary: "#1E1E1E", textSecondary: "#66758C", success: "#2E9D65", successBackground: "#EAF8F0" } as const;
export const tokens = { colors, cardRadius: 16, ctaHeight: 54, ctaRadius: 27, minTouchTarget: 44, fontFamily: "Pretendard, System" } as const;
```

No CSS variables, Tailwind configuration, or theme provider exists; styling is local React Native `StyleSheet` code using these tokens.
