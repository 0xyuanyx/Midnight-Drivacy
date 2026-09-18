import { createApp } from "./app.js";
import { PgAuthRepository } from "./auth/auth-repository.js";
import { createSupabaseAuthVerifier } from "./auth/supabase-auth.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabasePool } from "./db/pool.js";

const { port, databaseUrl, supabaseUrl, supabasePublishableKey } = loadEnvironment();
const pool = createDatabasePool(databaseUrl);
const app = createApp({
  authRepository: new PgAuthRepository(pool),
  supabaseAuthVerifier: createSupabaseAuthVerifier(supabaseUrl, supabasePublishableKey),
});

app.listen(port, () => {
  console.info(`Drivacy backend listening on port ${port}`);
});
