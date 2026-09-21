# Task 2 implementation report

## Status

Complete. Shared mobile UI primitives, onboarding consent, deterministic insurance loading, policy selection, and focused screen tests are implemented.

## Commit / base / head

- Base: `67bb8231830965de3ff8cadc4bbeed2f1b913a2e` (`feat(mobile): scaffold Expo app state`)
- Feature commit: `6fae5faeeeb668a9e0c28035194d341333ce4bf7` (`feat(mobile): add onboarding and insurance selection`)
- Implementation head at verification: `6fae5faeeeb668a9e0c28035194d341333ce4bf7`

## Files

Created:

- `apps/mobile/src/components/AppScreen.tsx`
- `apps/mobile/src/components/PrimaryButton.tsx`
- `apps/mobile/src/components/BrandMark.tsx`
- `apps/mobile/src/components/PolicyCard.tsx`
- `apps/mobile/src/components/StatusPill.tsx`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/insurance.tsx`
- `apps/mobile/app/onboarding.test.tsx`
- `apps/mobile/app/insurance.test.tsx`

## RED / GREEN evidence

- RED: `npm run mobile:test -- onboarding.test.tsx insurance.test.tsx --runInBand` failed because the new `./onboarding` and `./insurance` screen modules did not exist; both suites ran zero tests.
- GREEN: the focused screen suite passed with 2 suites and 7 tests.
- Regression RED: the consent-cancel test failed with `Expected: false / Received: true` when a partially checked sheet retained its temporary checkbox state after closing.
- Regression GREEN: the same onboarding suite passed after closing the sheet reset temporary consent checks.
- Final mobile suite: 3 suites and 16 tests passed.

## Commands and results

- `npm run mobile:test -- onboarding.test.tsx insurance.test.tsx --runInBand` — PASS, 7/7.
- `npm run mobile:test -- --runInBand` — PASS, 3/3 suites, 16/16 tests.
- `npm run mobile:typecheck` — PASS.
- `npx eslint apps/mobile/src apps/mobile/app/onboarding.tsx apps/mobile/app/insurance.tsx apps/mobile/app/onboarding.test.tsx apps/mobile/app/insurance.test.tsx` — PASS.
- `git diff --check` — PASS.
- `npx eslint apps/mobile` — reports the pre-existing Task 1 `apps/mobile/babel.config.js:1:1` `module is not defined` error; all Task 2 source and tests pass targeted lint.

## Assumptions

- Insurance lookup is intentionally deterministic and local, with a 250 ms loading state before the three Task 1 demo policies render.
- The insurance confirmation route `/(tabs)/home` is the Task 3 tab-shell contract and will be supplied by the later task.
- Consent selections are temporary until `ACCEPT_CONSENT`; closing or backing out of the sheet discards them.
- Copy explicitly identifies local demo behavior and does not claim a real Midnight proof, chain confirmation, insurer submission, or insurer decision.

## Concerns

- Expo export and physical-device checks remain Task 5/integration work because the tab home route is not part of Task 2.
- Full mobile lint remains blocked only by the existing Task 1 Babel config rule; the Task 2 files have a clean targeted lint run.
