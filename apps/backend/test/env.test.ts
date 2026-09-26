import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadAuthOnlyEnvironment, loadEnvironment } from "../src/config/env.js";

const originalEnvironment = process.env;

describe("loadEnvironment", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      PORT: "3000",
      DATABASE_URL: "postgresql://user:password@localhost:5432/drivacy",
      PRIVY_APP_ID: "privy-app-id",
      PRIVY_APP_SECRET: "privy-app-secret",
      MIDNIGHT_NETWORK: "fixture",
      MIDNIGHT_ADAPTER_PROFILE: "test-adapter",
      C_WALLET_ADAPTER_URL: "https://c-wallet.example.invalid/",
      C_WALLET_ADAPTER_TOKEN: "adapter-token",
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it.each(["DATABASE_URL", "PRIVY_APP_ID", "PRIVY_APP_SECRET", "C_WALLET_ADAPTER_URL", "C_WALLET_ADAPTER_TOKEN"])(
    "fails clearly when %s is not configured",
    (name) => {
      delete process.env[name];

      expect(loadEnvironment).toThrow(`${name} must be configured before starting the backend`);
    },
  );

  it("loads the required database and Privy configuration", () => {
    expect(loadEnvironment()).toMatchObject({
      port: 3000,
      databaseUrl: process.env.DATABASE_URL,
      privyAppId: process.env.PRIVY_APP_ID,
      privyAppSecret: process.env.PRIVY_APP_SECRET,
      midnightNetwork: "fixture",
      midnightAdapterProfile: "test-adapter",
      cWalletAdapterUrl: "https://c-wallet.example.invalid/",
      cWalletAdapterToken: "adapter-token",
    });
  });

  it("loads a loopback auth server without C/Wallet configuration", () => {
    delete process.env.MIDNIGHT_NETWORK;
    delete process.env.MIDNIGHT_ADAPTER_PROFILE;
    delete process.env.C_WALLET_ADAPTER_URL;
    delete process.env.C_WALLET_ADAPTER_TOKEN;
    process.env.AUTH_ONLY_ALLOWED_ORIGIN = "http://localhost:8094";

    expect(loadAuthOnlyEnvironment()).toEqual({
      port: 3000,
      databaseUrl: process.env.DATABASE_URL,
      privyAppId: process.env.PRIVY_APP_ID,
      privyAppSecret: process.env.PRIVY_APP_SECRET,
      allowedOrigin: "http://localhost:8094",
    });
  });

  it("rejects a non-loopback origin for the auth-only server", () => {
    process.env.AUTH_ONLY_ALLOWED_ORIGIN = "https://example.com";
    expect(loadAuthOnlyEnvironment).toThrow("AUTH_ONLY_ALLOWED_ORIGIN must be a loopback http origin");
  });
});
