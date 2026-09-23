import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

import type { Environment } from "../src/config/env.js";
import { createRuntimeApp } from "../src/runtime-app.js";
import type { RuleRegistrationAdapter } from "../src/rule-registration/rule-registration-adapter.js";
import type { TripProcessingAdapter } from "../src/runtime-app.js";

const environment: Environment = {
  nodeEnv: "test", port: 3000, databaseUrl: "postgresql://unused",
  privyAppId: "privy-app-id", privyAppSecret: "privy-app-secret",
  midnightNetwork: "preprod", midnightAdapterProfile: "production-adapter",
  cWalletAdapterUrl: "https://c-wallet.example.invalid", cWalletAdapterToken: "secret",
};

describe("production runtime composition", () => {
  it("mounts the Rule Registration route through the injected C/Wallet boundary", async () => {
    const pool = { query: async () => { throw new Error("authentication should reject before DB access"); } } as unknown as Pool;
    const adapter = {} as RuleRegistrationAdapter;
    const tripAdapter = {} as TripProcessingAdapter;
    const app = createRuntimeApp(environment, pool, adapter, tripAdapter, {} as never);

    const result = await request(app)
      .post("/special-contracts/11111111-1111-4111-8111-111111111111/rules/1/register");

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ code: "UNAUTHORIZED" });

    const processing = await request(app)
      .post("/driving-sessions/11111111-1111-4111-8111-111111111111/process")
      .set("Idempotency-Key", "processing-key");
    expect(processing.status).toBe(401);

    const application = await request(app).post("/discount-applications");
    expect(application.status).toBe(401);
  });
});
