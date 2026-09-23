# Extractable components

## AppScreen

- Source: `apps/mobile/src/components/AppScreen.tsx`
- Category: layout
- Description: centered, safe-area, optional-scroll page surface.
- Extractable props: `scroll` (boolean, default true), `contentContainerStyle`.
- Hardcoded: background token, 520px max width, 24px padding, hidden scroll indicator.

## BottomTabBar

- Source: `apps/mobile/src/components/BottomTabBar.tsx`
- Category: layout
- Description: three-destination bottom navigation driven by pathname.
- Extractable props: `activeItem` / active pathname, navigation callbacks.
- Hardcoded: Korean labels, ⌂/◌/% icons, Home/Drive/Application routes, styling.

## PrimaryButton

- Source: `apps/mobile/src/components/PrimaryButton.tsx`
- Category: basic
- Description: accessible 54px full-width CTA with primary, secondary, and ghost variants.
- Extractable props: `title`, `variant`, `disabled`.
- Hardcoded: blue, white, and muted visual treatments.

## PolicyCard

- Source: `apps/mobile/src/components/PolicyCard.tsx`
- Category: basic
- Description: radio-style insurance policy selector.
- Extractable props: `policy`, `selected`, `onPress`.
- Hardcoded: product metadata layout and card styling.

## MetricCard, InfoCard, StatusPill, ProgressBar, BrandMark

- Sources: corresponding files in `apps/mobile/src/components/`.
- Category: basic.
- Description: reusable summary metric, explanatory card, status badge, accessible progress track, and wordmark.
- Extractable props: labels/values/tone/progress/compact as appropriate.
- Hardcoded: token-based surface, typography, compact success/primary treatments, and Drivacy mark.
