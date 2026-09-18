# Claude Midnight Expert 교차검증 — 2026-09-18

Windows Claude CLI의 로그인된 first-party 환경에서 설치된 Midnight Expert `compact-core:security-reviewer` 프로필과 Opus를 사용했다. 선정한 코드·테스트·공개 증거만 별도 디렉터리로 전달했다. Read/Glob/Grep/Skill만 허용하고 수정·shell·다른 agent 호출·세션 저장을 금지했다. MCP Agent 경로의 사용 가능한 agent 목록은 비어 있어 해당 경로가 아닌 설치된 CLI 프로필을 사용했다.

초기 검토 → 수정 → 재검토 → 마지막 TypeScript 보완 → delta 검토를 진행했다. 검토자는 직접 테스트·proof·체인을 실행하지 않았다. 아래는 실제 마지막 응답이며, 이전 응답은 initial/followup 파일로 보관했다.

구현자 판단:
- HIGH 인증/nullifier witness 분리: 실제 악성 witness 재현 후 동일 값 한 번 읽기로 수정. 회귀 테스트와 전체 ZK 재컴파일 완료.
- 승인 소비 race: await 전에 동기 소비하도록 수정. 실제 동시 balance 연결 검사는 Docker 중단 때문에 미완료.
- 제출 전 취소·재시도 소진의 scope 점유: 안전한 abandoned 경로 및 회귀 검사 추가. B 실제 연결 재검증은 미완료.
- 남은 MEDIUM: 앞 단계 거래 제출 이후 terminal failure의 감독하 체인 cancel/작업 종료 경로가 없다. 현재는 fail-closed로 scope를 막는다. 원장을 확인하지 않고 제출 intent를 삭제하거나 DB만 abandoned 처리해서 해결하면 안 된다. `cancelTrip` 회로는 있으나 C 작업·승인·receipt·B 종료 연결은 후속 구현 범위다.
- LOW finalize의 C 조회/잘못된 payload에 대한 domain 오류 매핑은 아직 동일하게 정리되지 않았다. 현재 서비스는 내부 worker 구성 요소이며 공개 REST 500 동작을 실제 확인한 것은 아니다.
- abandonment 이후 새 운행은 operationId와 idempotencyKey 모두 새로 발급한다. 기존 키의 재사용을 거부하는 것은 의도된 요청 식별 계약이다. 연결 하네스는 취소 작업과 다음 운행을 별도 키로 stage하며, 실행 완료 증거는 아직 없다.
- 화면의 계약 주소와 entrypoint는 월렛이 실제 Tx에서 읽은 값과 비교한다. 따라서 마지막 제안의 주소가 검증되지 않았다는 전제는 적용되지 않는다. State commitment 자체는 adapter 제공값으로 표시한다.

Windows와 독립 Linux에서 마지막 수정본 strict 검사 및 102개 테스트를 실행했다. Linux 기준 계산 정상332/거부15는 앞선 독립 실행 결과다. 이 테스트 목록에는 B PostgreSQL와 브라우저 wallet integration이 포함되지 않는다. 최신 소스·ZK 해시와 중단 상태는 `final-evaluation-2026-09-18.json`에 기록했다.

---
## Security Review — delta verification (6 files, source-only, read-only)

**Method:** read only the six named files plus `review-result-followup.json`. No commands, no edits, no agents, no network. Unchanged circuits and `wallet-runtime.ts` were not re-audited.

### Closure verdict on the four residual findings

| Prior finding | Verdict | Evidence in delta |
|---|---|---|
| MED — retry‑exhausted `TEMPORARY_FAILURE` wedges the scope | **Closed for unsubmitted jobs only** (see Medium below) | `trip-job.ts:213-217`; enum `bc-contract.ts:177`; refine `:179` keeps `retryable=false`; release predicates `trip-job.ts:108` (`code !== "TEMPORARY_FAILURE"`) and `:63` (`!retryable`) both now accept it; test `trip-job.test.ts:145-163` |
| LOW — `createJob` replays an `abandoned` row as success | **Closed** | `chain-finalizer.ts:83` throws `JOB_ABANDONED`; asserted `backend-local.ts:72` |
| LOW — unqualified table names in the abandon path | **Closed** | `chain-finalizer.ts:169, 173` now `public.chain_jobs` |
| LOW — C reader exception escapes `abandonJob` unmapped | **Closed in `abandonJob`; same defect remains in `finalize`** | `chain-finalizer.ts:159-161, 163` map both reader calls to `CHAIN_STATUS_UNAVAILABLE`; `:121` unchanged |
| SUGGESTION — approval dialog labels | **Closed** | `local-wallet-page.ts:45` — `승인 대상 Tx(잔액 처리 전) SHA256`, plus `어댑터가 제공한 이전/목표` for both commitments |

