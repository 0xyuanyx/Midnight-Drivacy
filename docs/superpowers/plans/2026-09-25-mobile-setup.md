# Mobile account setup implementation plan

**Goal:** Reproduce the seven Figma email/profile/wallet frames using existing mobile UI rules, then connect to insurance consent.
**Architecture:** One `/setup` screen owns transient form state; an injectable service boundary owns email/wallet operations. The default preview service performs no authentication or cryptography. Only a non-sensitive preview-completion flag persists. Existing insurer and driving behavior stays unchanged.
**Spec:** Figma nodes 88:5966, 5978, 6000, 6022, 6046, 6065, 6086; user request 2026-09-25.

## Constraints
- Existing shared CTA/typography rules take precedence over inconsistent Figma spacing.
- Inline validation and existing card treatments, no new designer dependency.
- Never persist email, birthdate, phone, OTP, or wallet password in demo storage.
- Never claim a real wallet/address/network confirmation in default preview.
- No commit or push requested in this turn.

## Execution
- [x] Add interaction tests for invalid email/code/profile/password, double submission, connection failure/retry, completion, and reset.
- [x] Implement setup service boundary and seven states with shared fields, six-cell OTP, countdown, loading ring, and cards.
- [x] Connect initial CTA and completed setup to existing consent sheet; protect direct routes.
- [x] Run mobile tests/typecheck/export and repository tests.
- [x] Compare all seven states against Figma in browser; correct spacing/overflow and recheck small viewport.
- [x] Record intentional copy differences and outstanding real auth/wallet integration requirements.

## Review focus
- Expired/replaced OTP cannot accidentally verify; resend does not overlap.
- Back navigation ignores late async results and clears secrets.
- Wallet network retry does not call wallet creation again.
- Keyboard/small viewport leaves input and CTA reachable.
- Reset clears setup completion without retaining private form data.
