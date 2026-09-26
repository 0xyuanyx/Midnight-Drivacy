import type { Pool, PoolClient } from "pg";

export interface CompleteDriverOnboardingInput {
  provider: string;
  providerUserId: string;
  email: string;
  name: string;
  birthDate: string;
  phoneNumber: string;
}

export interface OnboardedDriverRow {
  id: string;
  email: string | undefined;
  role: string | undefined;
}

export interface AuthRepository {
  findUserByProviderIdentity(
    provider: string,
    providerUserId: string,
  ): Promise<{ id: string; email: string | undefined } | undefined>;
  findRoleByUserId(userId: string): Promise<string | undefined>;
  completeDriverOnboarding(input: CompleteDriverOnboardingInput): Promise<OnboardedDriverRow>;
}

export class PgAuthRepository implements AuthRepository {
  public constructor(private readonly pool: Pool) {}

  public async findUserByProviderIdentity(
    provider: string,
    providerUserId: string,
  ): Promise<{ id: string; email: string | undefined } | undefined> {
    // 외부 DID는 매핑 조회에만 쓰고, 이후 업무 권한에는 내부 UUID만 사용한다.
    const result = await this.pool.query<{ id: string; email: string | null }>(
      `SELECT id, email
       FROM public.users
       WHERE auth_provider = $1 AND auth_provider_user_id = $2`,
      [provider, providerUserId],
    );

    const user = result.rows[0];
    return user ? { id: user.id, email: user.email ?? undefined } : undefined;
  }

  public async findRoleByUserId(userId: string): Promise<string | undefined> {
    // Roles come from the service database, never mutable client input or JWT metadata.
    const result = await this.pool.query<{ role: string }>(
      "SELECT role FROM public.user_roles WHERE user_id = $1",
      [userId],
    );

    return result.rows[0]?.role;
  }

  public async completeDriverOnboarding(
    input: CompleteDriverOnboardingInput,
  ): Promise<OnboardedDriverRow> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string; email: string }>(
        `INSERT INTO public.users (
           id, auth_provider, auth_provider_user_id, email, name, birth_date,
           phone_number, profile_completed_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, clock_timestamp()
         )
         ON CONFLICT (auth_provider, auth_provider_user_id)
           WHERE auth_provider IS NOT NULL AND auth_provider_user_id IS NOT NULL
         DO NOTHING
         RETURNING id, email`,
        [
          input.provider,
          input.providerUserId,
          input.email,
          input.name,
          input.birthDate,
          input.phoneNumber,
        ],
      );

      if (created.rows[0]) {
        // 사용자와 DRIVER 역할은 같은 transaction에서 생성되어 반쪽 계정이 남지 않는다.
        await client.query(
          "INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'DRIVER')",
          [created.rows[0].id],
        );
      }

      // ON CONFLICT 경로도 별도 statement로 읽어, 경쟁 요청이 확정한 단일 행을 반환한다.
      const user = await this.selectOnboardedDriver(client, input.provider, input.providerUserId);
      if (!user) {
        throw new Error("Driver onboarding user was not available after insert");
      }

      await client.query("COMMIT");
      return user;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async selectOnboardedDriver(
    client: PoolClient,
    provider: string,
    providerUserId: string,
  ): Promise<OnboardedDriverRow | undefined> {
    const result = await client.query<{ id: string; email: string | null; role: string | null }>(
      `SELECT users.id, users.email, user_roles.role
       FROM public.users AS users
       LEFT JOIN public.user_roles ON user_roles.user_id = users.id
       WHERE users.auth_provider = $1 AND users.auth_provider_user_id = $2`,
      [provider, providerUserId],
    );

    const user = result.rows[0];
    return user ? { id: user.id, email: user.email ?? undefined, role: user.role ?? undefined } : undefined;
  }
}
