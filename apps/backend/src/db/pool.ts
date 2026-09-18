import { Pool } from "pg";

/**
 * DATABASE_URL is a PostgreSQL connection string, not a Supabase API key.
 * The pool is created once per backend process so requests reuse connections
 * instead of opening an unbounded number of database sessions.
 */
export const createDatabasePool = (databaseUrl: string): Pool =>
  new Pool({ connectionString: databaseUrl });
