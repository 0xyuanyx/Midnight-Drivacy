import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PgAuthRepository } from "../src/auth/auth-repository.js";

describe("PgAuthRepository", () => {
  it("targets the partial Privy identity index when provisioning a driver", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("RETURNING id, email")) return { rows: [{ id: "driver-id", email: "driver@example.com" }] };
        if (sql.includes("LEFT JOIN public.user_roles")) return { rows: [{ id: "driver-id", email: "driver@example.com", role: "DRIVER" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const driver = await new PgAuthRepository(pool).completeDriverOnboarding({
      provider: "PRIVY",
      providerUserId: "did:privy:test",
      email: "driver@example.com",
      name: "홍길동",
      birthDate: "2000-01-01",
      phoneNumber: "01012345678",
    });

    expect(driver).toEqual({ id: "driver-id", email: "driver@example.com", role: "DRIVER" });
    expect(queries.find(sql => sql.includes("RETURNING id, email"))).toMatch(
      /ON CONFLICT \(auth_provider, auth_provider_user_id\)\s+WHERE auth_provider IS NOT NULL AND auth_provider_user_id IS NOT NULL\s+DO NOTHING/,
    );
    expect(queries).toContain("COMMIT");
  });
});
