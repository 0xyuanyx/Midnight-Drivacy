## Security Review

Scope reviewed by reading only: `contracts/driving-state.compact`, `packages/midnight/src/{state-adapter,evaluation,trip-job,local-job-store}.ts`, `packages/core/src/calculation.ts`, `packages/shared/src/{bc-contract,auth}.ts`, `packages/midnight/browser/{seed-vault,wallet-runtime}.ts`, `apps/backend/src/chain-state/chain-finalizer.ts`, `db/migrations/20260918060000_chain_state_confirmation.sql`, probes/tests, and the supplied `live-public-evidence.json` / `docs/FINAL_EVALUATION.md`. No commands were run; no files were modified. `state-probe.compact` was read but treated as a historical developer smoke probe as instructed (see limits).

### High

- **`submitEvaluation` reads `ownerSecret()` twice; only the first read is bound to `ownerBinding`, so the evaluation nullifier is not constrained to the authorized owner** (`contracts/driving-state.compact:353` and `:361`, with `authorize()` at `:212-216`)
  - **Problem:** `authorize()` calls `ownerSecret()` and checks `hashOwner(ownerSecret()) == ownerBinding`. `hashEvaluation(ownerSecret(), …)` at line 361 performs a **second, independent** witness read. Witness functions execute off-circuit on the prover's machine; each call site is a separate free input to the constraint system unless the compiler provably emits one wire for both. Nothing in the circuit asserts `secret_read_1 == secret_read_2`. A prover running a patched `witnesses.ownerSecret` (trivial — it is their own TypeScript, `state-adapter.ts:157`) can return the real secret to `authorize()` and an arbitrary value to `hashEvaluation`, producing an unlimited family of valid-looking nullifiers for one and the same confirmed State.
  - **Impact:** Defeats the single anti-replay control for evaluations. `usedEvaluations.member(...)` (line 363) never matches, `usedEvaluations.insert`, `evaluationNullifier`, `resultCommitment` and `submissionRevision` are updated again, and the subscriber can submit the identical confirmed evaluation (same `submittedState`, same score/distance, fresh `resultSalt`) repeatedly — i.e. repeated discount claims from one confirmed driving State. This is exactly the property `docs/FINAL_EVALUATION.md:11` and the `"duplicate-final-evaluation-with-new-salt"` live case claim to enforce; the live case only exercises an honest witness (`evaluation.ts:27` derives the nullifier from the same `ownerSecret` variable), so it cannot detect this.
  - **Fix:** Read the secret once and thread that single value through both uses, so authorization and the nullifier share one wire:
    ```compact
    circuit authorizedSecret(): Bytes<32> {
      const secret = ownerSecret();
      assert(hashOwner(secret) == ownerBinding, "Unauthorized state owner");
      return secret;
    }
    // ...
    export circuit submitEvaluation(): [] {
      const secret = authorizedSecret();          // replaces authorize()
      ...
      const n = hashEvaluation(secret, s.scope, s.rule, hashState(s));
      ...
    }
    ```
    (The other five circuits each read every witness exactly once, so `authorize()` can simply be replaced by `authorizedSecret()` and the result discarded there.) The change is free in constraints and correct regardless of how the compiler currently handles duplicate witness call sites.

### Medium

- **`balance()` keeps the exact check-then-`await`-then-consume race that was just removed from `approve()`; one approval can mint two balanced, submittable transactions** (`packages/midnight/browser/wallet-runtime.ts:78-83`)
  - **Problem:** The post-live change moved `consumedApprovalIds.add(...)` to line 72, i.e. into the synchronous window after the line-61 check — that fix is correct and closes the duplicate-`approve` race. But `balance()` still does `approved.get(id)` (line 79) → `await digest(transactionHex)` (line 80) → `approved.delete(id)` (line 82). Two overlapping `balance(hex, id)` calls with the same approval ID both pass line 80 before either reaches line 82, because the `await` yields the microtask queue. No test covers concurrent invocation, and `TripJob`'s `balancing` guard (`trip-job.ts:134`) protects only a single job object, not this reusable runtime.
  - **Impact:** Breaks the documented invariant "승인 ID는 한 번만 사용한다 / 승인 한 번은 바로 그 proven Tx의 balance에만 사용한다" (`FINAL_EVALUATION.md:33`, `wallet-runtime.ts:81`). Both calls reach `wallet.balanceUnboundTransaction`, producing two independently funded/signed copies of the same proven call, each registered in `balancedTransactions` and each separately submittable — duplicate DUST/fee spend and a duplicate chain submission from one user consent. A plain double-click or an adapter retry-while-in-flight triggers it; no attacker is required. (Impact is capped because the digest check still forces both copies to be the *approved* transaction, so no unapproved call can be balanced.)
  - **Fix:** Reserve before the first `await`, mirroring the fix already applied to `approve()`:
    ```ts
    async balance(transactionHex: string, approvalRequestId: string) {
      const expected = approved.get(approvalRequestId);
      if (!expected) throw new Error("TRANSACTION_NOT_APPROVED");
      approved.delete(approvalRequestId);           // consume synchronously
      consumedApprovalIds.add(approvalRequestId);
      if (expected !== await digest(transactionHex)) throw new Error("TRANSACTION_NOT_APPROVED");
      ...
    }
    ```
    Consider the same treatment for `submit()` — `balancedTransactions.delete(hash)` at line 93 is already atomic with its check, so that one is sound as written.

