export type ApplicationStageFromServer = "pending-verification" | "verification-failed" | "pending-insurer" | "applied" | "rejected";

export interface DriverApplicationView {
  id: string;
  insuranceContractId: string;
  specialContractId: string;
  specialContractName: string;
  score: number;
  distanceM: number;
  conditionsMet: boolean;
  expectedDiscountBps: number;
  appliedDiscountBps: number | null;
  submittedAt: string;
  decidedAt: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
  reviewStatus: "PENDING_REVIEW" | "APPLIED" | "REJECTED";
  stage: ApplicationStageFromServer;
}

/** Accept only public display fields. Proof material remains at the Backend boundary. */
export function parseDriverApplication(input: unknown): DriverApplicationView {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const verification = value.verificationStatus;
  const review = value.reviewStatus;
  const validVerification = verification === "PENDING" || verification === "VERIFIED" || verification === "FAILED";
  const validReview = review === "PENDING_REVIEW" || review === "APPLIED" || review === "REJECTED";
  if (typeof value.id !== "string" || typeof value.insuranceContractId !== "string"
    || typeof value.specialContractId !== "string" || typeof value.specialContractName !== "string"
    || typeof value.score !== "number" || typeof value.distanceM !== "number"
    || typeof value.conditionsMet !== "boolean" || typeof value.expectedDiscountBps !== "number"
    || typeof value.submittedAt !== "string" || !validVerification || !validReview
    || (review !== "PENDING_REVIEW" && verification !== "VERIFIED")
    || (review === "APPLIED" && typeof value.appliedDiscountBps !== "number")) {
    throw new Error("신청 응답 형식이 올바르지 않습니다.");
  }
  const stage: ApplicationStageFromServer = verification === "FAILED" ? "verification-failed"
    : verification === "PENDING" ? "pending-verification"
      : review === "APPLIED" ? "applied" : review === "REJECTED" ? "rejected" : "pending-insurer";
  return {
    id: value.id, insuranceContractId: value.insuranceContractId,
    specialContractId: value.specialContractId, specialContractName: value.specialContractName,
    score: value.score, distanceM: value.distanceM, conditionsMet: value.conditionsMet,
    expectedDiscountBps: value.expectedDiscountBps,
    appliedDiscountBps: typeof value.appliedDiscountBps === "number" ? value.appliedDiscountBps : null,
    submittedAt: value.submittedAt,
    decidedAt: typeof value.decidedAt === "string" ? value.decidedAt : null,
    verificationStatus: verification as DriverApplicationView["verificationStatus"],
    reviewStatus: review as DriverApplicationView["reviewStatus"], stage,
  };
}
