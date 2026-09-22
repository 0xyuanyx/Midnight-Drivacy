# Task 5 report — mobile integration, QA, and documentation

## Base / head

- Base: `eee4e99` (`feat(mobile): add discount application flow`)
- Head before this documentation commit: `eee4e99` plus the Task 5 changes listed below.

## Delivered

- Moved all five Expo UI tests from `apps/mobile/app/` to `apps/mobile/tests/`. Expo Router had treated route-tree tests as application modules, which broke iOS export by bundling the Node-only testing library. The 34 mobile tests continue to run from their new location.
- Changed `mobile:export` to the Expo CLI-supported `expo export --platform all`; it now verifies web, iOS, and Android bundles.
- Renamed the CommonJS Babel config to `babel.config.cjs` and scoped `module` as a readonly global for that exact config in flat ESLint, so workspace and root lint are clean.
- Fixed the browser-only semantic gap in the custom consent controls. The web variant exposes `aria-checked` and supports Enter/Space activation; native keeps the original `Pressable` implementation and accessibility state.
- Added all six required `.superdesign/init/` discovery files from the completed source. No Superdesign draft was generated because the supplied Figma remains authoritative.
- Updated `PROJECT_DIRECTION.md` and `README.md` for the actual Expo demo scope, deterministic local boundary, three-tab flow, commands, and verification limits.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run mobile:test -- --runInBand` | PASS — 6 suites, 34 tests |
| `npm run mobile:typecheck` | PASS |
| `npm run lint --workspace=@drivacy/mobile` | PASS |
| `cd apps/mobile && npx expo-doctor` | PASS — 21/21 checks |
| `npm run mobile:export` | PASS — Expo bundled iOS, Android, and web; 17 static web routes exported |
| `npm run build` | PASS — shared → rule-draft → backend ordering |
| `npm run typecheck` | PASS — shared, rule-draft, backend |
| `npm test` after `npm run build` | PASS — shared 34, rule-draft 38, backend 91 tests |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

The initial all-platform export failed because Expo Router included `app/*.test.tsx`; moving tests outside the route tree fixed it. A first web start from the monorepo root rendered a blank page because Expo selected the root and searched for `App`; starting via `npm run web --workspace=@drivacy/mobile` selected the correct app root. These were fixed before the final commands above.

## Visual QA evidence

Browser QA used the Expo web server launched from `@drivacy/mobile`.

- At **402×874**, exercised onboarding sheet and required consent, 250ms policy loading and one-policy radio selection, Home and selected tab state, both simulated drives, processing/result values (300 km / 92 then 550 km / 87), application review disclosure, local pending state, demo approval, and the 10% result. No clipping or unsafe bottom CTA placement observed.
- At **360×740** (Android-like), inspected the approved application result: long disclosure cards and the fixed bottom CTA remained visible without horizontal clipping.
- Browser accessibility inspection confirmed semantic buttons, radios, progress bars, tabs, disabled actions, and the repaired consent checkbox `aria-checked` state. Enter and Space activate the web consent checkbox.
- Copy consistently labels local demo behavior and says that actual insurer submission/decision, Midnight proof, chain confirmation, GPS collection, and precise route/location/speed/time sharing do not occur.

## Assumptions and remaining limitations

- This is browser QA only. No physical iOS/Android device, Expo Go application, wallet, insurer system, Supabase service, or Midnight product integration was exercised or claimed.
- The deterministic mock state persists only in local AsyncStorage. It uses three fixture policies, exactly two fixture trips, `DR-DEMO-001`, and a fixed demo time; none are production data.
- The root TypeScript 5.9 dependency remains unchanged. Expo’s required TypeScript 6.0.3 remains workspace-local under `apps/mobile`, which is why Expo Doctor passes without changing non-mobile compiler behavior.
- Pre-existing/non-blocking warnings recorded separately: `npm install` reports 16 moderate audit findings; Expo export sometimes reports the environment `NO_COLOR`/`FORCE_COLOR` warning; rule-draft PDF tests warn about `standardFontDataUrl` and PDF object indexing while all 38 tests pass.
