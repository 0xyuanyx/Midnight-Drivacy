import { z } from "zod";

// Internal B↔C contract only. Parsing is neither authorization nor chain verification.
export const CONTRACT_VERSION = "bc-v1" as const;
const id = z.string().min(1).max(256);
// SDK encodings are selected by the actual adapter in step 2; no fake hash profile.
const chainValue = z.string().min(1).max(1024);
const salt = z.string().regex(/^[0-9a-f]{64}$/);
const uint32 = z.number().int().min(0).max(0xffff_ffff);
const score = z.number().int().min(0).max(100);
const bps = z.number().int().min(0).max(10_000);
const mode = z.enum(["fixture", "live"]);

export const ScopeSchema = z.object({
  applicantId: id, contractId: id, insurerId: id, endorsementId: id,
  evaluationPeriod: z.object({
    id, startDate: z.iso.date(), endDate: z.iso.date(),
  }).strict().refine(p => p.startDate <= p.endDate, "Invalid evaluation period"),
}).strict();

export const RuleSchema = z.object({
  id, version: uint32.min(1), insurerId: id, endorsementId: id,
  formula: z.literal("cumulative-event-deduction-v1"),
  initialScore: z.literal(100), speedingPenalty: uint32,
  accelerationPenalty: uint32, brakingPenalty: uint32,
  minimumDistanceM: uint32, minimumScore: score,
  premiumMinimumScore: score, baseDiscountBps: bps, premiumDiscountBps: bps,
}).strict().refine(r => r.premiumMinimumScore >= r.minimumScore,
  "Premium threshold must not be below minimum score")
  .refine(r => r.premiumDiscountBps >= r.baseDiscountBps,
    "Premium discount must not be below base discount");

export type Rule = z.infer<typeof RuleSchema>;

// Stable field order; approval metadata and generated hashes are excluded.
export function serializeRule(value: Rule): string {
  const r = RuleSchema.parse(value);
  return JSON.stringify(["drivacy-rule-v1", r.id, r.version, r.insurerId,
    r.endorsementId, r.formula, "m", "s", "integer-score", "bps",
    r.initialScore, r.speedingPenalty, r.accelerationPenalty, r.brakingPenalty,
    r.minimumDistanceM, r.minimumScore, r.premiumMinimumScore,
    r.baseDiscountBps, r.premiumDiscountBps]);
}

export const ApprovedRuleSchema = z.object({
  approval: z.literal("approved"), rule: RuleSchema,
}).strict();
export const RegisteredRuleSchema = ApprovedRuleSchema.extend({
  registration: z.literal("chain-confirmed"), ruleHash: chainValue,
  adapterProfile: id, network: z.enum(["fixture", "local", "preprod"]),
  chainContractAddress: chainValue, registrationTransactionId: chainValue,
}).strict();
export const ChainDeploymentRefSchema = z.object({
  network: z.enum(["fixture", "local", "preprod"]), adapterProfile: id,
  chainContractAddress: chainValue,
}).strict();
export const DeployRuleRequestSchema = z.object({
  scope: ScopeSchema, approvedRule: ApprovedRuleSchema,
}).strict();
export const DeployRuleResultSchema = z.object({
  deploymentTransactionId: chainValue, registeredRule: RegisteredRuleSchema,
}).strict();
export const UpdateRuleRequestSchema = z.object({
  scope: ScopeSchema, deployment: ChainDeploymentRefSchema, approvedRule: ApprovedRuleSchema,
}).strict();
const ruleRef = z.object({ id, version: uint32.min(1), ruleHash: chainValue }).strict();

const metrics = z.object({
  distanceM: uint32, durationSeconds: uint32,
  speedingCount: uint32, accelerationCount: uint32, brakingCount: uint32,
}).strict();
export const TripSchema = z.object({
  id, source: z.literal("simulated"), collectionEnabled: z.literal(true),
  records: z.array(metrics.extend({ index: uint32 }).strict()).min(1).max(1024),
  datasetSalt: salt,
}).strict().refine(t => t.records.every((r, i) => r.index === i),
  "Records must have contiguous zero-based indices");

export const StateSchema = z.object({
  scope: ScopeSchema, rule: ruleRef, version: uint32, tripCount: uint32,
  totals: metrics, score, conditionsMet: z.boolean(), expectedDiscountBps: bps,
  datasetRoot: chainValue, stateSalt: salt, stateCommitment: chainValue,
}).strict();

export function serializeState(value: z.infer<typeof StateSchema>): string {
  const s = StateSchema.parse(value);
  const p = s.scope.evaluationPeriod;
  const t = s.totals;
  return JSON.stringify(["drivacy-state-v1", s.scope.applicantId, s.scope.contractId,
    s.scope.insurerId, s.scope.endorsementId, p.id, p.startDate, p.endDate,
    s.rule.id, s.rule.version, s.rule.ruleHash, s.version, s.tripCount,
    t.distanceM, t.durationSeconds, t.speedingCount, t.accelerationCount, t.brakingCount,
    s.score, s.conditionsMet, s.expectedDiscountBps, s.datasetRoot, s.stateSalt]);
}

