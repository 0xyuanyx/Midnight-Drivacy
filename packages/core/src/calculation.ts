import {
  CalculateTripRequestSchema, RuleSchema,
  type CandidateState, type CalculateTripRequest, type Rule, type State,
} from "../../shared/src/bc-contract.js";

export type CoreErrorCode = "INVALID_INPUT" | "RULE_NOT_READY" | "NUMERIC_RANGE_EXCEEDED";
export class CoreCalculationError extends Error {
  readonly retryable = false;
  constructor(readonly code: CoreErrorCode) {
    super(code);
    this.name = "CoreCalculationError";
  }
}

// Calculation only: the real Merkle/chain adapter supplies roots and commitments later.
export type TripCalculation = {
  kind: "calculation";
  contractVersion: CalculateTripRequest["contractVersion"];
  execution: CalculateTripRequest["execution"];
  operationId: string;
  idempotencyKey: string;
  tripId: string;
  previousStateCommitment: string;
  next: Omit<State, "datasetRoot" | "stateSalt" | "stateCommitment">;
  explanation: CandidateState["explanation"];
};

export function createDemoRule(identity: Pick<Rule, "id" | "version" | "insurerId" | "endorsementId">): Rule {
  // Demo values only. This function grants neither approval nor registration.
  return RuleSchema.parse({
    ...identity, formula: "cumulative-event-deduction-v1", initialScore: 100,
    speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3,
    minimumDistanceM: 500_000, minimumScore: 80, premiumMinimumScore: 90,
    baseDiscountBps: 1000, premiumDiscountBps: 1200,
  });
}

const metricKeys = ["distanceM", "durationSeconds", "speedingCount", "accelerationCount", "brakingCount"] as const;
function boundedNumber(value: bigint, maximum: bigint): number {
  if (value < 0n || value > maximum) throw new CoreCalculationError("NUMERIC_RANGE_EXCEEDED");
  return Number(value);
}

export function calculateTrip(input: unknown): TripCalculation {
  const parsed = CalculateTripRequestSchema.safeParse(input);
  if (!parsed.success) {
    // Never expose Zod input values, raw records, salts or provider error strings.
    const issues = parsed.error.issues;
    const numeric = issues.some(i => i.code === "custom" &&
      (i.message.startsWith("Numeric range exceeded:") || i.message === "State version range exceeded"));
    const notReady = issues.some(i => i.path[0] === "approvedRule" &&
      (i.path[1] === "approval" || i.path[1] === "registration"));
    throw new CoreCalculationError(numeric ? "NUMERIC_RANGE_EXCEEDED" : notReady ? "RULE_NOT_READY" : "INVALID_INPUT");
  }
  const request = parsed.data;
  const previous = request.previous.state;
  const rule = request.approvedRule.rule;
  const tripTotals = { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 };
  const totals = { ...tripTotals };
  for (const key of metricKeys) {
    const sum = request.trip.records.reduce((value, record) => value + BigInt(record[key]), 0n);
    tripTotals[key] = boundedNumber(sum, 0xffff_ffffn);
    totals[key] = boundedNumber(BigInt(previous.totals[key]) + sum, 0xffff_ffffn);
  }
  const weighted = (count: number, coefficient: number) => BigInt(count) * BigInt(coefficient);
  const cumulativePenalty = weighted(totals.speedingCount, rule.speedingPenalty)
    + weighted(totals.accelerationCount, rule.accelerationPenalty)
    + weighted(totals.brakingCount, rule.brakingPenalty);
  const score = cumulativePenalty >= BigInt(rule.initialScore) ? 0 : rule.initialScore - Number(cumulativePenalty);
  const conditionsMet = totals.distanceM >= rule.minimumDistanceM && score >= rule.minimumScore;
  const expectedDiscountBps = conditionsMet
    ? score >= rule.premiumMinimumScore ? rule.premiumDiscountBps : rule.baseDiscountBps
    : 0;
  const safeMaximum = BigInt(Number.MAX_SAFE_INTEGER);
  const penalties = {
    speeding: boundedNumber(weighted(tripTotals.speedingCount, rule.speedingPenalty), safeMaximum),
    acceleration: boundedNumber(weighted(tripTotals.accelerationCount, rule.accelerationPenalty), safeMaximum),
    braking: boundedNumber(weighted(tripTotals.brakingCount, rule.brakingPenalty), safeMaximum),
  };
  return {
    kind: "calculation", contractVersion: request.contractVersion, execution: request.execution,
    operationId: request.operationId, idempotencyKey: request.idempotencyKey,
    tripId: request.trip.id, previousStateCommitment: previous.stateCommitment,
    next: { scope: previous.scope, rule: previous.rule,
      version: boundedNumber(BigInt(previous.version) + 1n, 0xffff_ffffn),
      tripCount: boundedNumber(BigInt(previous.tripCount) + 1n, 0xffff_ffffn),
      totals, score, conditionsMet, expectedDiscountBps },
    explanation: { previousScore: previous.score, newScore: score,
      scoreDelta: score - previous.score, tripTotals, ruleVersion: rule.version, penalties },
  };
}