- **`chain_jobs` has no terminal-failure state: one non-confirming job permanently wedges the scope, and the next `createJob` surfaces a raw Postgres unique-violation** (`db/migrations/20260918060000_chain_state_confirmation.sql:22,29`; `apps/backend/src/chain-state/chain-finalizer.ts:88-90`)
  - **Problem:** `status` is constrained to `('pending','db-confirmed')` and `chain_jobs_one_pending_scope` enforces at most one `pending` row per `scope_key`. `ChainFinalizer` only ever writes `status='db-confirmed'` (line 136) — there is no path that abandons or fails a job. `finalize()` returns `undefined` when C is not `chain-confirmed` (line 112) and leaves the row `pending` forever.
  - **Impact:** Concrete trigger: `createJob(op1)` → the subscriber cancels the wallet approval (a C-side terminal `APPROVAL_CANCELLED`, `trip-job.ts:145-149`, which the live run exercised only on the C side because the cancelled trip was never staged to B) → `createJob(op2)` for the next trip on the same scope hits `chain_jobs_one_pending_scope` and throws an unhandled `23505` out of `this.transaction`, not a `FinalizationBlocked`. The scope is then permanently unable to record another trip with no in-code remedy, and the error surfaces as an opaque 500 rather than a domain error.
  - **Fix:** Add a terminal status and an owner-authorized transition, e.g. `CHECK (status IN ('pending','db-confirmed','abandoned'))` plus `WHERE status = 'pending'` on the partial index (already the case), and a method that CASes it under the same `owned()` + job lock used by `finalize`:
    ```ts
    async abandonJob(actor: User, operationId: string): Promise<void> {
      // only when C reports a terminal, non-retryable failure and no step holds a transactionId
      await this.transaction(async client => { /* owned(); */
        const r = await client.query(
          "UPDATE public.chain_jobs SET status='abandoned' WHERE operation_id=$1 AND status='pending' RETURNING operation_id",
          [operationId]);
        if (r.rowCount !== 1) throw new FinalizationBlocked("JOB_NOT_PENDING");
      });
    }
    ```
    Also wrap the `createJob` INSERT so a unique-violation maps to `FinalizationBlocked("SCOPE_BUSY")` instead of leaking a driver error.

### Low

- **The approval screen's `previousStateCommitment` / `newStateCommitment` are caller-supplied and never checked against the transaction** (`packages/midnight/browser/wallet-runtime.ts:9-13, 60-70`)
  - **Problem:** `approve()` verifies network, contract address and entry point against the deserialized `ContractCall`, then shows `display` to the user. The two commitment strings are never derived from or compared with the transaction; they cannot be, because every circuit takes its inputs from witnesses and exposes no public arguments, so the values do not appear in the call.
  - **Impact:** A buggy or compromised page script can render a consent dialog describing a state transition that is not the one being signed (any call to the same entry point on the same contract would pass). Within the declared trust model the adapter is local and trusted, so this is a hardening gap, not a bypass — but the dialog currently presents unverifiable data with the same weight as the verified fields.
  - **Fix:** Display the value the wallet actually binds — the transaction digest it already computes at line 73 — alongside the commitments, and mark the commitment fields as adapter-asserted in the UI (or, longer term, surface them as public circuit outputs so the wallet can verify them).

### Positive Highlights

- Ownership uses the sound witness-secret pattern: a deploy-time-pinned `ownerBinding` with in-circuit re-derivation (`driving-state.compact:128-132, 212-216`); `ownPublicKey()` is not used for authorization anywhere.
- Merkle leaves and internal nodes carry distinct domain tags (`drivacy:record:v1` vs `drivacy:node:v1`, `:157-163`), so leaf/node second-preimage confusion is structurally prevented; `pathIndex` is tied to both `record.index` and the public `cursor` (`:306-308`), which binds order, position and completeness rather than mere membership.
- Results are recomputed in-circuit from accumulated totals (`checkResult`, `:226-240`) instead of accepting the host's score/eligibility, and `finishTrip` re-anchors the target state to the accumulated pending totals (`:329-332`).
- `addMetrics` uses widened arithmetic with a range-checked `as Uint<32>` (`:193-203`), and the range rejection is asserted by test (`driving-state.test.ts:163`) — no Field wraparound in cumulative totals.
- `hashEvaluation` deliberately excludes `resultSalt` (`:152-156`), giving the intended salt-independent, State-stable nullifier.
- B's `finalize` fences on an expiring claim token and CASes both `state_commitment` and `version` inside one transaction, with source deletion strictly after `db-confirmed` and idempotent on retry (`chain-finalizer.ts:120-136, 141-150`).
- The post-live `approve()` reservation change is correct as written: lines 61-72 contain no `await`, so check-and-reserve is atomic and both the cancelled-ID and concurrent-duplicate reuse cases are blocked.

