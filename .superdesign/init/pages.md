# Page dependency trees

## `/onboarding`

Entry: `apps/mobile/app/onboarding.tsx`

- `src/components/AppScreen.tsx`
- `src/components/BrandMark.tsx`
- `src/components/PrimaryButton.tsx`
- `src/components/StatusPill.tsx`
- `src/state/app-provider.tsx`
  - `src/state/app-state.ts`
  - AsyncStorage
- `src/theme/tokens.ts`

## `/insurance`

Entry: `apps/mobile/app/insurance.tsx`

- `src/components/AppScreen.tsx`
- `src/components/PolicyCard.tsx`
- `src/components/PrimaryButton.tsx`
- `src/components/StatusPill.tsx`
- `src/fixtures/demo.ts`
- `src/state/app-provider.tsx`
- `src/theme/tokens.ts`

## `/home`, `/drive`, `/application` (tabs)

- `app/(tabs)/_layout.tsx`
  - `src/components/BottomTabBar.tsx`
  - `src/theme/tokens.ts`
- `home.tsx`
  - `AppScreen`, `InfoCard`, `MetricCard`, `PrimaryButton`, `ProgressBar`, `StatusPill`
  - `demo.ts`, `app-provider.tsx`, `tokens.ts`
- `drive.tsx`
  - `AppScreen`, `InfoCard`, `MetricCard`, `PrimaryButton`, `ProgressBar`, `StatusPill`
  - `demo.ts`, `app-provider.tsx`, `tokens.ts`
- `application.tsx`
  - `AppScreen`, `InfoCard`, `PrimaryButton`, `StatusPill`
  - `demo.ts`, `app-provider.tsx`, `tokens.ts`

## Driving and application detail routes

- `drive-session.tsx` → `AppScreen`, `PrimaryButton`, `ProgressBar`, `StatusPill`, `demo.ts`, `app-provider.tsx`, `tokens.ts`
- `drive-processing.tsx` → `AppScreen`, `StatusPill`, `app-provider.tsx`, `tokens.ts`
- `drive-result.tsx` → `AppScreen`, `InfoCard`, `MetricCard`, `PrimaryButton`, `StatusPill`, `demo.ts`, `app-provider.tsx`, `tokens.ts`
- `application-review.tsx`, `application-submitted.tsx`, `application-result.tsx` → `AppScreen`, `InfoCard`, `PrimaryButton`, `StatusPill`, `demo.ts`, `app-provider.tsx`, `tokens.ts`
