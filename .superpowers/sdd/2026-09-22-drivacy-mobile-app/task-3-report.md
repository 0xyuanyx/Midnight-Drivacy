# Task 3 report — Home and driving flow

## Revision

- Base: `70a6711 fix(mobile): make consent sheet adaptive`
- Head: `HEAD` at `feat(mobile): implement home and driving flow`

## RED → GREEN evidence

1. Added `apps/mobile/app/home.test.tsx` and `apps/mobile/app/drive-flow.test.tsx` before Task 3 production routes/components.
2. RED command: `npm run mobile:test -- home.test.tsx drive-flow.test.tsx --runInBand`
   - Failed as expected with `Cannot find module './(tabs)/home'` and `Cannot find module './(tabs)/drive'`.
3. Implemented the custom three-tab shell, pathname-driven selected state, contextual Home, driving overview, focused simulated drive, one-shot local processing, result, and a non-functional application-tab placeholder.
4. GREEN command: `npm run mobile:test -- home.test.tsx drive-flow.test.tsx --runInBand`
   - Passed: 2 suites, 10 tests.

## Verification

| Command | Result |
| --- | --- |
| `npm run mobile:test -- home.test.tsx drive-flow.test.tsx --runInBand` | PASS — 2 suites, 10 tests |
| `npm run mobile:typecheck` | PASS |
| `npm run mobile:test -- --runInBand` | PASS — 5 suites, 27 tests |
| `npm run lint --workspace=@drivacy/mobile` | PASS |
| `npm run lint` | FAIL — pre-existing `apps/mobile/babel.config.js:1:1` `no-undef: 'module' is not defined` |
| `git diff --check` | PASS before staging; re-run after staging before commit |

The full lint failure is not introduced by Task 3: `apps/mobile/babel.config.js` is unchanged from Task 1 commit `67bb823` and uses CommonJS `module.exports`, while root ESLint does not define the Node global for that config file.

## Scope and assumptions

- The app remains a deterministic local demo: processing text explicitly excludes actual Midnight proof generation, chain confirmation, and insurer submission.
- `COMPLETE_TRIP` is protected by a per-screen ref and is dispatched once before navigation is replaced with the result screen; the reducer retains the separate two-trip cap.
- The `할인 신청` tab is intentionally only a harmless placeholder required for the three-tab shell. Task 4 owns the application flow.
- No `PROJECT_DIRECTION.md` or `README.md` change is needed for this implementation-only Task 3; project-direction updates are assigned to Task 5.

## Follow-up: Home must enter the Driving overview

- Base: `db67872 feat(mobile): implement home and driving flow`
- Head: `HEAD` at `fix(mobile): route home through driving overview`
- Regression test: changed the Home action expectation from `/drive-session` to `/drive`.
- RED: `npm run mobile:test -- home.test.tsx --runInBand` failed with expected `/drive` and received `/drive-session`.
- GREEN: changed only the Home CTA route for trips 0 and 1 to `/drive`; the trip-2 `/application` route remains unchanged.
- Verification: focused `home.test.tsx` passed (6 tests), all mobile tests passed (5 suites, 27 tests), and `npm run mobile:typecheck` passed.