## Verification Requests

### VR-1 → finding: HIGH-1 (`submitEvaluation` double `ownerSecret()` read)
- type: target
- claim: "In `contracts/driving-state.compact`, the `submitEvaluation` circuit reads the `ownerSecret` witness at two independent call sites (`authorize()` at line 353 and `hashEvaluation(ownerSecret(), …)` at line 361) and contains no constraint forcing the two reads to be equal, so a prover supplying different values per read produces an unused nullifier for an already-submitted confirmed State and passes `usedEvaluations.member` check."
- poc-sketch: |
    Two independent confirmations, either is sufficient:
    (a) Source/ZKIR inspection — inspect the generated
        `packages/midnight/managed/driving-state/zkir/submitEvaluation.zkir`
        (hash `c84e666c…` in live-public-evidence.json) and the generated
        `contract/index.cjs`: count invocations of the `ownerSecret` witness in
        `submitEvaluation` and check whether the two reads resolve to the same
        wire/variable or to two distinct private inputs.
    (b) Execution PoC — minimal contract:
          witness s(): Bytes<32>;
          export ledger binding: Bytes<32>;
          export ledger used: Set<Bytes<32>>;
          constructor(b: Bytes<32>) { binding = disclose(b); }
          export circuit go(): [] {                         // insecure variant
            assert(persistentHash<Vector<2,Bytes<32>>>([pad(32,"d:o"), s()]) == binding, "auth");
            const n = persistentHash<Vector<2,Bytes<32>>>([pad(32,"d:n"), s()]);
            assert(!used.member(disclose(n)), "used"); used.insert(disclose(n));
          }
        Drive it with a witness whose implementation returns the real secret on
        the first call and a random value on every subsequent call within the
        same circuit execution; run `go()` twice.
        Secure variant: `const k = s();` used in both the assert and the hash.
- expected: "Confirming result = the insecure variant's two `s()` reads are distinct private inputs (ZKIR shows two witness reads feeding different wires) and the alternating witness lets `go()` succeed twice, inserting two different nullifiers; the secure variant rejects the second call with `used`. A refuting result = the compiler emits a single shared wire for both reads, or the runtime rejects a witness that returns differing values within one circuit execution."
- suggested command: `/midnight-verify:verify "a Compact circuit that calls the same witness twice creates two independent private inputs; the circuit does not constrain the two reads to be equal unless the value is bound to a single local"`

## Remaining verification limits (not findings)

1. **VR-1 is unresolved by the supplied evidence.** `packages/midnight/managed/**` (generated `index.cjs`, `.zkir`) was not forwarded — only its hashes are in `live-public-evidence.json` — so I could not inspect how many witness reads `submitEvaluation` compiles to. My finding rests on the trust-boundary rule that off-circuit witness call sites are independent inputs; it needs the mechanical check above before being treated as confirmed or dismissed. The remedy is safe and free either way.
2. **The post-live approval-ID ordering change was reviewed by reading only.** `approvalReservationFollowup.fullChainScenarioReplayedAfterChange: false` still holds; I confirmed the reservation is now inside a synchronous window, but no live or concurrency test exercises either `approve()` or `balance()` under overlapping calls, so the Medium race above is unexercised in both directions.
3. **No concurrency, fault-injection or adversarial-witness tests exist** for `wallet-runtime.ts`, `LocalJobStore.withLock` (single-file lock, `STORE_BUSY` on contention) or `ChainFinalizer.claim`/`finalize` racing each other. The B-side DB failure, expired claim, wrong actor and deletion-retry cases in `backend-local.ts` are sequential only.
4. **Declared boundaries I did not treat as violations,** per the handoff: record authenticity (the Merkle tree binds submitted simulated records, so a fabricated or replayed dataset is indistinguishable in-circuit and no ledger set records consumed trip identities/roots); insurer result delivery/retention and production worker wiring; logical vs physical deletion; subscriber provisioning/Auth/Storage/UI/Preprod; fixture-only insurer approval metadata and public local genesis; on-chain publication of `recordCount`, `cursor` and `revision` as intentional processing metadata (note that these, plus one transaction per record, make per-trip record counts and trip counts publicly observable).
5. **`contracts/state-probe.compact:14-20`** — `advance()` is an exported state-mutating circuit with no owner gate or witness-secret check; anyone can advance `stateCommitment`. Accepted as a historical smoke probe per your instruction; flagged only so it is never promoted into a deployment path or copied as a template.
