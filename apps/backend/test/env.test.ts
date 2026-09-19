import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/env.js";

const originalEnvironment = process.env;

describe("loadEnvironment", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      PORT: "3000",
      DATABASE_URL: "postgresql://user:password@localhost:5432/drivacy",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      MIDNIGHT_NETWORK: "fixture",
      MIDNIGHT_ADAPTER_PROFILE: "test-adapter",
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it.each(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])(
    "fails clearly when %s is not configured",
    (name) => {
      delete process.env[name];

      expect(loadEnvironment).toThrow(`${name} must be configured before starting the backend`);
    },
  );

  it("loads the required database and Supabase configuration", () => {
    expect(loadEnvironment()).toMatchObject({
      port: 3000,
      databaseUrl: process.env.DATABASE_URL,
      supabaseUrl: process.env.SUPABASE_URL,
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      midnightNetwork: "fixture",
      midnightAdapterProfile: "test-adapter",
    });
  });
});
