import { createHash } from "node:crypto";
import {
  CandidateStateSchema, ScopeSchema, RuleSchema, StateSchema, TripSchema,
  type CalculateTripRequest, type CandidateState, type Rule, type Scope, type State, type Trip,
} from "../../shared/src/bc-contract.js";
import { calculateTrip } from "../../core/src/calculation.js";
import * as Driving from "../managed/driving-state/contract/index.js";

// 읽는 순서: ruleOpening/stateOpening으로 회로 타입 변환 → buildDataset으로
// Root와 경로 생성 → prepareTrip으로 Core 결과와 비공개 회로 입력 연결.
// 여기서는 후보와 입력만 준비한다. 증명·제출·체인 확인·DB 확정은 하지 않는다.
// 인코딩/회로/런타임 조합이 달라지면 다른 프로파일로 구분해야 한다.
export const ADAPTER_PROFILE = "drivacy-persistent-merkle10-c0311-r0160-v3-evaluation-owner";
export const TREE_HEIGHT = 10;
// 높이 10의 완전 이진 트리: 2^10=1,024개 위치. BC의 records 최대 개수와 맞춘다.
export const TREE_CAPACITY = 1 << TREE_HEIGHT;
export const encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
// 업무 계약은 hex 문자열, 생성된 Compact 코드는 Uint8Array를 사용한다.
// 길이·대소문자가 다른 값을 조용히 보정하지 않아 인코딩 차이를 초기에 거부한다.
export function decode(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("INVALID_COMMITMENT_ENCODING");
  return new Uint8Array(Buffer.from(value, "hex"));
}
function digest(value: unknown): Uint8Array {
  // 고정 순서 배열의 문자열 식별값을 32바이트로 바꾸는 용도다.
  // 숫자 계산 필드까지 이 해시에 숨기지 않고 아래 RuleOpening에 직접 넣는다.
  return new Uint8Array(createHash("sha256").update(JSON.stringify(value), "utf8").digest());
}
/**
 * 가입자·계약·특약·평가기간을 하나의 비공개 평가 Scope에 연결한다.
 * secret을 포함해 알려진 ID 목록만으로 공개 binding을 추측 대조하기 어렵게 한다.
 * 회로는 이 digest의 일치를 검사한다. JSON preimage나 사용자 신원을 증명하는
 * 것은 아니므로 B가 인증·객체 권한과 올바른 계약 주소의 매핑을 검사해야 한다.
 */
export function scopeBinding(scope: Scope, ownerSecret: Uint8Array): Uint8Array {
  if (ownerSecret.length !== 32) throw new Error("INVALID_OWNER_SECRET");
  const s = ScopeSchema.parse(scope);
  return digest(["drivacy-scope-v1", s.applicantId, s.contractId, s.insurerId,
    s.endorsementId, s.evaluationPeriod.id, s.evaluationPeriod.startDate,
    s.evaluationPeriod.endDate, encode(ownerSecret)]);
}
/** 문자열 식별값과 실제 계산 계수를 분리해 회로가 등록 Hash와 함께 검사하게 한다. */
export function ruleOpening(input: Rule): Driving.RuleOpening {
  const r = RuleSchema.parse(input);
  return {
    identity: digest(["drivacy-rule-identity-v1", r.id, r.insurerId, r.endorsementId,
      r.formula, "m", "s", "integer-score", "bps"]),
    version: BigInt(r.version), initialScore: BigInt(r.initialScore),
    speedingPenalty: BigInt(r.speedingPenalty), accelerationPenalty: BigInt(r.accelerationPenalty),
    brakingPenalty: BigInt(r.brakingPenalty), minimumDistanceM: BigInt(r.minimumDistanceM),
    minimumScore: BigInt(r.minimumScore), premiumMinimumScore: BigInt(r.premiumMinimumScore),
    baseDiscountBps: BigInt(r.baseDiscountBps), premiumDiscountBps: BigInt(r.premiumDiscountBps),
  };
}
// 회로 정수는 bigint로 표현한다. 유효 범위는 입력 스키마와 회로의 Uint가 검사한다.
export function metrics(input: State["totals"]): Driving.Metrics {
  return { distanceM: BigInt(input.distanceM), durationSeconds: BigInt(input.durationSeconds),
    speedingCount: BigInt(input.speedingCount), accelerationCount: BigInt(input.accelerationCount),
    brakingCount: BigInt(input.brakingCount) };
}
/**
 * State 커밋먼트를 재계산할 비공개 내용을 만든다.
 * stateCommitment 자체는 제외해 자기 자신을 해시하는 순환을 만들지 않는다.
 * 거리·점수·salt가 들어 있으므로 이 반환값을 공개 응답/일반 로그에 넣지 않는다.
 */
