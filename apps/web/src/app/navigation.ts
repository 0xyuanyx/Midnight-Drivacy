export type Workflow = "dashboard" | "evaluations";
export type DetailTab = "info" | "proof" | "history";

export interface LocationState {
  workflow: Workflow;
  requestId: string | null;
  tab: DetailTab;
  query: string;
  filter: "all" | "pending" | "review" | "completed";
}

export function readLocation(): LocationState {
  const params = new URLSearchParams(window.location.search);
  const workflow: Workflow = window.location.pathname.startsWith("/evaluations") ? "evaluations" : "dashboard";
  const rawTab = params.get("tab");
  const rawFilter = params.get("status");
  const filter = rawFilter === "pending" || rawFilter === "review" || rawFilter === "completed" ? rawFilter : "all";
  return { workflow, requestId: params.get("request"), tab: rawTab === "proof" || rawTab === "history" ? rawTab : "info", query: params.get("q") ?? "", filter };
}

export function toUrl(location: LocationState) {
  const params = new URLSearchParams();
  if (location.requestId) params.set("request", location.requestId);
  params.set("tab", location.tab);
  if (location.query) params.set("q", location.query);
  if (location.filter !== "all") params.set("status", location.filter);
  return `/${location.workflow}?${params.toString()}`;
}
