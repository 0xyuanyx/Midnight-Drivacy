export interface Environment {
  nodeEnv: string;
  port: number;
}

/**
 * Only non-secret process settings are accepted in this foundation. Service
 * credentials will be injected through deployment secret management later.
 */
export const loadEnvironment = (): Environment => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const portValue = process.env.PORT ?? "3000";
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return { nodeEnv, port };
};