export function stateOpening(input: State, ownerSecret: Uint8Array): Driving.StateOpening {
  const s = StateSchema.parse(input);
  return { scope: scopeBinding(s.scope, ownerSecret), rule: decode(s.rule.ruleHash),
    version: BigInt(s.version), tripCount: BigInt(s.tripCount), totals: metrics(s.totals),
    score: BigInt(s.score), conditionsMet: s.conditionsMet,
    expectedDiscountBps: BigInt(s.expectedDiscountBps), datasetRoot: decode(s.datasetRoot),
    salt: decode(s.stateSalt) };
}
/**
 * 0회·0집계의 초기 opening과 commitment를 준비한다. ConfirmedState를 만들지는 않는다.
 * 실제 initialize 트랜잭션의 반영 확인이 있어야 B가 초기 확정 State로 저장할 수 있다.
 */
export function genesis(scope: Scope, rule: Rule, ownerSecret: Uint8Array, stateSalt: string): State {
  const r = RuleSchema.parse(rule);
  const ruleHash = encode(Driving.pureCircuits.hashRule(ruleOpening(r)));
  // 데모 Rule은 거리 부족으로 false다. 다른 승인 계수도 Rule 그대로 판정한다.
  const eligible = r.minimumDistanceM === 0 && r.initialScore >= r.minimumScore;
  const s: State = { scope: ScopeSchema.parse(scope), rule: { id: r.id, version: r.version, ruleHash },
    version: 0, tripCount: 0,
    totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
    score: 100, conditionsMet: eligible,
    expectedDiscountBps: eligible ? (100 >= r.premiumMinimumScore ? r.premiumDiscountBps : r.baseDiscountBps) : 0,
    datasetRoot: encode(Driving.pureCircuits.emptyLeaf()), stateSalt, stateCommitment: "unassembled" };
  s.stateCommitment = encode(Driving.pureCircuits.hashState(stateOpening(s, ownerSecret)));
  return StateSchema.parse(s);
}

export type Dataset = {
  trip: Driving.TripOpening;
  root: Uint8Array;
  records: Driving.RecordOpening[];
  paths: Driving.InclusionPath[];
};
/**
 * 이번 운행의 records를 순번대로 넣어 Root와 각 기록의 포함 경로를 만든다.
 * 과거 전체 원본의 트리가 아니다. 과거는 이전 누적 State로 연결한다.
 * 해시는 임의의 JS 구현 대신 생성된 Compact pureCircuits를 호출해 인코딩을 맞춘다.
 */
