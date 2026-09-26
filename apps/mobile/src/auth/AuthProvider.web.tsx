import { PrivyProvider, useLoginWithEmail, usePrivy } from "@privy-io/react-auth";
import type { PropsWithChildren } from "react";
import { AppProvider } from "@/state/app-provider";
import { authPreview, privyAppId } from "./config";
import { DriverAuthSession } from "./driver-auth";

function Session({ children }: PropsWithChildren) {
  const { ready, user, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  return <DriverAuthSession adapter={{ ready, userId: user?.id ?? null, getAccessToken,
    sendCode: email => sendCode({ email }), verifyCode: (_email, code) => loginWithCode({ code }) }}>{children}</DriverAuthSession>;
}
export default function AuthProvider({ children }: PropsWithChildren) {
  if (authPreview) return <AppProvider>{children}</AppProvider>;
  return <PrivyProvider appId={privyAppId} config={{ loginMethods: ["email"] }}><Session>{children}</Session></PrivyProvider>;
}
