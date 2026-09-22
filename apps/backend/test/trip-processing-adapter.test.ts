import { describe, expect, it, vi } from "vitest";

import { ExternalTripProcessingAdapter } from "../src/chain-state/trip-processing-adapter.js";

const response = (body: unknown, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

describe("ExternalTripProcessingAdapter", () => {
  it("queries C by the existing operationId and authenticates the external boundary", async () => {
    const status = { contractVersion: "bc-v1", execution: "live", operationId: "operation",
      tripId: "trip", status: "chain-unknown", transactionId: "transaction" };
    const fetchImpl = vi.fn(async () => response(status));
    const adapter = new ExternalTripProcessingAdapter("https://c-wallet.example.invalid", "token", fetchImpl as typeof fetch);

    await expect(adapter.getTripStatus("operation")).resolves.toEqual(status);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://c-wallet.example.invalid/trip-processing/operation");
    expect(init.headers).toMatchObject({ authorization: "Bearer token" });
  });

  it("fails closed instead of interpreting a transport failure as not submitted", async () => {
    const adapter = new ExternalTripProcessingAdapter("https://c-wallet.example.invalid", "token",
      vi.fn(async () => { throw new Error("network"); }) as typeof fetch);

    await expect(adapter.getTripStatus("operation")).rejects.toMatchObject({
      code: "CHAIN_ADAPTER_UNAVAILABLE", statusCode: 503,
    });
  });

  it("rejects an invalid C payload and requires adapter credentials", async () => {
    const adapter = new ExternalTripProcessingAdapter("https://c-wallet.example.invalid", "token",
      vi.fn(async () => response({ status: "submitted" })) as typeof fetch);
    await expect(adapter.getTripStatus("operation")).rejects.toMatchObject({ code: "CHAIN_PROCESSING_INVALID" });
    expect(() => new ExternalTripProcessingAdapter("https://c-wallet.example.invalid", " ")).toThrow(
      "C_WALLET_ADAPTER_TOKEN must be configured",
    );
  });
});
