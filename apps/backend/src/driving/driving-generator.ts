import { randomBytes, randomUUID } from "node:crypto";
import { TripSchema, type Rule, type Trip } from "@drivacy/shared";

export interface RandomProvider { next(): number; }
export const systemRandom: RandomProvider = { next: () => Math.random() };
const GENERAL_MIN_DISTANCE_M = 20_000;
const GENERAL_MAX_DISTANCE_M = 60_000;
const FIRST_MIN_RATIO = 0.5;
const FIRST_MAX_RATIO = 0.6;

export const generateTrip = (rule: Rule, previousConfirmedDistanceM: number, random: RandomProvider = systemRandom): Trip => {
  const ratio = FIRST_MIN_RATIO + (FIRST_MAX_RATIO - FIRST_MIN_RATIO) * random.next();
  const target = previousConfirmedDistanceM === 0 && rule.minimumDistanceM > 0
    ? Math.floor(rule.minimumDistanceM * ratio)
    : GENERAL_MIN_DISTANCE_M + Math.floor(random.next() * (GENERAL_MAX_DISTANCE_M - GENERAL_MIN_DISTANCE_M + 1));
  const count = 3 + Math.floor(random.next() * 6);
  const records = Array.from({ length: count }, (_, index) => {
    const distanceM = index === count - 1 ? 0 : Math.max(1, Math.floor(target / count));
    return { index, distanceM, durationSeconds: Math.max(1, Math.round(distanceM / (45 / 3.6))), speedingCount: Math.floor(random.next() * 2), accelerationCount: Math.floor(random.next() * 2), brakingCount: Math.floor(random.next() * 2) };
  });
  records[records.length - 1].distanceM = target - records.slice(0, -1).reduce((sum, record) => sum + record.distanceM, 0);
  // 화면 재생과 후속 Core 입력이 다른 난수를 쓰면 같은 운행을 재현할 수 없다.
  return TripSchema.parse({ id: randomUUID(), source: "simulated", collectionEnabled: true, records, datasetSalt: randomBytes(32).toString("hex") });
};
