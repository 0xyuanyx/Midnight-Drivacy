# Drivacy Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an Expo Go-compatible iOS/Android subscriber app that implements the agreed onboarding, two-trip driving demo, discount application, pending status, and approved result flow.

**Architecture:** Add `apps/mobile` as an Expo Router workspace. A pure reducer owns the deterministic demo transitions, a context provider persists them with AsyncStorage, and route components render the Figma-derived screens using shared native components and tokens.

**Tech Stack:** Expo, React Native, Expo Router, TypeScript, AsyncStorage, Jest Expo, React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-drivacy-mobile-app-design.md`

## Global Constraints

- Must run in Expo Go on both iOS and Android; app-store/EAS release builds are out of scope.
- Reproduce the supplied Figma language at a 402 x 874 reference size, while supporting smaller Android screens and Safe Areas.
- Bottom navigation has exactly `홈`, `주행`, and `할인 신청`; icon, label, and background selection must always agree.
- Use deterministic demo totals: 0 km/100 points -> 300 km/92 points -> 550 km/87 points -> eligible for 10%.
- Never claim that a local mock action produced a real Midnight proof, chain confirmation, insurer submission, or insurer decision.
- Preserve existing backend, shared-contract, core, and Midnight code; the mobile milestone does not change their behavior.
- Keep the manual insurer rule review/approval path and the stated proof limitations intact.

## Review Focus

- Reopening after persisted consent and insurance selection must enter the tab shell, not replay onboarding.
- A first trip must remain ineligible by distance; only the second trip unlocks application.
- Repeated completion taps must not increment beyond two trips or change the final totals.
- Submitting before eligibility must be rejected by the reducer and inaccessible in the UI.
- Pending and approved applications must remain reachable from the Application tab without a navigation dead end.

---

### Task 1: Expo workspace, theme, and deterministic state

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/expo-env.d.ts`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/state/app-state.ts`
- Create: `apps/mobile/src/state/app-provider.tsx`
- Create: `apps/mobile/src/fixtures/demo.ts`
- Test: `apps/mobile/src/state/app-state.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `AppState`, `AppAction`, `initialAppState`, `appReducer`, `AppProvider`, and `useAppState`.
- Produces: demo policy and trips with exact cumulative totals from Global Constraints.

- [ ] **Step 1: Scaffold the Expo Router TypeScript workspace**

Use the current stable `create-expo-app@latest` defaults in `apps/mobile`, preserve the root npm workspace, remove example routes, and add scripts `mobile`, `mobile:test`, `mobile:typecheck`, and `mobile:export` at the root. Install AsyncStorage, `expo-linear-gradient`, Jest Expo, and React Native Testing Library with Expo-compatible versions.

- [ ] **Step 2: Write reducer tests first**

Cover initial values, first trip, second trip, a third completion no-op, eligibility guard on submission, pending, approval, reset, and persisted-state normalization. The production change that makes these tests pass is the pure `appReducer` transition table.

- [ ] **Step 3: Run the focused test and verify RED**

Run `npm run mobile:test -- app-state.test.ts --runInBand`. Expected: failure because `appReducer` and fixtures do not exist.

- [ ] **Step 4: Implement fixtures, reducer, persistence provider, and root stack**

Use `tripsCompleted: 0 | 1 | 2` and `applicationStage: "idle" | "pending" | "approved"`. `COMPLETE_TRIP` selects totals from fixtures rather than recomputing display values. `SUBMIT_APPLICATION` only changes eligible state. `APPROVE_APPLICATION` only changes pending state. Hydration merges only recognized fields into defaults.

- [ ] **Step 5: Verify GREEN and workspace health**

Run the focused test, `npm run mobile:typecheck`, and `npx expo-doctor` from `apps/mobile`. All must exit 0.

- [ ] **Step 6: Commit**

Commit message: `feat(mobile): scaffold Expo app state`

### Task 2: Shared UI, onboarding consent, and insurance selection

**Files:**
- Create: `apps/mobile/src/components/AppScreen.tsx`
- Create: `apps/mobile/src/components/PrimaryButton.tsx`
- Create: `apps/mobile/src/components/BrandMark.tsx`
- Create: `apps/mobile/src/components/PolicyCard.tsx`
- Create: `apps/mobile/src/components/StatusPill.tsx`
- Create: `apps/mobile/app/onboarding.tsx`
- Create: `apps/mobile/app/insurance.tsx`
- Test: `apps/mobile/app/onboarding.test.tsx`
- Test: `apps/mobile/app/insurance.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` and `demoPolicies` from Task 1.
- Produces: reusable screen, button, brand, policy-card, and status-pill primitives.

- [ ] **Step 1: Write screen tests first**

Test that the start CTA opens a consent sheet, the continue CTA stays disabled until both required rows are checked, consent dispatches `ACCEPT_CONSENT`, the insurance list renders three policies, selecting a card enables the CTA, and confirmation dispatches `SELECT_INSURANCE`.

- [ ] **Step 2: Verify RED**

Run `npm run mobile:test -- onboarding.test.tsx insurance.test.tsx --runInBand`. Expected: missing screen modules.

- [ ] **Step 3: Implement the visual primitives and onboarding**

Match the spec tokens, use a native modal/bottom sheet treatment, ensure Close returns to the unchanged start state, and keep all CTAs at least 44 px high.

- [ ] **Step 4: Implement insurance loading and selection**

Render a brief deterministic loading state before the policy list, maintain a single selected policy, and route to `/(tabs)/home` only after selection is stored.

- [ ] **Step 5: Verify GREEN and typecheck**

