// Public application identifiers; never put a Privy app secret here.
export const privyAppId = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const privyMobileClientId = process.env.EXPO_PUBLIC_PRIVY_MOBILE_CLIENT_ID ?? "";
// Expo embeds this public URL into each exported client bundle.
export const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
// A fresh clone runs the explicitly labelled local demo without provider credentials.
// Real Privy sign-in remains opt-in through EXPO_PUBLIC_AUTH_MODE=privy.
export const authPreview = process.env.EXPO_PUBLIC_AUTH_MODE !== "privy";
