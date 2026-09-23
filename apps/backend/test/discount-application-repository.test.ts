import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgDiscountApplicationRepository } from "../src/final-evaluation/discount-application-repository.js";

describe("PgDiscountApplicationRepository security predicates", () => {
  it("reserves only the owner's selected special contract and current confirmed non-genesis State atomically", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await new PgDiscountApplicationRepository({ query } as unknown as Pool)
      .reserve("owner", "contract", "special", "operation", "local", "profile");
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("c.owner_user_id=es.owner_user_id");
    expect(sql).toContain("special_contract_selections");
    expect(sql).toContain("d.current_rule_version_id");
    expect(sql).toContain("cs.version>0");
    expect(sql).toContain("ON CONFLICT(evaluation_scope_id,state_commitment) DO UPDATE");
  });
  it("scopes insurer reads and decisions through membership and the contract insurer", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const repository = new PgDiscountApplicationRepository({ query } as unknown as Pool);
    await repository.listForInsurer("member"); await repository.findForInsurer("application", "member");
    await repository.decide("application", "member", "APPLIED");
    for (const [sql] of query.mock.calls) {
      expect(String(sql)).toContain("insurer_memberships");
      expect(String(sql)).toContain("c.insurer_id");
    }
  });
  it("does not select private confirmed State payloads for insurer or driver response queries", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PgDiscountApplicationRepository({ query } as unknown as Pool);
    await repository.listOwned("owner"); await repository.listForInsurer("member");
    for (const [sql] of query.mock.calls) {
      expect(String(sql)).not.toContain("confirmed_state");
      expect(String(sql)).not.toContain("driving_segments");
    }
  });
  it("claims only due pending review rows with SKIP LOCKED and an expiring lease", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PgDiscountApplicationRepository({ query } as unknown as Pool);
    await repository.claimDue(new Date(), 25, "11111111-1111-4111-8111-111111111111");
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("verification_status='PENDING'");
    expect(sql).toContain("review_status='PENDING_REVIEW'");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("recovery_claim_expires_at<=clock_timestamp()");
    expect(sql).not.toContain("confirmed_state");
  });
  it("releases only the live claim while the application is still pending", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new PgDiscountApplicationRepository({ query } as unknown as Pool);
    await repository.scheduleStatusCheck("application", "claim", new Date(), "STATUS_UNKNOWN");
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("verification_status='PENDING'");
    expect(sql).toContain("recovery_claim_token=$2");
    expect(sql).toContain("recovery_claim_expires_at>clock_timestamp()");
  });
  it("makes terminal verification transitions conditional and clears recovery scheduling", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const repository = new PgDiscountApplicationRepository({ query } as unknown as Pool);
    await repository.markVerified("application", { resultCommitment: "result", nullifier: "nullifier", transactionId: "transaction" });
    await repository.markFailed("application");
    for (const [sql] of query.mock.calls) {
      expect(String(sql)).toContain("verification_status='PENDING'");
      expect(String(sql)).toContain("recovery_claim_token=NULL");
      expect(String(sql)).toContain("next_status_check_at=NULL");
      expect(String(sql)).not.toContain("review_status=");
    }
  });
});
