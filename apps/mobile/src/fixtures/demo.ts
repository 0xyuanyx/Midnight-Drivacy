/** Approved demo threshold, not the 550 km cumulative sample result. */
export const demoRule = { minimumDistanceKm: 500, minimumScore: 80 } as const;

export interface DemoTotals {
  distanceKm: number;
  score: number;
  isEligible: boolean;
  expectedDiscountPercent: number;
}

export interface DemoPolicy {
  id: string;
  insurerName: string;
  productName: string;
  riderName: string;
  statusLabel: string;
  vehicleNumber: string;
  coveragePeriod: string;
}

export interface DemoTrip {
  id: string;
  sequence: 1 | 2;
  distanceKm: number;
  cumulativeTotals: DemoTotals;
}

export const demoPolicies: readonly DemoPolicy[] = [
  {
    id: "policy-safe-driver",
    insurerName: "미래손해보험",
    productName: "개인용 자동차보험",
    riderName: "안전운전 할인 특약",
    statusLabel: "정상",
    vehicleNumber: "12가 3456",
    coveragePeriod: "2026.01–2026.12",
  },
  {
    id: "policy-family-driver",
    insurerName: "미래손해보험",
    productName: "개인용 자동차보험",
    riderName: "안전운전 할인 특약",
    statusLabel: "정상",
    vehicleNumber: "34나 7890",
    coveragePeriod: "2026.01–2026.12",
  },
  {
    id: "policy-weekend-driver",
    insurerName: "미래손해보험",
    productName: "개인용 자동차보험",
    riderName: "안전운전 할인 특약",
    statusLabel: "정상",
    vehicleNumber: "56다 1234",
    coveragePeriod: "2026.01–2026.12",
  },
];

export function isDemoPolicyId(policyId: unknown): policyId is string {
  return typeof policyId === "string" && demoPolicies.some((policy) => policy.id === policyId);
}

export const initialDemoTotals: DemoTotals = {
  distanceKm: 0,
  score: 100,
  isEligible: false,
  expectedDiscountPercent: 0,
};

export const demoTrips: readonly DemoTrip[] = [
  {
    id: "demo-trip-1",
    sequence: 1,
    distanceKm: 300,
    cumulativeTotals: {
      distanceKm: 300,
      score: 92,
      isEligible: false,
      expectedDiscountPercent: 0,
    },
  },
  {
    id: "demo-trip-2",
    sequence: 2,
    distanceKm: 250,
    cumulativeTotals: {
      distanceKm: 550,
      score: 87,
      isEligible: true,
      expectedDiscountPercent: 10,
    },
  },
];
