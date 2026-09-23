import { describe, expect, it, vi } from "vitest";
import { ExternalFinalEvaluationAdapter } from "../src/final-evaluation/final-evaluation-adapter.js";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { "content-type": "application/json" } });

describe("ExternalFinalEvaluationAdapter", () => {
  it("queries the durable operation without inventing a new evaluation", async () => {
    const fetchImpl = vi.fn(async () => response({ contractVersion: "bc-v1", execution: "live", operationId: "operation", status: "pending" }));
    const adapter = new ExternalFinalEvaluationAdapter("https://c-wallet.example.invalid", "token", fetchImpl as typeof fetch);
    await expect(adapter.getEvaluationStatus("operation")).resolves.toMatchObject({ status: "pending" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://c-wallet.example.invalid/final-evaluations/operation");
  });
  it("fails closed on transport failure or malformed C responses", async () => {
    const unavailable = new ExternalFinalEvaluationAdapter("https://c-wallet.example.invalid", "token",
      vi.fn(async () => { throw new Error("network"); }) as typeof fetch);
    await expect(unavailable.getEvaluationStatus("operation")).rejects.toMatchObject({ code: "FINAL_EVALUATION_UNAVAILABLE" });
    const malformed = new ExternalFinalEvaluationAdapter("https://c-wallet.example.invalid", "token",
      vi.fn(async () => response({ status: "verified" })) as typeof fetch);
    await expect(malformed.getEvaluationStatus("operation")).rejects.toMatchObject({ code: "FINAL_EVALUATION_INVALID" });
  });
  it("rejects a status belonging to another operation", async () => {
    const adapter = new ExternalFinalEvaluationAdapter("https://c-wallet.example.invalid", "token",
      vi.fn(async () => response({ contractVersion: "bc-v1", execution: "live", operationId: "other", status: "pending" })) as typeof fetch);
    await expect(adapter.getEvaluationStatus("operation")).rejects.toMatchObject({ code: "FINAL_EVALUATION_MISMATCH" });
  });
});
