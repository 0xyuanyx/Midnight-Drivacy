import { PrivyProvider, useLoginWithEmail, usePrivy, getAccessToken } from "@privy-io/expo";
import type { PropsWithChildren } from "react";
import { AppProvider } from "@/state/app-provider";
import { authPreview, privyAppId, privyMobileClientId } from "./config";
import { DriverAuthSession } from "./driver-auth";

function Session({ children }: PropsWithChildren) {
  const { isReady, user } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  return <DriverAuthSession adapter={{ ready: isReady, userId: user?.id ?? null, getAccessToken,
    sendCode: email => sendCode({ email }), verifyCode: (email, code) => loginWithCode({ email, code }) }}>{children}</DriverAuthSession>;
}
export default function AuthProvider({ children }: PropsWithChildren) {
  if (authPreview) return <AppProvider>{children}</AppProvider>;
  return <PrivyProvider appId={privyAppId} clientId={privyMobileClientId}><Session>{children}</Session></PrivyProvider>;
}
