import type { Pool, PoolClient } from "pg";

/** 외부 source 삭제가 성공한 뒤에만 호출한다. Job 이력은 남기고 DB 원본 구간과 salt를 원자적으로 지운다. */
export async function purgeStoredTrip(pool: Pool, operationId: string, status: "db-confirmed" | "abandoned", token?: string): Promise<boolean> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string }>(`SELECT ds.id FROM public.chain_jobs j
      JOIN public.driving_sessions ds ON ds.trip_id=j.trip_id
      WHERE j.operation_id=$1 AND j.status=$2 AND j.deletion_status='pending'
        AND ($3::uuid IS NULL OR j.claim_token=$3::uuid)
      FOR UPDATE OF j,ds`, [operationId, status, token ?? null]);
    if (!found.rows[0]) { await client.query("COMMIT"); return false; }
    await client.query("DELETE FROM public.driving_segments WHERE driving_session_id=$1", [found.rows[0].id]);
    await client.query(`UPDATE public.driving_sessions SET dataset_salt=NULL,raw_deleted_at=clock_timestamp()
      WHERE id=$1`, [found.rows[0].id]);
    await client.query(`UPDATE public.chain_jobs SET deletion_status='deleted',claim_token=NULL,claim_expires_at=NULL
      WHERE operation_id=$1 AND status=$2 AND deletion_status='pending'`, [operationId, status]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
