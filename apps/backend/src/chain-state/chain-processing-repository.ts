import type { AdapterRuntime, Scope, Trip } from "@drivacy/shared";
import type { Pool } from "pg";

export interface ChainProcessingTarget {
  sessionId: string;
  ownerUserId: string;
  scope: Scope;
  registeredRule: unknown;
  confirmedState: unknown;
  trip: Trip;
}

export interface ChainProcessingRepository {
  findEndedSession(userId: string, sessionId: string, runtime: AdapterRuntime): Promise<ChainProcessingTarget | undefined>;
}

interface TargetRow {
  sessionId: string; ownerUserId: string; applicantId: string; contractId: string;
  insurerId: string; endorsementId: string; evaluationPeriodId: string;
  evaluationStartsOn: string; evaluationEndsOn: string; tripId: string; datasetSalt: string;
  registeredRule: unknown; confirmedState: unknown;
}

interface SegmentRow {
  index: number; distanceM: string; durationSeconds: string;
  speedingCount: string; accelerationCount: string; brakingCount: string;
}

const uint32 = (value: string, field: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new Error(`Stored driving segment ${field} is invalid`);
  }
  return parsed;
};

export class PgChainProcessingRepository implements ChainProcessingRepository {
  public constructor(private readonly pool: Pool) {}

  public async findEndedSession(userId: string, sessionId: string, runtime: AdapterRuntime): Promise<ChainProcessingTarget | undefined> {
    const target = await this.pool.query<TargetRow>(
      `SELECT ds.id AS "sessionId", es.owner_user_id AS "ownerUserId",
              es.owner_user_id AS "applicantId", es.insurance_contract_id AS "contractId",
              c.insurer_id AS "insurerId", es.special_contract_id AS "endorsementId",
              es.evaluation_period_id AS "evaluationPeriodId",
              es.evaluation_starts_on::text AS "evaluationStartsOn",
              es.evaluation_ends_on::text AS "evaluationEndsOn", ds.trip_id AS "tripId",
              ds.dataset_salt AS "datasetSalt", cs.registered_rule AS "registeredRule",
              cs.confirmed_state AS "confirmedState"
         FROM public.driving_sessions ds
         JOIN public.evaluation_scopes es ON es.id=ds.evaluation_scope_id
         JOIN public.insurance_contracts c ON c.id=es.insurance_contract_id
         JOIN public.chain_scope_deployments d
           ON d.evaluation_scope_id=es.id AND d.network=$3 AND d.adapter_profile=$4
         JOIN public.rule_registrations rr
           ON rr.chain_scope_deployment_id=d.id AND rr.rule_version_id=d.current_rule_version_id
         JOIN public.rule_versions rv ON rv.id=d.current_rule_version_id
         JOIN public.chain_states cs
           ON cs.owner_user_id=es.owner_user_id
          AND cs.insurance_contract_id=es.insurance_contract_id
          AND cs.special_contract_id=es.special_contract_id
          AND cs.registered_rule->>'ruleHash'=rr.rule_hash
          AND cs.registered_rule #>> '{rule,version}'=rv.version::text
        WHERE ds.id=$1 AND es.owner_user_id=$2 AND ds.status='ENDED'`,
      [sessionId, userId, runtime.network, runtime.adapterProfile],
    );
    const row = target.rows[0];
    if (!row) return undefined;
    const segments = await this.pool.query<SegmentRow>(
      `SELECT segment_index AS index, distance_m AS "distanceM", duration_seconds AS "durationSeconds",
              speeding_count AS "speedingCount", acceleration_count AS "accelerationCount",
              braking_count AS "brakingCount"
         FROM public.driving_segments WHERE driving_session_id=$1 ORDER BY segment_index`,
      [sessionId],
    );
    return {
      sessionId: row.sessionId,
      ownerUserId: row.ownerUserId,
      scope: {
        applicantId: row.applicantId, contractId: row.contractId, insurerId: row.insurerId,
        endorsementId: row.endorsementId,
        evaluationPeriod: { id: row.evaluationPeriodId, startDate: row.evaluationStartsOn, endDate: row.evaluationEndsOn },
      },
      registeredRule: row.registeredRule,
      confirmedState: row.confirmedState,
      trip: {
        id: row.tripId, source: "simulated", collectionEnabled: true, datasetSalt: row.datasetSalt,
        records: segments.rows.map(segment => ({
          index: segment.index, distanceM: uint32(segment.distanceM, "distanceM"),
          durationSeconds: uint32(segment.durationSeconds, "durationSeconds"),
          speedingCount: uint32(segment.speedingCount, "speedingCount"),
          accelerationCount: uint32(segment.accelerationCount, "accelerationCount"),
          brakingCount: uint32(segment.brakingCount, "brakingCount"),
        })),
      },
    };
  }
}
