import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns the backend process health contract", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body).toEqual({ status: "ok", service: "drivacy-backend" });
  });

  it("returns an API error with the response correlation ID", async () => {
    const response = await request(createApp()).get("/missing-route");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      requestId: response.headers["x-request-id"],
    });
  });
});
