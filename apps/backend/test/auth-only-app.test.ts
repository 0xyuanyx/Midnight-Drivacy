import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAuthOnlyApp } from "../src/auth-only-app.js";
import type { AuthRepository } from "../src/auth/auth-repository.js";
import type { AuthVerifier } from "../src/auth/auth-verifier.js";
import { DriverOnboardingService } from "../src/auth/driver-onboarding-service.js";
import { ConsentService } from "../src/consent/consent-service.js";
import { InsuranceService } from "../src/insurance/insurance-service.js";

const authRepository = {
  findUserByProviderIdentity: async () => ({ id: "00000000-0000-4000-8000-000000000001", email: "driver@example.com" }),
  findRoleByUserId: async () => "DRIVER",
  completeDriverOnboarding: async () => ({ id: "00000000-0000-4000-8000-000000000001", email: "driver@example.com", role: "DRIVER" as const }),
} satisfies AuthRepository;
const authVerifier = {
  verifyAccessToken: async (token: string) => token === "valid"
    ? { providerUserId: "did:privy:driver", email: "driver@example.com" }
    : undefined,
} satisfies AuthVerifier;
const app = createAuthOnlyApp({ authRepository, authVerifier,
  driverOnboardingService: new DriverOnboardingService(authRepository, authVerifier),
  consentService: new ConsentService({
    findGrantedConsent: async () => undefined,
    grantConsent: async () => ({ consented: true, consentedAt: new Date("2026-09-26T00:00:00.000Z") }),
  }),
  insuranceService: { listContracts: async () => [] } as InsuranceService,
}, "http://localhost:8094");

describe("auth-only local server", () => {
  it("allows the configured web origin to onboard without C/Wallet routes", async () => {
    const preflight = await request(app).options("/auth/driver/onboarding")
      .set("Origin", "http://localhost:8094")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:8094");

    const onboarded = await request(app).post("/auth/driver/onboarding")
      .set("Origin", "http://localhost:8094")
      .set("Authorization", "Bearer valid")
      .send({ name: "홍길동", birthDate: "2000-01-01", phoneNumber: "01012345678" });
    expect(onboarded.status).toBe(200);
    expect(onboarded.body.role).toBe("DRIVER");

    expect((await request(app).get("/trip-processing/example")).status).toBe(404);
  });

  it("does not grant browser access to a different origin", async () => {
    const response = await request(app).options("/auth/driver/onboarding")
      .set("Origin", "https://unrelated.example")
      .set("Access-Control-Request-Method", "POST");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("lets a provisioned driver reach consent and the owned-contract list without C/Wallet", async () => {
    const consent = await request(app).post("/consent")
      .set("Authorization", "Bearer valid")
      .send({});
    expect(consent.status).toBe(200);
    expect(consent.body.consented).toBe(true);

    const contracts = await request(app).get("/insurance-contracts")
      .set("Authorization", "Bearer valid");
    expect(contracts.status).toBe(200);
    expect(contracts.body).toEqual([]);
    expect((await request(app).get("/trip-processing/example")).status).toBe(404);
  });
});
