import {
  ApiErrorSchema,
  ConsentSchema,
  InsuranceContractSchema,
  StartDrivingSessionRequestSchema,
  RoleSchema,
  SpecialContractSchema,
  SpecialContractSelectionSchema,
  UserSchema,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const contractId = "contract-1";

describe("shared first-vertical contracts", () => {
  it("accepts the two supported roles and rejects other roles", () => {
    expect(RoleSchema.safeParse("DRIVER").success).toBe(true);
    expect(RoleSchema.safeParse("INSURER").success).toBe(true);
    expect(RoleSchema.safeParse("ADMIN").success).toBe(false);
  });

  it("validates the minimal application user", () => {
    expect(UserSchema.safeParse({ id: "user-1", email: "driver@example.com", role: "DRIVER" }).success).toBe(true);
    expect(UserSchema.safeParse({ email: "driver@example.com", role: "DRIVER" }).success).toBe(false);
  });

  it("validates consent timestamps and rejects malformed consent data", () => {
    expect(ConsentSchema.safeParse({ consented: true, consentedAt: "2026-09-17T10:00:00.000Z" }).success).toBe(true);
    expect(ConsentSchema.safeParse({ consented: "true", consentedAt: "not-a-date" }).success).toBe(false);
  });

  it("validates an insurance contract with its available special contracts", () => {
    const specialContract = {
      id: "special-1",
      insuranceContractId: contractId,
      insurerName: "Demo Insurance",
      name: "Safe Driving Discount",
      isEligible: true,
      status: "AVAILABLE",
    };
    expect(SpecialContractSchema.safeParse(specialContract).success).toBe(true);
    expect(InsuranceContractSchema.safeParse({
      id: contractId,
      ownerUserId: "user-1",
      insurerName: "Demo Insurance",
      coverageStartsAt: "2026-01-01T00:00:00.000Z",
      coverageEndsAt: "2026-12-31T23:59:59.000Z",
      status: "ACTIVE",
      specialContracts: [specialContract],
    }).success).toBe(true);
    expect(InsuranceContractSchema.safeParse({ id: contractId }).success).toBe(false);
  });

  it("validates the minimal current special-contract selection", () => {
    expect(SpecialContractSelectionSchema.safeParse({
      insuranceContractId: contractId,
      specialContractId: "special-1",
      selectedAt: "2026-09-18T10:00:00.000Z",
    }).success).toBe(true);
    expect(SpecialContractSelectionSchema.safeParse({ insuranceContractId: contractId }).success).toBe(false);
  });

  it("accepts only client-selectable simulated-driving start inputs", () => {
    const request = {
      insuranceContractId: "1c8bb808-e7f3-4e49-9a5b-67501f9454d6",
      specialContractId: "58710811-b501-44f6-bced-8c0f5e646e65",
      evaluationPeriod: "2026-Q3",
    };

    expect(StartDrivingSessionRequestSchema.safeParse(request).success).toBe(true);
    expect(StartDrivingSessionRequestSchema.safeParse({ ...request, ruleVersionId: "client-value" }).success).toBe(false);
    expect(StartDrivingSessionRequestSchema.safeParse({ ...request, insuranceContractId: "not-a-uuid" }).success).toBe(false);
  });

  it("validates the common API error shape", () => {
    expect(ApiErrorSchema.safeParse({ code: "NOT_FOUND", message: "Not found", requestId: "request-1" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "", message: "Not found" }).success).toBe(false);
  });
});
