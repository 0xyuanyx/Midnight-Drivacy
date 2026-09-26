export interface Environment {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  privyAppId: string;
  privyAppSecret: string;
  midnightNetwork: "fixture" | "local" | "preprod";
  midnightAdapterProfile: string;
  cWalletAdapterUrl: string;
  cWalletAdapterToken: string;
}

export interface AuthOnlyEnvironment {
  port: number;
  databaseUrl: string;
  privyAppId: string;
  privyAppSecret: string;
  allowedOrigin: string;
}

/** Local signup verification does not start C/Wallet workers or expose their routes. */
export const loadAuthOnlyEnvironment = (): AuthOnlyEnvironment => {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  const allowedOrigin = process.env.AUTH_ONLY_ALLOWED_ORIGIN ?? "http://localhost:8094";
  let origin: URL;
  try { origin = new URL(allowedOrigin); } catch { throw new Error("AUTH_ONLY_ALLOWED_ORIGIN must be a loopback http origin"); }
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)
    || origin.origin !== allowedOrigin) throw new Error("AUTH_ONLY_ALLOWED_ORIGIN must be a loopback http origin");
  return {
    port,
    databaseUrl: requiredEnvironment("DATABASE_URL"),
    privyAppId: requiredEnvironment("PRIVY_APP_ID"),
    privyAppSecret: requiredEnvironment("PRIVY_APP_SECRET"),
    allowedOrigin,
  };
};

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
  const privyAppId = requiredEnvironment("PRIVY_APP_ID");
  const privyAppSecret = requiredEnvironment("PRIVY_APP_SECRET");
  const midnightNetwork = requiredEnvironment("MIDNIGHT_NETWORK");
  if (midnightNetwork !== "fixture" && midnightNetwork !== "local" && midnightNetwork !== "preprod") throw new Error("MIDNIGHT_NETWORK must be fixture, local, or preprod");
  const midnightAdapterProfile = requiredEnvironment("MIDNIGHT_ADAPTER_PROFILE");
  // 외부 C/Wallet 계층만 실제 거래와 가입자 승인을 담당한다. Backend에는 월렛 키 대신 호출 위치와 서비스 인증값만 둔다.
  const cWalletAdapterUrl = requiredEnvironment("C_WALLET_ADAPTER_URL");
  const cWalletAdapterToken = requiredEnvironment("C_WALLET_ADAPTER_TOKEN");

  return { nodeEnv, port, databaseUrl, privyAppId, privyAppSecret, midnightNetwork, midnightAdapterProfile,
    cWalletAdapterUrl, cWalletAdapterToken };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured before starting the backend`);
  }

  return value;
};
