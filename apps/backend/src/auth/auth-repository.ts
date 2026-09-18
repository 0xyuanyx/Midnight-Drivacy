import type { Pool } from "pg";

export interface AuthRepository {
  findUserId(userId: string): Promise<string | undefined>;
  findRoleByUserId(userId: string): Promise<string | undefined>;
}

export class PgAuthRepository implements AuthRepository {
  public constructor(private readonly pool: Pool) {}

  public async findUserId(userId: string): Promise<string | undefined> {
    // Parameterized values keep an Auth UUID out of SQL syntax construction.
    const result = await this.pool.query<{ id: string }>(
      "SELECT id FROM public.users WHERE id = $1",
      [userId],
    );

    return result.rows[0]?.id;
  }

  public async findRoleByUserId(userId: string): Promise<string | undefined> {
    // Roles come from the service database, never mutable client input or JWT metadata.
    const result = await this.pool.query<{ role: string }>(
      "SELECT role FROM public.user_roles WHERE user_id = $1",
      [userId],
    );

    return result.rows[0]?.role;
  }
}