Retry arithmetic re-derived: fails at `retries` 0/1/2 set `nextRetryAt` `+60s/+300s/+900s` (`trip-job.ts:216`), each `retryTemporaryFailure` increments; the fourth failure hits `retries >= 3` → `RETRIES_EXHAUSTED`, `retryable:false`, `delete nextRetryAt`. Terminality is genuine: from that state `runStep`→`TERMINAL_JOB`, `failBeforeSubmission`→`RECOVERY_REQUIRED` (`:210`), `retryTemporaryFailure`→`RETRY_BLOCKED` (`:231`), `recoverStep`/`rejectStep` need a `transactionId`, `confirm`→`INCOMPLETE_JOB` — so `abandonJob`'s pre‑transaction C check still cannot be invalidated by a concurrent transition (TOCTOU argument holds for the new code).

### Medium

- **The retry budget is job-global, so exhaustion after any step has been submitted still wedges the scope permanently at both C and B** (`packages/midnight/src/trip-job.ts:234, 108-109, 63-64`; `apps/backend/src/chain-state/chain-finalizer.ts:162-166`)
  - **Problem:** `retries` is one counter per job, not per step (`:234`), and `orderedSteps` is `1 + records + 1` long (`:88`, up to 1026 steps). Reach `RETRIES_EXHAUSTED` while proving e.g. `appendRecord:7` — legal, because `failBeforeSubmission` only requires the *current* entry to have no `transactionId` (`:209`) — and the journal is terminal with earlier steps carrying `transactionId`s. Both release predicates then fail on `steps.every(s => !s.transactionId)`: C's `load()` keeps throwing `SCOPE_BUSY` (`:107-110`) and `canAbandonTrip` returns `false` (`:63-64`), so B's `abandonJob` refuses with `ABANDONMENT_NOT_SAFE` (`:164`) and the `pending` row keeps `chain_jobs_one_pending_scope` closed forever. Refusing to release is the *correct* fail-closed choice — on-chain a trip is open — but there is no in-code path to close it out: `cancelTrip` exists as a circuit yet `orderedSteps` never contains it and `runStep` rejects any terminal job (`:135`). Three transient proof-server/indexer blips anywhere in a long trip are enough.
  - **Impact:** Availability only — nothing submitted beyond already-confirmed steps, no funds, no state corruption. But the scope becomes permanently unusable and recovery requires hand-editing the journal file *and* the `chain_jobs` row. `trip-job.test.ts:70-76` documents exactly this state as unreleasable; no test or harness exercises exhaustion *after* a submitted step.
  - **Fix:** either scope the budget per step (`journal.retries` → `entry.retries`, reset on each new `StepJournal`), or give the terminal state a supervised on-chain exit: add a `cancelTrip` recovery step that a trusted C adapter may run from a `RETRIES_EXHAUSTED`/`CHAIN_REJECTED` job whose last entry has no `transactionId`, and release the scope only after its receipt is confirmed. Sketch:
    ```ts
    // trip-job.ts — per-step budget
    const entry = journal.steps.at(-1)!;
    const used = entry.retries ?? 0;
    const finalCode = code === "TEMPORARY_FAILURE" && used >= 3 ? "RETRIES_EXHAUSTED" : code;
    // retryTemporaryFailure: entry.retries = used + 1 instead of journal.retries++
    ```
    and add a case asserting `canAbandonTrip === false` **and** a defined recovery entry point after exhaustion at `appendRecord:0` following a confirmed `beginTrip`.

### Low

- **`finalize()` still calls the trusted chain reader unwrapped, so the exact exception class just fixed in `abandonJob` escapes here** (`apps/backend/src/chain-state/chain-finalizer.ts:121`, vs the new `:159-163`)
  - **Problem:** `TripProcessingResultSchema.parse(await this.chain.getTripStatus(operationId))` has no mapping. C throws `JobBlocked("UNKNOWN_OPERATION")` whenever no journal exists yet (`trip-job.ts:52`) — the normal state between B's `createJob` and C's first `getStatus`/`runStep` — and `LocalJobStore` can throw `JobBlocked("STORE_BUSY")` while a wallet approval dialog holds the lock (`trip-job.test.ts:87`). Both surface as raw non-`FinalizationBlocked` errors, i.e. the opaque‑500 shape the delta set out to remove. Fail-closed (no DB write), but inconsistent with `:159`.
  - **Fix:** mirror the abandon path, and move the Zod parse inside the guard so a malformed C payload is also a domain error:
    ```ts
    const result = await this.chain.getTripStatus(operationId)
      .then(r => TripProcessingResultSchema.parse(r))
      .catch(() => { throw new FinalizationBlocked("CHAIN_STATUS_UNAVAILABLE"); });
    ```
    (Same wrap applies to `:159-161`, where the parse currently sits outside the `catch`.)

