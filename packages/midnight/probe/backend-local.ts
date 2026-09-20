// 격리된 로컬 PostgreSQL과 모의 원본 파일만 사용하는 실제 B 서비스 통합 검사다.
// Supabase Auth/Storage 또는 운영 DB에 접속하는 경로를 넣지 않는다.
import { strict as assert } from "node:assert";
import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { Pool } from "pg";
import { ChainFinalizer } from "../../../apps/backend/src/chain-state/chain-finalizer.js";
import { ConfirmedStateSchema, type CalculateTripRequest, type ConfirmedState,
  type RegisteredRule, type TripProcessingResult, type User } from "../../shared/src/index.js";
import { demoScope } from "./driving-fixtures.js";

export async function startBackendProbe(reader: (id: string) => Promise<TripProcessingResult>, safeAbandon: (id: string) => Promise<boolean>) {
  const pool = new Pool({ host: "127.0.0.1", port: 55439, database: "drivacy_integration",
    user: "postgres", password: "Public-Local-Fixture-Only" });
  const actor: User = { id: demoScope.applicantId, email: "fixture@example.invalid", role: "DRIVER" };
  await pool.query("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)");
  for (const migration of ["20260917142636_initial_first_vertical.sql", "20260918025120_add_special_contract_selection.sql", "20260918060000_chain_state_confirmation.sql"]) {
    await pool.query(await readFile(new URL(`../../../db/migrations/${migration}`, import.meta.url), "utf8"));
  }
  await pool.query("INSERT INTO auth.users(id) VALUES($1);", [actor.id]);
  await pool.query("INSERT INTO public.users(id) VALUES($1)", [actor.id]);
  await pool.query("INSERT INTO public.insurers(id,name) VALUES($1,'Offline fixture insurer')", [demoScope.insurerId]);
  await pool.query(`INSERT INTO public.insurance_contracts(id,owner_user_id,insurer_id,coverage_starts_at,coverage_ends_at,status)
    VALUES($1,$2,$3,'2026-09-01','2026-09-30','active')`, [demoScope.contractId, actor.id, demoScope.insurerId]);
  await pool.query(`INSERT INTO public.special_contracts(id,insurance_contract_id,name,is_eligible,status)
    VALUES($1,$2,'Offline fixture endorsement',true,'active')`, [demoScope.endorsementId, demoScope.contractId]);
  await pool.query("INSERT INTO public.special_contract_selections(insurance_contract_id,special_contract_id) VALUES($1,$2)", [demoScope.contractId, demoScope.endorsementId]);
  // COMMIT 실패 이전에 State와 작업 상태가 함께 rollback되는지 검사할 trigger다.
  await pool.query(`CREATE TABLE fixture_failures(name text PRIMARY KEY);
    CREATE FUNCTION fixture_reject_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM fixture_failures WHERE name='db') THEN RAISE EXCEPTION 'FIXTURE_DB_FAILURE'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER fixture_commit_failure BEFORE UPDATE ON chain_jobs FOR EACH ROW
      WHEN (NEW.status='db-confirmed') EXECUTE FUNCTION fixture_reject_commit()`);
  let deletionFailure = false;
  let chainReads = 0;
  const service = new ChainFinalizer(pool, { async getTripStatus(id) { chainReads++; return reader(id); }, canAbandonTrip: safeAbandon }, {
    async load(key) { return JSON.parse(await readFile(key, "utf8")) as CalculateTripRequest; },
    async delete(key) { if (deletionFailure) throw new Error("FIXTURE_STORAGE_FAILURE");
      await unlink(key).catch(error => { if (error.code !== "ENOENT") throw error; }); },
  });
  const sourcePath = (id: string) => new URL(`./private-source-${id}.json`, import.meta.url);
  return {
    async register(registered: RegisteredRule, initial: ConfirmedState) {
      await assert.rejects(() => service.registerInitial({ ...actor, role: "INSURER" }, registered, initial), /NOT_AUTHORIZED/);
      await service.registerInitial(actor, registered, initial);
      const client = await pool.connect();
      try { await client.query("SET ROLE authenticated");
        await assert.rejects(() => client.query("SELECT * FROM public.chain_states"), /permission denied/);
      } finally { await client.query("RESET ROLE"); client.release(); }
    },
    async stage(request: CalculateTripRequest) {
      const path = sourcePath(request.operationId);
      await writeFile(path, JSON.stringify(request));
      // sourceKey는 URL 문자열 대신 실제 내부 파일 경로다.
      const { fileURLToPath } = await import("node:url");
      const key = fileURLToPath(path);
      await service.createJob(actor, request, key);
      await service.createJob(actor, request, key);
      await assert.rejects(() => service.createJob(actor, { ...request,
        operationId: `${request.operationId}-competing`, idempotencyKey: `${request.idempotencyKey}-competing` }, key), /SCOPE_BUSY/);
      await assert.rejects(() => service.createJob(actor, { ...request, trip: { ...request.trip, datasetSalt: "f".repeat(64) } }, key), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(() => service.deleteConfirmedSource(actor, request.operationId), /DB_NOT_CONFIRMED/);
    },
    async abandon(request: CalculateTripRequest) {
      await assert.rejects(() => service.abandonJob({ ...actor, role: "INSURER" }, request.operationId), /NOT_AUTHORIZED/);
      await service.abandonJob(actor, request.operationId);
      await service.abandonJob(actor, request.operationId);
      const row = await pool.query("SELECT status FROM chain_jobs WHERE operation_id=$1", [request.operationId]);
      assert.equal(row.rows[0].status, "abandoned");
      await access(sourcePath(request.operationId));
      const { fileURLToPath } = await import("node:url");
      await assert.rejects(() => service.createJob(actor, request, fileURLToPath(sourcePath(request.operationId))), /JOB_ABANDONED/);
      await assert.rejects(() => service.deleteConfirmedSource(actor, request.operationId), /DB_NOT_CONFIRMED/);
    },
    async expectAbandonBlocked(request: CalculateTripRequest) {
      await assert.rejects(() => service.abandonJob(actor, request.operationId), /ABANDONMENT_NOT_SAFE/);
      const row = await pool.query("SELECT status FROM chain_jobs WHERE operation_id=$1", [request.operationId]);
      assert.equal(row.rows[0].status, "pending");
    },
    async finish(request: CalculateTripRequest, injectFailure: boolean): Promise<ConfirmedState> {
      await assert.rejects(() => service.abandonJob(actor, request.operationId), /ABANDONMENT_NOT_SAFE/);
      const oldToken = await service.claim(actor, request.operationId);
      await assert.rejects(() => service.claim(actor, request.operationId), /CLAIM_UNAVAILABLE/);
      await pool.query("UPDATE chain_jobs SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE operation_id=$1", [request.operationId]);
      const token = await service.claim(actor, request.operationId);
      await assert.rejects(() => service.finalize(actor, request.operationId, oldToken), /STALE_CLAIM/);
      await assert.rejects(() => service.finalize({ ...actor, id: "00000000-0000-4000-8000-000000000099" }, request.operationId, token), /NOT_AUTHORIZED/);
      if (injectFailure) {
        await pool.query("INSERT INTO fixture_failures VALUES('db')");
        await assert.rejects(() => service.finalize(actor, request.operationId, token), /FIXTURE_DB_FAILURE/);
        const prior = await pool.query("SELECT state_commitment FROM chain_states");
        assert.equal(prior.rows[0].state_commitment, request.previous.state.stateCommitment);
        const job = await pool.query("SELECT status,deletion_status FROM chain_jobs WHERE operation_id=$1", [request.operationId]);
        assert.equal(job.rows[0].status, "pending"); assert.equal(job.rows[0].deletion_status, "pending");
        await access(sourcePath(request.operationId));
        await pool.query("DELETE FROM fixture_failures");
      }
      assert.equal((await service.finalize(actor, request.operationId, token))?.status, "chain-confirmed");
      deletionFailure = injectFailure;
      if (injectFailure) await assert.rejects(() => service.deleteConfirmedSource(actor, request.operationId), /FIXTURE_STORAGE_FAILURE/);
      const confirmed = await pool.query("SELECT confirmed_state FROM chain_states");
      const result = ConfirmedStateSchema.parse(confirmed.rows[0].confirmed_state);
      assert.equal(result.state.version, request.previous.state.version + 1);
      deletionFailure = false;
      await service.deleteConfirmedSource(actor, request.operationId);
      await assert.rejects(() => access(sourcePath(request.operationId)), /ENOENT/);
      const reads = chainReads;
      await service.finalize(actor, request.operationId, token);
      await service.deleteConfirmedSource(actor, request.operationId);
      assert.equal(chainReads, reads, "Completed DB job queried C again");
      return result;
    },
    stop: () => pool.end(),
  };
}
