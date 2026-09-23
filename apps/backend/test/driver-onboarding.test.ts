import { randomUUID } from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  type AuthRepository,
  type CompleteDriverOnboardingInput,
  type OnboardedDriverRow,
} from "../src/auth/auth-repository.js";
import type { AuthVerifier } from "../src/auth/auth-verifier.js";
import { DriverOnboardingService } from "../src/auth/driver-onboarding-service.js";

class MemoryAuthRepository implements AuthRepository {
  public readonly users = new Map<string, OnboardedDriverRow>();

  public addLegacyUser(email: string) {
    this.users.set(`legacy:${email}`, { id: randomUUID(), email, role: "DRIVER" });
  }

  public async findUserByProviderIdentity(_provider: string, providerUserId: string) {
    return this.users.get(providerUserId);
  }

  public async findRoleByUserId(userId: string) {
    return [...this.users.values()].find((user) => user.id === userId)?.role;
  }

  public async completeDriverOnboarding(input: CompleteDriverOnboardingInput): Promise<OnboardedDriverRow> {
    const existing = this.users.get(input.providerUserId);
    if (existing) return existing;

    const driver = { id: randomUUID(), email: input.email, role: "DRIVER" };
    this.users.set(input.providerUserId, driver);
    return driver;
  }
}

const appFor = (identity: Awaited<ReturnType<AuthVerifier["verifyAccessToken"]>>) => {
  const authRepository = new MemoryAuthRepository();
  const authVerifier: AuthVerifier = { verifyAccessToken: async () => identity };
  const app = createApp({
    authRepository,
    authVerifier,
    driverOnboardingService: new DriverOnboardingService(authRepository, authVerifier),
  });
  return { app, authRepository };
};

const requestBody = { name: "홍길동", birthDate: "2000-01-01", phoneNumber: "01012345678" };

describe("POST /auth/driver/onboarding", () => {
  it("creates one DRIVER with a server-verified Privy identity, then authorizes /auth/me", async () => {
    const { app, authRepository } = appFor({ providerUserId: "did:privy:driver", email: "driver@drivacy.test" });
    const onboarded = await request(app)
      .post("/auth/driver/onboarding")
      .set("Authorization", "Bearer valid-token")
      .send(requestBody);

    expect(onboarded.status).toBe(200);
    expect(onboarded.body).toMatchObject({ email: "driver@drivacy.test", role: "DRIVER" });
    expect(authRepository.users).toHaveLength(1);

    const me = await request(app).get("/auth/me").set("Authorization", "Bearer valid-token");
    expect(me.status).toBe(200);
    expect(me.body).toEqual(onboarded.body);
  });

  it("reuses the existing UUID for repeated and concurrent onboarding", async () => {
    const { app, authRepository } = appFor({ providerUserId: "did:privy:driver", email: "driver@drivacy.test" });
    const responses = await Promise.all(Array.from({ length: 2 }, () => request(app)
      .post("/auth/driver/onboarding")
      .set("Authorization", "Bearer valid-token")
      .send(requestBody)));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(authRepository.users).toHaveLength(1);
  });

  it("does not link a legacy user merely because the email matches", async () => {
    const { app, authRepository } = appFor({ providerUserId: "did:privy:new-driver", email: "driver@drivacy.test" });
    authRepository.addLegacyUser("driver@drivacy.test");
    const response = await request(app)
      .post("/auth/driver/onboarding")
      .set("Authorization", "Bearer valid-token")
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(authRepository.users).toHaveLength(2);
  });

  it.each([
    [undefined, 401],
    [{ providerUserId: "did:privy:driver", email: undefined }, 401],
  ])("rejects unauthenticated onboarding", async (identity, expectedStatus) => {
    const { app } = appFor(identity);
    const response = await request(app).post("/auth/driver/onboarding").send(requestBody);
    expect(response.status).toBe(expectedStatus);
  });

  it("rejects client-supplied role and invalid profile values", async () => {
    const { app } = appFor({ providerUserId: "did:privy:driver", email: "driver@drivacy.test" });
    const response = await request(app)
      .post("/auth/driver/onboarding")
      .set("Authorization", "Bearer valid-token")
      .send({ ...requestBody, role: "INSURER", birthDate: "not-a-date" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
  });
});
