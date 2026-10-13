import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { purgeStoredTrip } from "../src/chain-state/purge-stored-trip.js";

describe("purgeStoredTrip transaction boundary", () => {
  it("deletes DB segments and salt before marking a confirmed job deleted", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT ds.id") ? [{ id: "session" }] : [], rowCount: 1 }));
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;

    await expect(purgeStoredTrip(pool, "operation", "db-confirmed")).resolves.toBe(true);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toEqual([
      "BEGIN", expect.stringContaining("j.status=$2"),
      expect.stringContaining("DELETE FROM public.driving_segments"),
      expect.stringContaining("dataset_salt=NULL"),
      expect.stringContaining("deletion_status='deleted'"), "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not delete pending or unclaimed jobs", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(purgeStoredTrip(pool, "operation", "abandoned", "wrong-claim")).resolves.toBe(false);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", expect.stringContaining("j.claim_token=$3::uuid"), "COMMIT"]);
  });
});
