import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AuthRepository } from "../src/auth/auth-repository.js";
import type { AuthDependencies } from "../src/auth/auth-service.js";
import type { SupabaseAuthVerifier, VerifiedAuthUser } from "../src/auth/supabase-auth.js";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createRequireAuth } from "../src/middleware/require-auth.js";
import { requireRole } from "../src/middleware/require-role.js";

const verifiedDriver: VerifiedAuthUser = {
  id: "b7f9c342-7e04-4bd9-b0e3-8269661db2df",
  email: "driver@drivacy.test",
};

interface DependencyOptions {
  authUser?: VerifiedAuthUser | undefined;
  serviceUserId?: string | undefined;
  role?: string | undefined;
}

const createDependencies = (options: DependencyOptions = {}): AuthDependencies => {
  const authUser = Object.hasOwn(options, "authUser") ? options.authUser : verifiedDriver;
  const serviceUserId = Object.hasOwn(options, "serviceUserId")
    ? options.serviceUserId
    : verifiedDriver.id;
  const role = Object.hasOwn(options, "role") ? options.role : "DRIVER";
  const authRepository: AuthRepository = {
    findUserId: async () => serviceUserId,
    findRoleByUserId: async () => role,
  };
  const supabaseAuthVerifier: SupabaseAuthVerifier = {
    // The verifier is mocked because these tests must not require a real token or Supabase project.
    verifyAccessToken: async () => authUser,
  };

  return { authRepository, supabaseAuthVerifier };
};

const getMe = (dependencies: AuthDependencies, authorization?: string) => {
  const testRequest = request(createApp(dependencies)).get("/auth/me");
  return authorization ? testRequest.set("Authorization", authorization) : testRequest;
};

describe("GET /auth/me", () => {
  it.each([undefined, "Basic token", "Bearer", "Bearer "])(
    "rejects a malformed Authorization header: %s",
    async (authorization) => {
      const response = await getMe(createDependencies(), authorization);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: "UNAUTHORIZED",
        requestId: response.headers["x-request-id"],
      });
    },
  );

  it("rejects an invalid Supabase token", async () => {
    const response = await getMe(createDependencies({ authUser: undefined }), "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("reports a verified Auth user that has no service user row", async () => {
    const response = await getMe(
      createDependencies({ serviceUserId: undefined }),
      "Bearer valid-token",
    );

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("USER_NOT_INITIALIZED");
  });

  it("reports a service user that has no assigned role", async () => {
    const response = await getMe(createDependencies({ role: undefined }), "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ROLE_NOT_ASSIGNED");
  });

  it("returns the shared DRIVER user and keeps its request ID on the success response", async () => {
    const response = await getMe(createDependencies(), "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body).toEqual({
      id: verifiedDriver.id,
      email: "driver@drivacy.test",
      role: "DRIVER",
    });
  });

  it("returns the shared INSURER user", async () => {
    const response = await getMe(createDependencies({ role: "INSURER" }), "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("INSURER");
  });

  it("rejects an invalid shared user result", async () => {
    const response = await getMe(
      createDependencies({ authUser: { ...verifiedDriver, email: "not-an-email" } }),
      "Bearer valid-token",
    );

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("AUTH_USER_INVALID");
  });
});

describe("requireRole", () => {
  const roleTestApp = (dependencies: AuthDependencies) => {
    const app = express();
    app.use(createRequireAuth(dependencies));
    app.get("/driver-only", requireRole("DRIVER"), (_request, response) => {
      response.status(204).end();
    });
    app.use(errorHandler);
    return app;
  };

  it("allows a DRIVER through a DRIVER-only route", async () => {
    const response = await request(roleTestApp(createDependencies()))
      .get("/driver-only")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(204);
  });

  it("returns FORBIDDEN when an INSURER uses a DRIVER-only route", async () => {
    const response = await request(roleTestApp(createDependencies({ role: "INSURER" })))
      .get("/driver-only")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });
});