export function buildDataset(input: Trip): Dataset {
  const t = TripSchema.parse(input);
  const trip: Driving.TripOpening = {
    // TripSchema가 simulated/collectionEnabled=true만 수용하며 identity에도 묶는다.
    identity: digest(["drivacy-trip-v1", t.id, t.source, t.collectionEnabled]),
    recordCount: BigInt(t.records.length), salt: decode(t.datasetSalt),
  };
  const records = t.records.map(r => ({ index: BigInt(r.index), metrics: metrics(r) }));
  const leaves = records.map(r => Driving.pureCircuits.hashRecord(trip, r));
  const empty = Driving.pureCircuits.emptyLeaf();
  // 실제 기록만 합산한다. 나머지 트리 위치는 빈 leaf로 채워 높이를 일정하게 만든다.
  const level0 = Array.from({ length: TREE_CAPACITY }, (_, i) => leaves[i] ?? empty);
  const levels: Uint8Array[][] = [level0];
  for (let depth = 0; depth < TREE_HEIGHT; depth++) {
    // 인접한 left/right 두 자식을 부모 하나로 합친다. 마지막 층에는 Root 하나가 남는다.
    const level = levels[depth]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(Driving.pureCircuits.hashNode(level[i]!, level[i + 1]!));
    levels.push(next);
  }
  const paths = records.map((_, i) => {
    const siblings: Uint8Array[] = [];
    const right: boolean[] = [];
    let position = i;
    for (let depth = 0; depth < TREE_HEIGHT; depth++) {
      // position ^ 1: 최하위 비트만 뒤집어 같은 부모의 반대쪽 자식을 찾는다.
      // position & 1: 홀수 위치이면 현재 자식이 오른쪽이다.
      siblings.push(levels[depth]![position ^ 1]!);
      right.push((position & 1) === 1);
      // 두 자식을 한 부모로 합쳤으므로 다음 층의 위치는 floor(position/2)다.
      position >>= 1;
    }
    return { siblings, right };
  });
  return { trip, root: levels[TREE_HEIGHT]![0]!, records, paths };
}

// 한 회로 호출에 필요한 비공개 입력 묶음. 월렛 개인키와는 별개다.
// 기록·salt·secret을 포함하므로 공개 ledger/보험사 결과/일반 로그에 복제하지 않는다.
export type DrivingPrivateState = {
  ownerSecret: Uint8Array;
  ruleOpening: Driving.RuleOpening;
  previousOpening: Driving.StateOpening;
  nextOpening: Driving.StateOpening;
  pendingBefore: Driving.PendingOpening;
  pendingAfter: Driving.PendingOpening;
  recordOpening: Driving.RecordOpening;
  inclusionPath: Driving.InclusionPath;
  resultSalt: Uint8Array;
};
// witness의 [s, value]는 [다음 privateState, 회로에 전달할 값]이다.
// 여기서는 상태를 바꾸지 않고 값만 읽는다. 검증 책임은 Compact의 assert에 있다.
export const witnesses: Driving.Witnesses<DrivingPrivateState> = {
  ownerSecret: ({ privateState: s }) => [s, s.ownerSecret],
  ruleOpening: ({ privateState: s }) => [s, s.ruleOpening],
  previousOpening: ({ privateState: s }) => [s, s.previousOpening],
  nextOpening: ({ privateState: s }) => [s, s.nextOpening],
  pendingBefore: ({ privateState: s }) => [s, s.pendingBefore],
  pendingAfter: ({ privateState: s }) => [s, s.pendingAfter],
  recordOpening: ({ privateState: s }) => [s, s.recordOpening],
  inclusionPath: ({ privateState: s }) => [s, s.inclusionPath],
  resultSalt: ({ privateState: s }) => [s, s.resultSalt],
};
// initialize는 ownerSecret/ruleOpening/previousOpening만 읽는다.
// 다른 슬롯의 0은 미사용 입력을 채우는 값이며 실제 운행의 salt나 가짜 확인 결과가 아니다.
export function bootstrapPrivateState(state: State, rule: Rule, ownerSecret: Uint8Array): DrivingPrivateState {
  const opening = stateOpening(state, ownerSecret);
  const zero = new Uint8Array(32);
  const pending: Driving.PendingOpening = { previous: zero, target: zero, root: zero,
    trip: { identity: zero, recordCount: 0n, salt: zero }, cursor: 0n, totals: opening.totals, salt: zero };
  return { ownerSecret, ruleOpening: ruleOpening(rule), previousOpening: opening, nextOpening: opening,
    pendingBefore: pending, pendingAfter: pending, recordOpening: { index: 0n, metrics: opening.totals },
    inclusionPath: { siblings: Array.from({ length: TREE_HEIGHT }, () => zero), right: Array(TREE_HEIGHT).fill(false) }, resultSalt: zero };
}
export type PreparedTrip = {
  candidate: CandidateState;
  initial: DrivingPrivateState; // beginTrip용: cursor=0, totals=이전 확정값.
  steps: DrivingPrivateState[]; // appendRecord용: 기록마다 전/후 누적 opening과 경로.
  final: DrivingPrivateState; // finishTrip용: 모든 기록을 더한 마지막 opening.
};
/**
 * Core의 계산 결과에 실제 Dataset Root·State salt/commitment를 연결해 후보를 조립한다.
 * opening의 로컬 일치는 체인의 최신 상태 확인이나 등록 권한 확인과 다르다.
 * 전달받은 salt는 최초 실제 작업에서 암호학적 난수로 만들고, 같은 작업 재시도에는
 * 저장한 값을 재사용해야 한다. 이 함수가 재시도할 때 새 salt를 생성하지 않는다.
 */
