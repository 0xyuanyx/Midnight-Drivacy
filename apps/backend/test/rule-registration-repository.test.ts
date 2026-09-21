import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { ConfirmedState, RegisteredRule, Scope } from "@drivacy/shared";
import { PgRuleRegistrationRepository } from "../src/rule-registration/rule-registration-repository.js";

const scope: Scope = {
  applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "special",
  evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" },
};
const registered = { ruleHash: "hash" } as RegisteredRule;
const genesis = { state: { scope, stateCommitment: "genesis", version: 0 } } as ConfirmedState;
const deployment = { evaluationScopeId: "scope", adapterProfile: "profile", network: "local" as const,
  chainContractAddress: "address", deploymentTransactionId: "deploy-tx" };
const registration = { ruleVersionId: "rule-version", ruleHash: "hash", registrationTransactionId: "register-tx" };

function repository(failStateInsert: boolean, failAttemptUpdate = false) {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (failStateInsert && sql.includes("INSERT INTO public.chain_states")) throw new Error("STATE_INSERT_FAILED");
      if (sql.includes("INSERT INTO public.chain_scope_deployments")) return { rows: [{ id: "deployment" }] };
      if (sql.includes("INSERT INTO public.rule_registrations")) return { rows: [{ id: "registration" }] };
      if (sql.includes("UPDATE public.initial_registration_attempts")) return { rows: [], rowCount: failAttemptUpdate ? 0 : 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { released = true; },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { repo: new PgRuleRegistrationRepository(pool), statements, get released() { return released; } };
}

describe("initial Rule/Genesis persistence", () => {
  it("discards a connection if session-lock release fails", async () => {
    let discarded: boolean | undefined;
    const client = {
      async query(sql: string) {
        if (sql.includes("pg_advisory_unlock")) throw new Error("UNLOCK_FAILED");
        return { rows: [], rowCount: 1 };
      },
      release(value?: boolean) { discarded = value; },
    };
    const repo = new PgRuleRegistrationRepository({ connect: async () => client } as unknown as Pool);
    await expect(repo.withRegistrationLock("scope", { network: "local", adapterProfile: "profile" },
      async () => undefined)).rejects.toThrow("UNLOCK_FAILED");
    expect(discarded).toBe(true);
  });

  it("uses one DB connection for the lock, durable reservation and final transaction", async () => {
    const statements: string[] = [];
    let connects = 0, releases = 0;
    const client = {
      async query(sql: string, args?: unknown[]) {
        statements.push(sql);
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }], rowCount: 1 };
        if (sql.includes("INSERT INTO public.initial_registration_attempts"))
          return { rows: [{ operation_id: args?.[0], rule_version_id: args?.[2] }], rowCount: 1 };
        if (sql.includes("INSERT INTO public.chain_scope_deployments")) return { rows: [{ id: "deployment" }], rowCount: 1 };
        if (sql.includes("INSERT INTO public.rule_registrations")) return { rows: [{ id: "registration" }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
      release() { releases++; },
    };
    const pool = { async connect() { connects++; if (connects > 1) throw new Error("POOL_EXHAUSTED");return client; },
      async query() { throw new Error("SECOND_CONNECTION_USED"); } } as unknown as Pool;
    const repo = new PgRuleRegistrationRepository(pool);
    await repo.withRegistrationLock("scope", { network: "local", adapterProfile: "profile" }, async () => {
      const attempt = await repo.reserveInitialAttempt("scope", "rule-version", { network: "local", adapterProfile: "profile" });
      expect(attempt.created).toBe(true);
      await repo.findDeployment("scope", { network: "local", adapterProfile: "profile" });
      await repo.createInitialRegistration(attempt.operationId, deployment, registration, registered, genesis);
    });
    expect(connects).toBe(1);
    expect(releases).toBe(1);
    expect(statements[0]).toContain("pg_advisory_lock");
    expect(statements.indexOf("BEGIN")).toBeGreaterThan(statements.findIndex(s => s.includes("INSERT INTO public.initial_registration_attempts")));
    expect(statements.at(-1)).toContain("pg_advisory_unlock");
  });

  it("commits current Rule only after the confirmed State insert", async () => {
    const probe = repository(false);
    await probe.repo.createInitialRegistration("attempt", deployment, registration, registered, genesis);
    const text = probe.statements.join("\n");
    expect(probe.statements[0]).toBe("BEGIN");
    expect(text.indexOf("INSERT INTO public.chain_states")).toBeLessThan(text.indexOf("UPDATE public.chain_scope_deployments"));
    expect(text.indexOf("UPDATE public.initial_registration_attempts")).toBeGreaterThan(text.indexOf("UPDATE public.chain_scope_deployments"));
    expect(probe.statements.at(-1)).toBe("COMMIT");
    expect(probe.released).toBe(true);
  });

  it("rolls back deployment and registration when Genesis cannot be stored", async () => {
    const probe = repository(true);
    await expect(probe.repo.createInitialRegistration("attempt", deployment, registration, registered, genesis))
      .rejects.toThrow("STATE_INSERT_FAILED");
    expect(probe.statements.some(s => s.includes("UPDATE public.chain_scope_deployments"))).toBe(false);
    expect(probe.statements.at(-1)).toBe("ROLLBACK");
    expect(probe.released).toBe(true);
  });

  it("rolls back if the reserved attempt does not match", async () => {
    const probe = repository(false, true);
    await expect(probe.repo.createInitialRegistration("wrong-attempt", deployment, registration, registered, genesis))
      .rejects.toThrow("INITIAL_REGISTRATION_ATTEMPT_MISMATCH");
    expect(probe.statements.at(-1)).toBe("ROLLBACK");
    expect(probe.released).toBe(true);
  });
});
