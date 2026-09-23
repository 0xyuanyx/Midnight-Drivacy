# Task 1 report — Expo workspace, theme, and deterministic state

## Delivered

- Added the `@drivacy/mobile` Expo Router workspace with root `mobile`, `mobile:test`, `mobile:typecheck`, and `mobile:export` commands.
- Installed SDK-compatible AsyncStorage and `expo-linear-gradient`, plus Jest Expo and React Native Testing Library.
- Added the Figma-derived theme tokens and an Expo Router root stack backed by `AppProvider`.
- Added deterministic fixtures: `0 km / 100 points`, then `300 km / 92 points`, then `550 km / 87 points / eligible / 10%`.
- Implemented the pure `appReducer`, guarded application stages, reset, and conservative persisted-state normalization. AsyncStorage only writes after hydration and derives totals from the trip fixture rather than stored display values.

## TDD evidence

The reducer test was created before the reducer or fixtures. Its RED command was:

```text
npm run mobile:test -- app-state.test.ts --runInBand
FAIL Cannot find module './app-state' from 'src/state/app-state.test.ts'
```

After implementation, the focused suite passed with 9 tests covering initial state, both fixture trips, the third-trip no-op, submission guard, pending, approval guard, reset, and persisted normalization.

## Verification

| Command | Result |
| --- | --- |
| `npm run mobile:test -- app-state.test.ts --runInBand` | Pass — 9 tests |
| `npm run mobile:typecheck` | Pass |
| `npm run lint --workspace=@drivacy/mobile` | Pass |
| `cd apps/mobile && npx expo-doctor` | Pass — 21/21 checks |
| `npm test` | Known pre-existing failure after shared 34/34, rule-draft 38/38, and backend 86 tests passed |

The root suite still does not build `@drivacy/rule-draft` before backend `rule-draft.test.ts` imports it. Vite consequently reports `Failed to resolve entry for package "@drivacy/rule-draft"`. This is the package-build-order issue documented in the task baseline and was not changed by the mobile work.

## Notes

- Root-level React and React DOM development pins match Expo SDK 57's React 19.2.3 requirement, avoiding npm-workspace duplicate native React resolutions; Expo Doctor is clean.
- `npm install` reported 16 moderate audit findings. No audit remediation was run because it is outside this task.