export function prepareTrip(request: CalculateTripRequest, ownerSecret: Uint8Array,
  nextStateSalt: string, pendingSalt: string): PreparedTrip {
  const calculation = calculateTrip(request);
  // 같은 hex 형식이라도 다른 회로/프로파일의 해시는 섞어서 해석할 수 없다.
  if (request.approvedRule.adapterProfile !== ADAPTER_PROFILE) throw new Error("ADAPTER_PROFILE_MISMATCH");
  const rule = ruleOpening(request.approvedRule.rule);
  if (encode(Driving.pureCircuits.hashRule(rule)) !== request.approvedRule.ruleHash) throw new Error("RULE_HASH_MISMATCH");
  const previous = stateOpening(request.previous.state, ownerSecret);
  // 이전 비공개 내용과 주어진 커밋먼트의 일치만 검사한다. 최신 여부는 beginTrip이 검사한다.
  if (encode(Driving.pureCircuits.hashState(previous)) !== request.previous.state.stateCommitment) {
    throw new Error("PREVIOUS_OPENING_MISMATCH");
  }
  const dataset = buildDataset(request.trip);
  const state: State = { ...calculation.next, datasetRoot: encode(dataset.root), stateSalt: nextStateSalt,
    stateCommitment: "unassembled" };
  const next = stateOpening(state, ownerSecret);
  state.stateCommitment = encode(Driving.pureCircuits.hashState(next));
  const candidate = CandidateStateSchema.parse({ kind: "candidate", state,
    operationId: request.operationId, tripId: request.trip.id,
    previousStateCommitment: calculation.previousStateCommitment, explanation: calculation.explanation });
  // 첫 pending은 이전 누적값에서 시작한다. previous/target/root/trip이 각 단계에
  // 함께 들어가므로 다른 운행 또는 다른 목표의 누적값으로 바꿔치기할 수 없다.
  let pending: Driving.PendingOpening = {
    previous: decode(request.previous.state.stateCommitment), target: decode(state.stateCommitment),
    root: dataset.root, trip: dataset.trip, cursor: 0n, totals: previous.totals, salt: decode(pendingSalt),
  };
  const initial: DrivingPrivateState = { ownerSecret, ruleOpening: rule, previousOpening: previous,
    nextOpening: next, pendingBefore: pending, pendingAfter: pending,
    recordOpening: dataset.records[0]!, inclusionPath: dataset.paths[0]!, resultSalt: new Uint8Array(32) };
  const steps = dataset.records.map((record, i) => {
    // 앞으로 회로에 제시할 단계별 입력을 미리 계산한다. 실제 appendRecord가
    // 포함 관계와 같은 덧셈을 다시 강제하므로 호스트의 계산만 신뢰하지 않는다.
    const after = { ...pending, cursor: pending.cursor + 1n,
      totals: Driving.pureCircuits.addMetrics(pending.totals, record.metrics) };
    const step = { ...initial, pendingBefore: pending, pendingAfter: after,
      recordOpening: record, inclusionPath: dataset.paths[i]! };
    // 방금 만든 after가 다음 기록의 before가 된다. 이전 opening은 별도 객체로 유지한다.
    pending = after;
    return step;
  });
  return { candidate, initial, steps, final: { ...initial, pendingBefore: pending, pendingAfter: pending } };
}
