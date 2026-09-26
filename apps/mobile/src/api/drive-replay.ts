interface SegmentTiming { index: number; durationSeconds: number }

/** In-memory presentation only. Raw records and salts are never persisted in AppState. */
export function replayProgress(records: readonly SegmentTiming[], elapsedSeconds: number) {
  if (records.length === 0 || records.some((record, index) => record.index !== index
    || !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0)) {
    throw new Error("운행 기록 형식이 올바르지 않습니다.");
  }
  let completed = 0;
  let boundary = 0;
  for (const record of records) {
    boundary += record.durationSeconds;
    if (elapsedSeconds < boundary) break;
    completed += 1;
  }
  return { completed, total: records.length, complete: completed === records.length };
}
