# Final driving lifecycle fix report

## Revision

- Base: `af37e52 fix(mobile): guard onboarding and persisted state`
- Head: `HEAD` at `fix(mobile): guard simulated trip lifecycle`

## RED → GREEN

1. Added lifecycle expectations before production changes: a valid trip must transition `idle → active → processing → result`; direct `COMPLETE_TRIP` must be a no-op; and focused drive routes must agree with persisted stage.
2. Updated screen regressions before implementation: Driving dispatches `START_TRIP`, an active session dispatches `FINISH_TRIP`, direct idle processing redirects without dispatch, and the session must expose a scroll container around its CTA.
3. RED command: `npm run mobile:test -- app-state.test.ts route-policy.test.ts drive-flow.test.tsx --runInBand`
   - Failed as expected: `driveStage` was missing, unrecognized lifecycle actions returned no state, direct processing dispatched `COMPLETE_TRIP`, and the non-scroll session lacked `drive-session-scroll`.
4. GREEN implementation: persisted `driveStage` plus guarded `START_TRIP`, `FINISH_TRIP`, `COMPLETE_TRIP`, and result-dismissal actions; stage-aware route policy; defensive screen redirects; delayed valid processing consumption; and a scroll-safe session layout.
5. GREEN command: `npm run mobile:test -- app-state.test.ts route-policy.test.ts drive-flow.test.tsx --runInBand`
   - Passed: 3 suites, 24 tests.

## Verification

| Command | Result |
| --- | --- |
| `npm run mobile:test -- app-state.test.ts route-policy.test.ts drive-flow.test.tsx --runInBand` | PASS — 3 suites, 24 tests |
| `npm run mobile:test -- --runInBand` | PASS — 7 suites, 45 tests |
| `npm run mobile:typecheck` | PASS |
| `npm run lint --workspace=@drivacy/mobile` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | Pending final staged check before commit |

## Behavioral boundary

- Only a persisted `processing` session can advance the deterministic totals. Direct or remounted invalid processing cannot mutate them.
- Direct focused-drive URLs resolve to the matching persisted stage or safely redirect to the Driving tab. A persisted active, processing, or result state remains resumable.
- The active-session screen scrolls so its simulation detail and 54 px finish CTA remain reachable on short displays or at larger system text sizes.
