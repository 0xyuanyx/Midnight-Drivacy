import { parseDriverApplication } from "./driver-application";

const base = { id: "app-1", insuranceContractId: "contract-1", specialContractId: "rider-1",
  specialContractName: "안전운전 특약", score: 91, distanceM: 1200, conditionsMet: true,
  expectedDiscountBps: 1000, submittedAt: "2026-09-26T00:00:00Z", decidedAt: null,
  verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW", appliedDiscountBps: null };

it("keeps proof verification separate from the insurer's application decision", () => {
  expect(parseDriverApplication(base).stage).toBe("pending-verification");
  expect(parseDriverApplication({ ...base, verificationStatus: "VERIFIED" }).stage).toBe("pending-insurer");
  expect(parseDriverApplication({ ...base, verificationStatus: "VERIFIED", reviewStatus: "APPLIED", appliedDiscountBps: 800, decidedAt: "2026-09-26T01:00:00Z" }).stage).toBe("applied");
  expect(parseDriverApplication({ ...base, verificationStatus: "VERIFIED", reviewStatus: "REJECTED", decidedAt: "2026-09-26T01:00:00Z" }).stage).toBe("rejected");
  expect(parseDriverApplication({ ...base, verificationStatus: "FAILED" }).stage).toBe("verification-failed");
});

it("rejects an applied decision without verified proof", () => {
  expect(() => parseDriverApplication({ ...base, reviewStatus: "APPLIED", appliedDiscountBps: 1000 })).toThrow("신청 응답");
});
