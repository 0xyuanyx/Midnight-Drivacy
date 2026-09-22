import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { DrivingRing, elapsedLabel } from "@/components/DrivingRing";
import { appReducer, initialAppState, normalizePersistedAppState } from "@/state/app-state";

describe("driving clock", () => {
  beforeEach(() => { AppState.currentState = "active"; jest.useFakeTimers(); jest.setSystemTime(new Date("2026-09-22T09:00:00Z")); });
  afterEach(() => jest.useRealTimers());

  it("ticks with wall time and resumes from the same start after remount", async () => {
    const start = Date.now();
    const view = await render(<DrivingRing startedAt={start} />);
    expect(view.getByText("00:00:00")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(view.getByText("00:00:02")).toBeTruthy();
    await view.unmount();
    jest.setSystemTime(start + 65000);
    const resumed = await render(<DrivingRing startedAt={start} />);
    expect(resumed.getByText("00:01:05")).toBeTruthy();
    await resumed.unmount();
  });

  it("persists a single start and freezes the end on repeated finish", () => {
    const ready = { ...initialAppState, hasConsented: true, selectedPolicyId: "policy-safe-driver" };
    const started = appReducer(ready, { type: "START_TRIP" });
    expect(started.tripStartedAt).toBe(Date.now());
    jest.advanceTimersByTime(5000);
    expect(appReducer(started, { type: "START_TRIP" }).tripStartedAt).toBe(started.tripStartedAt);
    expect(normalizePersistedAppState(started).tripStartedAt).toBe(started.tripStartedAt);
    const finished = appReducer(started, { type: "FINISH_TRIP" });
    jest.advanceTimersByTime(5000);
    expect(appReducer(finished, { type: "FINISH_TRIP" }).tripEndedAt).toBe(finished.tripEndedAt);
    expect(elapsedLabel(finished.tripStartedAt!, finished.tripEndedAt!)).toBe("00:00:05");
  });

  it("formats hour boundaries and clamps a backwards clock", () => {
    expect(elapsedLabel(1000, 3662000)).toBe("01:01:01");
    expect(elapsedLabel(2000, 1000)).toBe("00:00:00");
  });
});
