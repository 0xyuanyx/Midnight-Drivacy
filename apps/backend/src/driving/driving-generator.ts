import { randomBytes, randomUUID } from "node:crypto";
import { TripSchema, type Rule, type Trip } from "@drivacy/shared";

export interface RandomProvider { next(): number; }
export const systemRandom: RandomProvider = { next: () => Math.random() };
const GENERAL_MIN_DISTANCE_M = 20_000;
const GENERAL_MAX_DISTANCE_M = 60_000;
const FIRST_MIN_RATIO = 0.5;
const FIRST_MAX_RATIO = 0.6;
const FOLLOW_UP_MIN_RATIO = 1;
const FOLLOW_UP_MAX_RATIO = 1.1;
const SPEED_M_PER_SECOND = 45 / 3.6;

export const generateTrip = (rule: Rule, previousConfirmedDistanceM: number, random: RandomProvider = systemRandom): Trip => {
  const ratio = FIRST_MIN_RATIO + (FIRST_MAX_RATIO - FIRST_MIN_RATIO) * random.next();
  const target = rule.minimumDistanceM > 0 && previousConfirmedDistanceM === 0
    ? Math.floor(rule.minimumDistanceM * ratio)
    : rule.minimumDistanceM > previousConfirmedDistanceM
      ? Math.floor(rule.minimumDistanceM * (FOLLOW_UP_MIN_RATIO + (FOLLOW_UP_MAX_RATIO - FOLLOW_UP_MIN_RATIO) * random.next())) - previousConfirmedDistanceM
      : GENERAL_MIN_DISTANCE_M + Math.floor(random.next() * (GENERAL_MAX_DISTANCE_M - GENERAL_MIN_DISTANCE_M + 1));
  const count = 3 + Math.floor(random.next() * 6);
  const distances = Array.from({ length: count }, (_, index) => index === count - 1 ? 0 : Math.max(1, Math.floor(target / count)));
  distances[distances.length - 1] = target - distances.slice(0, -1).reduce((sum, distanceM) => sum + distanceM, 0);
  const records = distances.map((distanceM, index) => ({ index, distanceM, durationSeconds: Math.max(1, Math.round(distanceM / SPEED_M_PER_SECOND)), speedingCount: Math.floor(random.next() * 2), accelerationCount: Math.floor(random.next() * 2), brakingCount: Math.floor(random.next() * 2) }));
  // 거리 확정 이후 시간을 계산해야 마지막 구간의 거리/시간이 불일치하지 않는다.
  // 화면 재생과 후속 Core 입력이 다른 난수를 쓰면 같은 운행을 재현할 수 없다.
  return TripSchema.parse({ id: randomUUID(), source: "simulated", collectionEnabled: true, records, datasetSalt: randomBytes(32).toString("hex") });
};
