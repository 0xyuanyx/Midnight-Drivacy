# Final state and routing guard fix

## Range

- Base: `cf9cee8` (`docs: document and verify mobile app`)
- Head: the current `fix(mobile): guard onboarding and persisted state` commit

## Root cause

Persisted fields were independently accepted: any string was accepted as a selected policy, and trip/application values were retained without consent or a policy. Separately, the root stack had no hydrated state-aware route policy, so direct routes bypassed onboarding and policy selection.

## RED

Before implementation, the focused command failed as intended:

```text
npm run mobile:test -- app-state.test.ts route-policy.test.ts --runInBand
FAIL Cannot find module './route-policy'
FAIL app-state tests: invalid persisted policies and no-consent policy state were retained;
     unknown policy selection and ineligible approval changed state.
```

## GREEN

- `isDemoPolicyId` validates every persisted and selected policy ID against `demoPolicies`.
- Hydration now preserves only consent without a policy, resets all policy-scoped fields when consent or policy is invalid, and allows pending/approved only for the eligible second-trip state.
- Reducer transitions reject invalid policy selection, trips before valid consent/policy setup, submission outside valid eligible setup, and approval outside valid pending eligible setup.
- `initialRouteForState` uses three-way resume routing: onboarding, insurance, or Home.
- The hydrated root route gate uses the same pure policy to block direct/deep protected paths before consent or policy setup, while forwarding completed setup routes to Home without a loop.

## Verification

| Command | Result |
| --- | --- |
| `npm run mobile:test -- app-state.test.ts route-policy.test.ts --runInBand` | Pass — 17 tests |
| `npm run mobile:test -- --runInBand` | Pass — 42 tests across 7 suites |
| `npm run mobile:typecheck` | Pass |
| `npm run lint --workspace=@drivacy/mobile` | Pass |
| `git diff --check` | Pass |