- **An abandoned row keeps consuming its `(scope_key, idempotency_key)` slot, and the B-side "fresh operation after abandon" path is untested** (`apps/backend/src/chain-state/chain-finalizer.ts:83, 92-98`; `packages/midnight/probe/backend-local.ts:64-74`)
  - **Problem:** `JOB_ABANDONED` correctly forces a new `operationId`, but the abandoned row still holds the unique `(scope_key, idempotency_key)` pair, so a caller that re-posts with a fresh `operationId` and the *same* `idempotencyKey` gets `23505 → IDEMPOTENCY_CONFLICT` (`:97-98`) permanently — a second, quieter dead end at the same entry point. C makes the same demand (`trip-job.ts:104`), and the passing test at `trip-job.test.ts:160-162` rotates *both* keys, so the requirement is real but implicit. The B probe's `abandon()` only asserts the identical-request replay (`backend-local.ts:72`); it never stages a new operation afterwards, so nothing proves the B `pending` constraint actually released.
  - **Fix:** document the invariant at `createJob` ("a retry after abandonment requires a fresh `operationId` **and** `idempotencyKey`"), or make the idempotency unique index partial (`WHERE status <> 'abandoned'`) to match the pending index. Add to `backend-local.ts:73`: `await service.createJob(actor, { ...request, operationId: \`${request.operationId}-next\`, idempotencyKey: \`${request.idempotencyKey}-next\` }, key);` — it should succeed, which is the actual proof that abandonment released the scope at B.

### Suggestions

- **Approval dialog labels the adapter-provided commitments but not the adapter-provided contract address or step** (`packages/midnight/browser/local-wallet-page.ts:45`). `계약 ${d.chainContractAddress}` and `거래 ${d.step}` sit unqualified next to three fields explicitly marked `어댑터가 제공한`, which invites the reading that the address *is* wallet-verified — it is the single most security-relevant field in the dialog. Either prefix both the same way, or (better) have the wallet render the contract address it actually parsed out of the transaction being signed, so that one line is wallet-attested rather than adapter-asserted.

### Positive Highlights

- The exhaustion fix is minimal and lands on the right side of the trust boundary: a new *non*-retryable code rather than a mutation of the `retryable` flag, so the `bc-contract.ts:179` invariant (`retryable ⟺ TEMPORARY_FAILURE`) is preserved rather than weakened, and both release predicates accept it without either one being loosened.
- `trip-job.test.ts:145-163` genuinely discriminates: the final `new TripJob(...).getStatus()` on a fresh operation would have thrown `SCOPE_BUSY` before the change, and `retryTemporaryFailure` is asserted blocked both before the backoff elapses and after exhaustion.
- `trip-job.test.ts:70-76` ("never releases a terminal job that submitted an earlier step") is retained unchanged and still passes — the safety half of the wedge fix was not traded away for the availability half.
- `abandonJob` remains doubly owner-gated (`:154-155` join, `:168` `owned()` inside the transaction), idempotent at both `:158` and `:170`, re-reads `FOR UPDATE`, refuses non-`pending`, clears the claim, and deliberately retains the unconfirmed source — asserted at `backend-local.ts:65-73`.

## Verification Requests

(none) — no Critical or High findings.

## Evidence limits

1. **Source closure only.** Every verdict above is read from source and from test *code*; I executed nothing. Per your note, the Docker inference failure blocks the v3 live run, so none of this is integration proof.
2. **Coverage of the delta by the 102:** `trip-job.test.ts` covers the exhaustion path (C side) in-process with synthetic receipts. `ChainFinalizer` (`JOB_ABANDONED`, the qualified statements, `CHAIN_STATUS_UNAVAILABLE`) is exercised only by `probe/backend-local.ts`, which needs the local PostgreSQL fixture and is **not** part of the 102 unit assertions. `local-wallet-page.ts` has no automated coverage — the label change is source-verified only.
3. **Windows strict / 102 rerun and the Linux 102 + Python 332/15 are reported, not verified here** — no artifact for them was in this bundle, and per your note the Linux rerun postdates these TS changes and will be recorded separately.
4. The Medium above is covered by **no test and no harness** on either side (C exhaustion-after-submission, B `ABANDONMENT_NOT_SAFE` for that shape); `backend-local.ts:76` asserts `ABANDONMENT_NOT_SAFE` only for a healthy job.