Run the focused tests and `npm run mobile:typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(mobile): add onboarding and insurance selection`

### Task 3: Bottom tabs, home, and complete driving loop

**Files:**
- Create: `apps/mobile/src/components/BottomTabBar.tsx`
- Create: `apps/mobile/src/components/MetricCard.tsx`
- Create: `apps/mobile/src/components/ProgressBar.tsx`
- Create: `apps/mobile/src/components/InfoCard.tsx`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/home.tsx`
- Create: `apps/mobile/app/(tabs)/drive.tsx`
- Create: `apps/mobile/app/drive-session.tsx`
- Create: `apps/mobile/app/drive-processing.tsx`
- Create: `apps/mobile/app/drive-result.tsx`
- Test: `apps/mobile/app/home.test.tsx`
- Test: `apps/mobile/app/drive-flow.test.tsx`

**Interfaces:**
- Consumes: Task 1 state and Task 2 visual primitives.
- Produces: tab shell and a full start -> active -> processing -> result -> Home driving loop.

- [ ] **Step 1: Write tab, home CTA, and drive guard tests first**

Test all three tab labels, a single selected tab presentation, contextual Home CTAs for 0/1/2 trips, drive start availability, finish dispatch, processing copy that says demo, result totals, and Home replacement navigation.

- [ ] **Step 2: Verify RED**

Run `npm run mobile:test -- home.test.tsx drive-flow.test.tsx --runInBand`. Expected: missing routes/components.

- [ ] **Step 3: Implement the tab shell and Home**

Home displays selected rider, score, cumulative distance, expected discount, privacy explanation, a reset control, and the contextual CTA. Tab selection uses the router pathname so icon, label, and selection background share one condition.

- [ ] **Step 4: Implement Driving overview and focused flow**

Driving overview owns `모의 주행 시작`; active drive simulates visible progress without mutating totals; Finish routes to processing; processing dispatches `COMPLETE_TRIP` exactly once and replaces itself with result; result replaces back navigation with `홈으로 돌아가기`.

- [ ] **Step 5: Verify GREEN and typecheck**

Run the focused tests and `npm run mobile:typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(mobile): implement home and driving flow`

### Task 4: Discount application, pending state, and result

**Files:**
- Create: `apps/mobile/app/(tabs)/application.tsx`
- Create: `apps/mobile/app/application-review.tsx`
- Create: `apps/mobile/app/application-submitted.tsx`
- Create: `apps/mobile/app/application-result.tsx`
- Test: `apps/mobile/app/application-flow.test.tsx`

**Interfaces:**
- Consumes: `applicationStage`, eligibility, selected policy, and shared components.
- Produces: review -> pending -> approved flow and resumable Application tab states.

- [ ] **Step 1: Write application-state screen tests first**

Test ineligible explanation after trip 1, enabled application after trip 2, disclosure inclusion/exclusion copy, back navigation, submission dispatch, pending status, demo approval action, approved 10% result, and Home return.

- [ ] **Step 2: Verify RED**

Run `npm run mobile:test -- application-flow.test.tsx --runInBand`. Expected: missing routes.

- [ ] **Step 3: Implement Application and review screens**

Application provides one stable entry point for idle, pending, and approved stages. Review lists insurer/rider/evaluation result and explicitly excludes precise location, route, segment speed, and exact driving time.

- [ ] **Step 4: Implement submitted and result screens**

Submitted shows a deterministic application number and review-pending state. The pending tab offers `데모 결과 반영` with explanatory copy; approval opens the result screen and remains persisted.

- [ ] **Step 5: Verify GREEN and typecheck**

Run the focused test and `npm run mobile:typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(mobile): add discount application flow`

### Task 5: Integration, visual QA, documentation, and project direction

**Files:**
- Modify: `apps/mobile/**` only where integration defects are found
- Create: `.superdesign/init/components.md`
- Create: `.superdesign/init/layouts.md`
- Create: `.superdesign/init/routes.md`
- Create: `.superdesign/init/theme.md`
- Create: `.superdesign/init/pages.md`
- Create: `.superdesign/init/extractable-components.md`
- Modify: `PROJECT_DIRECTION.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: runnable app, repository UI context, and accurate run/status documentation.

- [ ] **Step 1: Run the complete mobile checks**

Run `npm run mobile:test -- --runInBand`, `npm run mobile:typecheck`, `npm run mobile:export`, and `npx expo-doctor`. Record exact output and fix failures with a reproducing test when behavior is involved.

- [ ] **Step 2: Perform browser visual QA**

Start Expo web, inspect onboarding, insurance, Home, Driving, result, Application pending, and approved states at 402 x 874 and a smaller Android viewport. Check clipping, Safe Area spacing, tab selection, keyboard accessibility on web, and copy accuracy. Fix only observed defects.

- [ ] **Step 3: Generate Superdesign repository context**

Follow `references/INIT.md` against the finished app and write all six non-empty init files with full shared component/layout source and route dependency trees. Do not generate an alternative design draft because the supplied Figma is authoritative.

- [ ] **Step 4: Update direction and README**

Record the confirmed Expo Go scope, three-tab flow, mock-data boundary, and actual verification status dated 2026-09-22. Add install, start, test, and export commands. Do not claim physical-device verification unless it happened.

- [ ] **Step 5: Run repository checks**

Run `npm run build`, `npm run typecheck`, and `npm test` after ensuring `@drivacy/rule-draft` is built so the known clean-checkout package-entry issue does not mask mobile regressions. Report any remaining pre-existing warnings separately.

- [ ] **Step 6: Commit**

Commit message: `docs: document and verify mobile app`
