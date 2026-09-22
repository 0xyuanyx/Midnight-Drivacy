# Routes

Expo Router file routes (all headerless):

| URL | Entry | Layout / purpose |
| --- | --- | --- |
| `/` | `app/index.tsx` | Hydration redirect to onboarding or Home |
| `/onboarding` | `app/onboarding.tsx` | Consent start and bottom sheet |
| `/insurance` | `app/insurance.tsx` | 250ms local loading then insurance selection |
| `/home` | `app/(tabs)/home.tsx` | Tab: cumulative status and contextual action |
| `/drive` | `app/(tabs)/drive.tsx` | Tab: driving overview / entry point |
| `/application` | `app/(tabs)/application.tsx` | Tab: ineligible, eligible, pending, approved states |
| `/drive-session` → `/drive-processing` → `/drive-result` | matching app files | simulated driving loop |
| `/application-review` → `/application-submitted` → `/application-result` | matching app files | review, local pending, local demo approval |

The root Stack source is `app/_layout.tsx`; tab source is `app/(tabs)/_layout.tsx`. Tests live in `apps/mobile/tests/`, deliberately outside `app/` so Expo Router does not include test-only modules in production bundles.
