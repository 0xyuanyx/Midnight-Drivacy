import type { Pool } from "pg";
import { ConfirmedStateSchema } from "@drivacy/shared";

import type { ConfirmedDrivingStateReader } from "./confirmed-state-reader.js";

/** Reads only a chain-confirmed DB snapshot; it never infers a state from sessions. */
export class PgConfirmedDrivingStateReader implements ConfirmedDrivingStateReader {
  public constructor(private readonly pool: Pool) {}

  public async getConfirmedDistanceM(evaluationScopeId: string): Promise<number | undefined> {
    const result = await this.pool.query<{ confirmedState: unknown }>(
      `SELECT cs.confirmed_state AS "confirmedState"
         FROM public.evaluation_scopes es
         JOIN public.chain_states cs
           ON cs.owner_user_id=es.owner_user_id
          AND cs.insurance_contract_id=es.insurance_contract_id
          AND cs.special_contract_id=es.special_contract_id
        WHERE es.id=$1`,
      [evaluationScopeId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const parsed = ConfirmedStateSchema.safeParse(row.confirmedState);
    if (!parsed.success) throw new Error("Stored confirmed state is invalid");
    return parsed.data.state.totals.distanceM;
  }
}
