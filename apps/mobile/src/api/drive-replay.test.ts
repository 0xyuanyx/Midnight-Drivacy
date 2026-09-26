import { replayProgress } from "./drive-replay";

it("replays the server's segment durations without inventing records or finishing early", () => {
  const records = [{ index: 0, durationSeconds: 10 }, { index: 1, durationSeconds: 20 }, { index: 2, durationSeconds: 15 }];
  expect(replayProgress(records, 9)).toEqual({ completed: 0, total: 3, complete: false });
  expect(replayProgress(records, 10)).toEqual({ completed: 1, total: 3, complete: false });
  expect(replayProgress(records, 44)).toEqual({ completed: 2, total: 3, complete: false });
  expect(replayProgress(records, 45)).toEqual({ completed: 3, total: 3, complete: true });
});

it("rejects malformed or missing server records", () => {
  expect(() => replayProgress([], 10)).toThrow("운행 기록");
  expect(() => replayProgress([{ index: 1, durationSeconds: 10 }], 10)).toThrow("운행 기록");
});
