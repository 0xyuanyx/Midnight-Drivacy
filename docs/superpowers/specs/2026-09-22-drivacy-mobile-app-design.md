# Drivacy Mobile App Design

## Goal

Build an Expo React Native demo that runs in Expo Go on iOS and Android and reproduces the subscriber screens in the shared Figma file. The mobile app is completed before the insurer dashboard. This milestone uses deterministic local demo data and clearly avoids presenting mock processing as a real Midnight proof or insurer submission.

## Product flow

The app has three distinct phases.

1. First use: start screen -> consent bottom sheet -> insurance lookup -> insurance selection -> home.
2. Repeat driving: home or Driving tab -> driving overview -> simulated drive -> processing -> trip result -> home.
3. Discount application: Application tab or eligible home CTA -> disclosure review -> submit -> insurer review pending -> home; later visits to Application show pending or the mock insurer decision.

Returning users skip onboarding once consent and insurance selection are persisted.

## Navigation

Expo Router provides a root stack. Home, Driving, and Discount Application live in a persistent custom bottom tab shell. Focused tasks hide the tab bar:

- onboarding consent and insurance selection;
- active simulated drive and processing;
- trip result;
- disclosure review.

Trip result replaces the active drive and returns only to Home. Disclosure review can go back to Application before submission. Submitted and result states remain reachable from the Application tab so users are never trapped.

## Demo state

The app owns one persisted `AppState` with consent, selected insurance, completed trip count, totals, and application stage. The state transitions are deterministic:

- initial: 0 km, 100 points;
- trip 1: +300 km, score 92, distance requirement not met;
- trip 2: +250 km, cumulative 550 km, score 87, conditions met, expected discount 10%;
- application: idle -> pending -> approved.

The mock approval is triggered from the pending Application state and is labelled as a demo action until the insurer dashboard and API are connected.

## Visual system

Match the Figma mobile frames at 402 x 874 while adapting to smaller Android screens and Safe Areas.

- background: `#F2F2F7`;
- surface: `#FFFFFF`;
- primary: `#2E6EED`;
- primary text: `#1E1E1E`;
- secondary text: `#66758C`;
- success text/background: `#2E9D65` / `#EAF8F0`;
- cards: 16 px radius with no decorative shadow;
- CTA: full width, 54 px high, pill radius;
- typography: Pretendard when bundled, with the system sans-serif fallback;
- minimum touch target: 44 px.

Use native status bars and Safe Areas. Do not draw a fake iPhone status bar or home indicator. Use one selected state per bottom-tab item: background, icon, and label must agree.

## Screens

1. Start: privacy value proposition, Drivacy mark, `동의하고 시작하기`.
2. Consent sheet: two required consent rows, disabled CTA until checked, Close returns to Start.
3. Insurance lookup: loading state followed by selectable policy cards and `이 보험 선택하기`.
4. Home: selected rider, score, cumulative distance, expected discount, privacy explanation, contextual CTA.
5. Driving overview: current totals, progress, recent trips, `모의 주행 시작`.
6. Driving session: simulated distance/time progress, explicit simulation label, `주행 종료`.
7. Driving processing: short calculation/confirmation state without claiming real chain confirmation.
8. Trip result: delta, trip summary, new totals, `홈으로 돌아가기`.
9. Application: eligibility, pending status, or final result entry depending on state.
10. Application review: recipient, shared result, excluded raw data, submit CTA, back affordance.
11. Submitted: review pending, application number/time, `홈으로 돌아가기`.
12. Approved result: 10% result, policy and rider, minimal data disclosure, `홈으로 돌아가기`.

## Accessibility and resilience

Buttons expose labels and disabled states. Text remains readable at system font scaling without horizontal clipping. Scroll views protect content on small screens. Persistent state hydration shows a neutral loading screen. A reset action is available from Home for repeated hackathon demonstrations.

## Verification

Pure state transitions are unit tested first. Key screens are tested for required actions and guards. TypeScript, Jest, Expo diagnostics, and iOS/Android export bundling must pass. A browser preview is visually inspected at a mobile viewport; native device behavior is bounded by Expo Go compatibility and bundling until the user opens it on physical devices.
