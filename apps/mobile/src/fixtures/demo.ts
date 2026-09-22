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
    insurerName: "드리바시 보험",
    productName: "안전운전 자동차보험",
    riderName: "안전운전 할인 특약",
  },
  {
    id: "policy-family-driver",
    insurerName: "드리바시 보험",
    productName: "가족 안심 자동차보험",
    riderName: "안전운전 할인 특약",
  },
  {
    id: "policy-weekend-driver",
    insurerName: "드리바시 보험",
    productName: "주말 운전자 자동차보험",
    riderName: "안전운전 할인 특약",
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
