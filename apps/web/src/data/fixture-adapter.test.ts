import { applyDecision, createFixtureWorkspace } from "../domain/workspace";
import { fixtureAdapter } from "./fixture-adapter";

describe("fixture adapter", () => {
  it("restores saved demo decisions on the next load", async () => {
    const decided = applyDecision(createFixtureWorkspace(), { workflow: "dashboard", requestId: "REQ-240921-018", decision: "approved" });
    await fixtureAdapter.save(decided);

    const restored = await fixtureAdapter.load();

    expect(restored.requests.find((item) => item.id === "REQ-240921-018")?.decision).toBe("approved");
  });

  it("upgrades earlier demo data without losing saved decisions", async () => {
    const decided = applyDecision(createFixtureWorkspace(), { workflow: "dashboard", requestId: "REQ-240921-018", decision: "approved" });
    const legacy = { ...decided, requests: decided.requests.map((item) => ({ ...item, displayId: undefined, result: undefined })), evaluations: decided.evaluations.map((item) => ({ ...item, displayId: undefined })) };
    localStorage.setItem("drivacy:insurer-workspace:v2", JSON.stringify(legacy));
    const restored = await fixtureAdapter.load();
    expect(restored.requests[0].decision).toBe("approved");
    expect(restored.requests[0].result.score).toBe(87);
    expect(restored.evaluations[0].displayId).toBe("DRV-260913-08");
  });
});
