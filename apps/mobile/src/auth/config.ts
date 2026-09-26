// Public application identifiers; never put a Privy app secret here.
export const privyAppId = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "cmudw308g01rv0ckyr0wcqqhd";
export const privyMobileClientId = process.env.EXPO_PUBLIC_PRIVY_MOBILE_CLIENT_ID ?? "client-WY6dxJskiszDibSN8vvR2kgcjNyWJQwT7rkocmqynsjz7";
// Expo embeds this public URL into each exported client bundle.
export const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const authPreview = process.env.EXPO_PUBLIC_AUTH_MODE === "preview";
