export interface Environment {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  midnightNetwork: "fixture" | "local" | "preprod";
  midnightAdapterProfile: string;
  cWalletAdapterUrl: string;
  cWalletAdapterToken: string;
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
  const midnightNetwork = requiredEnvironment("MIDNIGHT_NETWORK");
  if (midnightNetwork !== "fixture" && midnightNetwork !== "local" && midnightNetwork !== "preprod") throw new Error("MIDNIGHT_NETWORK must be fixture, local, or preprod");
  const midnightAdapterProfile = requiredEnvironment("MIDNIGHT_ADAPTER_PROFILE");
  // 외부 C/Wallet 계층만 실제 거래와 가입자 승인을 담당한다. Backend에는 월렛 키 대신 호출 위치와 서비스 인증값만 둔다.
  const cWalletAdapterUrl = requiredEnvironment("C_WALLET_ADAPTER_URL");
  const cWalletAdapterToken = requiredEnvironment("C_WALLET_ADAPTER_TOKEN");

  return { nodeEnv, port, databaseUrl, supabaseUrl, supabasePublishableKey, midnightNetwork, midnightAdapterProfile,
    cWalletAdapterUrl, cWalletAdapterToken };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured before starting the backend`);
  }

  return value;
};