export function serializeDatasetRecord(tripInput: z.infer<typeof TripSchema>, index: number): string {
  const trip = TripSchema.parse(tripInput);
  const record = trip.records[index];
  if (!Number.isInteger(index) || index < 0 || !record) throw new RangeError("Invalid record index");
  return JSON.stringify(["drivacy-record-v1", trip.id, trip.source, trip.collectionEnabled,
    record.index, record.distanceM, record.durationSeconds, record.speedingCount,
    record.accelerationCount, record.brakingCount, trip.datasetSalt]);
}

export const ChainConfirmationSchema = z.object({
  execution: mode, network: z.enum(["fixture", "local", "preprod"]),
  adapterProfile: id, chainContractAddress: chainValue,
  transactionId: chainValue, blockId: chainValue,
  operationId: id, previousStateCommitment: chainValue,
  newStateCommitment: chainValue, ruleHash: chainValue, datasetRoot: chainValue,
  observedAt: z.iso.datetime(),
}).strict().refine(c => (c.execution === "fixture") === (c.network === "fixture"),
  "Fixture and live confirmation must not be mixed");

export const ConfirmedStateSchema = z.object({
  kind: z.literal("confirmed"), state: StateSchema,
  confirmation: ChainConfirmationSchema,
}).strict().refine(s => s.state.stateCommitment === s.confirmation.newStateCommitment
  && s.state.rule.ruleHash === s.confirmation.ruleHash
  && s.state.datasetRoot === s.confirmation.datasetRoot,
  "Confirmation must bind the confirmed state, rule and dataset");

export const CalculateTripRequestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION), execution: mode,
  operationId: id, idempotencyKey: id, scope: ScopeSchema,
  approvedRule: RegisteredRuleSchema, previous: ConfirmedStateSchema,
  trip: TripSchema,
}).strict().superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (JSON.stringify(r.scope) !== JSON.stringify(r.previous.state.scope)) fail("Scope mismatch");
  const rule = r.approvedRule;
  const previous = r.previous.state;
  if (rule.rule.insurerId !== r.scope.insurerId
    || rule.rule.endorsementId !== r.scope.endorsementId
    || previous.rule.id !== rule.rule.id || previous.rule.version !== rule.rule.version
    || previous.rule.ruleHash !== rule.ruleHash) fail("Rule mismatch");
  const c = r.previous.confirmation;
  if (c.execution !== r.execution || c.network !== rule.network
    || c.adapterProfile !== rule.adapterProfile
    || c.chainContractAddress !== rule.chainContractAddress) fail("Adapter/execution mismatch");
  const total = previous.totals;
  const penalty = BigInt(total.speedingCount) * BigInt(rule.rule.speedingPenalty)
    + BigInt(total.accelerationCount) * BigInt(rule.rule.accelerationPenalty)
    + BigInt(total.brakingCount) * BigInt(rule.rule.brakingPenalty);
  const expectedScore = penalty >= 100n ? 0 : 100 - Number(penalty);
  const eligible = total.distanceM >= rule.rule.minimumDistanceM
    && expectedScore >= rule.rule.minimumScore;
  const discount = eligible ? (expectedScore >= rule.rule.premiumMinimumScore
    ? rule.rule.premiumDiscountBps : rule.rule.baseDiscountBps) : 0;
  if (previous.score !== expectedScore || previous.conditionsMet !== eligible
    || previous.expectedDiscountBps !== discount) fail("Previous metrics/result mismatch");
  if (previous.version !== previous.tripCount) fail("State version/trip count mismatch");
  if (previous.version === 0 && Object.values(total).some(v => v !== 0)) fail("Nonzero genesis metrics");
  for (const key of Object.keys(total) as Array<keyof typeof total>) {
    const sum = r.trip.records.reduce((v, record) => v + BigInt(record[key]), BigInt(total[key]));
    if (sum > 0xffff_ffffn) fail(`Numeric range exceeded: ${key}`);
  }
  if (previous.version === 0xffff_ffff) fail("State version range exceeded");
});

