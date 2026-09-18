export interface Environment {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

/**
 * Runtime configuration is checked before the server starts so a partially
 * configured deployment cannot fail later with an ambiguous auth or DB error.
 */
export const loadEnvironment = (): Environment => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const portValue = process.env.PORT ?? "3000";
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const supabasePublishableKey = requiredEnvironment("SUPABASE_PUBLISHABLE_KEY");

  return { nodeEnv, port, databaseUrl, supabaseUrl, supabasePublishableKey };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured before starting the backend`);
  }

  return value;
};
