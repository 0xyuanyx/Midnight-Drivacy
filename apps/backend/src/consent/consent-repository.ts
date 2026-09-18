import type { Pool } from "pg";

export interface ConsentRow {
  consented: boolean;
  consentedAt: Date | string | null;
}

export interface ConsentRepository {
  findGrantedConsent(userId: string): Promise<ConsentRow | undefined>;
  grantConsent(userId: string): Promise<ConsentRow>;
}

export class PgConsentRepository implements ConsentRepository {
  public constructor(private readonly pool: Pool) {}

  public async findGrantedConsent(userId: string): Promise<ConsentRow | undefined> {
    // 동의 row가 없다는 것은 아직 동의하지 않았다는 뜻이며 null timestamp DTO를 만들지 않는다.
    const result = await this.pool.query<ConsentRow>(
      `SELECT consented, consented_at AS "consentedAt"
       FROM public.consents
       WHERE user_id = $1 AND consented = true AND consented_at IS NOT NULL`,
      [userId],
    );

    return result.rows[0];
  }

  public async grantConsent(userId: string): Promise<ConsentRow> {
    // user_id UNIQUE로 동시 요청도 한 현재 동의 row로 수렴시킨다.
    const result = await this.pool.query<ConsentRow>(
      `INSERT INTO public.consents (user_id, consented, consented_at)
       VALUES ($1, true, now())
       ON CONFLICT (user_id) DO UPDATE
       SET consented = true,
           consented_at = COALESCE(public.consents.consented_at, EXCLUDED.consented_at)
       RETURNING consented, consented_at AS "consentedAt"`,
      [userId],
    );

    return result.rows[0];
  }
}