export const CandidateStateSchema = z.object({
  kind: z.literal("candidate"), state: StateSchema,
  operationId: id, tripId: id, previousStateCommitment: chainValue,
  explanation: z.object({
    previousScore: score, newScore: score, scoreDelta: z.number().int().min(-100).max(100),
    tripTotals: metrics, ruleVersion: uint32.min(1),
    // Raw weighted penalty can exceed the actual score delta after clamping.
    penalties: z.object({ speeding: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      acceleration: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      braking: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
  }).strict(),
}).strict().refine(c => c.explanation.newScore === c.state.score
  && c.explanation.newScore - c.explanation.previousScore === c.explanation.scoreDelta
  && c.explanation.ruleVersion === c.state.rule.version, "Explanation/state mismatch");

const identity = {
  contractVersion: z.literal(CONTRACT_VERSION), execution: mode,
  operationId: id, tripId: id,
};
export const TripProcessingResultSchema = z.discriminatedUnion("status", [
  z.object({ ...identity, status: z.literal("calculated"), candidate: CandidateStateSchema }).strict(),
  z.object({ ...identity, status: z.literal("proving") }).strict(),
  z.object({ ...identity, status: z.literal("awaiting-wallet-approval"), approvalRequestId: id }).strict(),
  z.object({ ...identity, status: z.literal("submitted"), transactionId: chainValue }).strict(),
  z.object({ ...identity, status: z.literal("chain-unknown"), transactionId: chainValue }).strict(),
  z.object({ ...identity, status: z.literal("chain-confirmed"),
    candidate: CandidateStateSchema, confirmation: ChainConfirmationSchema }).strict(),
  z.object({ ...identity, status: z.literal("failed"), error: z.object({
    code: z.enum(["INVALID_INPUT", "RULE_NOT_READY", "STALE_STATE", "PROOF_INVALID",
      "APPROVAL_CANCELLED", "TEMPORARY_FAILURE", "RETRIES_EXHAUSTED", "CHAIN_REJECTED", "NUMERIC_RANGE_EXCEEDED"]),
    retryable: z.boolean(), transactionId: chainValue.optional(),
  }).strict().refine(e => e.retryable === (e.code === "TEMPORARY_FAILURE"),
    "Only temporary failures are automatically retryable") }).strict(),
]).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if ("candidate" in r && (r.candidate.operationId !== r.operationId
    || r.candidate.tripId !== r.tripId)) fail("Candidate operation/trip mismatch");
  if (r.status === "chain-confirmed") {
    const c = r.confirmation;
    const candidate = r.candidate;
    if (c.execution !== r.execution || c.operationId !== r.operationId
      || c.previousStateCommitment !== candidate.previousStateCommitment
      || c.newStateCommitment !== candidate.state.stateCommitment
      || c.ruleHash !== candidate.state.rule.ruleHash
      || c.datasetRoot !== candidate.state.datasetRoot) fail("Confirmation/result mismatch");
  }
});

export type CalculateTripRequest = z.infer<typeof CalculateTripRequestSchema>;
export type CandidateState = z.infer<typeof CandidateStateSchema>;
export type TripProcessingResult = z.infer<typeof TripProcessingResultSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type ApprovedRule = z.infer<typeof ApprovedRuleSchema>;
export type RegisteredRule = z.infer<typeof RegisteredRuleSchema>;
export type ChainDeploymentRef = z.infer<typeof ChainDeploymentRefSchema>;
export type DeployRuleRequest = z.infer<typeof DeployRuleRequestSchema>;
export type DeployRuleResult = z.infer<typeof DeployRuleResultSchema>;
export type UpdateRuleRequest = z.infer<typeof UpdateRuleRequestSchema>;
export type Trip = z.infer<typeof TripSchema>;
export type State = z.infer<typeof StateSchema>;
export type ChainConfirmation = z.infer<typeof ChainConfirmationSchema>;
export type ConfirmedState = z.infer<typeof ConfirmedStateSchema>;

// Necessary consistency gate only. B still must trust/authenticate C's adapter,
// claim its job and compare-and-swap the previous DB state in a transaction.
export function canFinalizeState(input: unknown, requestInput: unknown): boolean {
  const parsed = TripProcessingResultSchema.safeParse(input);
  const requestParsed = CalculateTripRequestSchema.safeParse(requestInput);
  if (!parsed.success || !requestParsed.success) return false;
  const r = parsed.data;
  const request = requestParsed.data;
  if (r.status !== "chain-confirmed" || r.execution !== "live" || request.execution !== "live") return false;
  const c = r.confirmation;
  const expected = request.approvedRule;
  const state = r.candidate.state;
  return r.operationId === request.operationId && r.tripId === request.trip.id
    && c.network === expected.network && c.adapterProfile === expected.adapterProfile
    && c.chainContractAddress === expected.chainContractAddress
    && c.previousStateCommitment === request.previous.state.stateCommitment
    && state.version === request.previous.state.version + 1
    && state.tripCount === request.previous.state.tripCount + 1
    && JSON.stringify(state.scope) === JSON.stringify(request.scope)
    && state.rule.id === expected.rule.id && state.rule.version === expected.rule.version
    && state.rule.ruleHash === expected.ruleHash;
}

// Type signatures for later C implementations; no chain/proof implementation here.
export interface BCAdapter {
  deployRule(input: DeployRuleRequest): Promise<DeployRuleResult>;
  updateRule(input: UpdateRuleRequest): Promise<RegisteredRule>;
  calculateTrip(input: CalculateTripRequest): Promise<CandidateState>;
  processTrip(input: CalculateTripRequest, candidate: CandidateState): Promise<TripProcessingResult>;
  getTripStatus(operationId: string): Promise<TripProcessingResult>;
}
