import { createFixtureWorkspace, type WorkspaceState } from "../domain/workspace";

export interface InsurerWorkspaceAdapter {
  load(): Promise<WorkspaceState>;
  save(state: WorkspaceState): Promise<void>;
}

const storageKey = "drivacy:insurer-workspace:v2";

export const fixtureAdapter: InsurerWorkspaceAdapter = {
  async load() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return createFixtureWorkspace();
    const state = JSON.parse(saved) as WorkspaceState;
    if (state.requests.every((item) => item.displayId && item.result) && state.evaluations.every((item) => item.displayId)) return state;
    // Keep decisions made in the earlier demo while upgrading its presentation data.
    const reference = createFixtureWorkspace();
    return {
      requests: reference.requests.map((item) => { const old = state.requests.find((entry) => entry.id === item.id); return old && old.decision !== "pending" ? { ...item, decision: old.decision, status: old.status, history: old.history } : item; }),
      evaluations: reference.evaluations.map((item) => { const old = state.evaluations.find((entry) => entry.id === item.id); return old && old.decision !== "pending" ? { ...item, decision: old.decision, status: old.status, history: old.history } : item; }),
    };
  },
  async save(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  },
};
