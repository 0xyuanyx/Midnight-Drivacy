import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

// Local-only, synthetic data shared by the two frontend previews. This is not the insurer API.
const applications = new Map();
const allowedPolicies = new Set(["policy-safe-driver", "policy-family-driver", "policy-weekend-driver"]);
const port = Number(process.env.DRIVACY_DEMO_BRIDGE_PORT ?? 3001);

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 4096) throw new Error("BODY_TOO_LARGE");
  }
  return JSON.parse(text);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, null);
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && path === "/health") return send(response, 200, { status: "ok", mode: "local-demo" });
  if (request.method === "GET" && path === "/applications") return send(response, 200, [...applications.values()].reverse());
  const match = /^\/applications\/([^/]+)$/.exec(path);
  if (request.method === "GET" && match) {
    const item = applications.get(match[1]);
    return send(response, item ? 200 : 404, item ?? { error: "APPLICATION_NOT_FOUND" });
  }
  if (request.method === "POST" && path === "/applications") {
    try {
      const body = await readBody(request);
      if (!allowedPolicies.has(body?.policyId) || typeof body?.submissionKey !== "string" || !/^[a-zA-Z0-9:-]{8,100}$/.test(body.submissionKey)) return send(response, 400, { error: "INVALID_APPLICATION" });
      const existing = [...applications.values()].find((item) => item.submissionKey === body.submissionKey);
      if (existing) return send(response, 200, existing);
      const item = { id: randomUUID(), submissionKey: body.submissionKey, policyId: body.policyId, riderName: "안전운전 할인특약", score: 87, distanceKm: 550, expectedDiscountPercent: 10, verificationStatus: "DEMO_UNVERIFIED", reviewStatus: "PENDING", submittedAt: new Date().toISOString(), decidedAt: null };
      applications.set(item.id, item);
      return send(response, 201, item);
    } catch { return send(response, 400, { error: "INVALID_APPLICATION" }); }
  }
  const decision = /^\/applications\/([^/]+)\/decision$/.exec(path);
  if (request.method === "POST" && decision) {
    const item = applications.get(decision[1]);
    if (!item) return send(response, 404, { error: "APPLICATION_NOT_FOUND" });
    if (item.reviewStatus !== "PENDING") return send(response, 409, { error: "ALREADY_DECIDED" });
    try {
      const body = await readBody(request);
      if (body?.decision !== "APPLIED" && body?.decision !== "REJECTED") return send(response, 400, { error: "INVALID_DECISION" });
      const updated = { ...item, reviewStatus: body.decision, decidedAt: new Date().toISOString() };
      applications.set(item.id, updated);
      return send(response, 200, updated);
    } catch { return send(response, 400, { error: "INVALID_DECISION" }); }
  }
  return send(response, 404, { error: "NOT_FOUND" });
});

server.listen(port, "127.0.0.1", () => console.log(`Drivacy local demo bridge: http://127.0.0.1:${port}`));
