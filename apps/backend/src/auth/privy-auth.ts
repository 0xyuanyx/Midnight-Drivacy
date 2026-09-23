import { PrivyClient } from "@privy-io/node";

import type { AuthVerifier, VerifiedAuthIdentity } from "./auth-verifier.js";

/**
 * Privy SDK의 서명 검증을 반드시 거친 DID만 반환한다. JWT payload를 직접
 * decode하면 서명, 만료, audience를 신뢰할 수 없으므로 사용하지 않는다.
 */
export const createPrivyAuthVerifier = (appId: string, appSecret: string): AuthVerifier => {
  const client = new PrivyClient({ appId, appSecret });

  return {
    async verifyAccessToken(accessToken: string): Promise<VerifiedAuthIdentity | undefined> {
      try {
        const verifiedToken = await client.utils().auth().verifyAccessToken(accessToken);
        // access token에는 이메일이 없으므로, 검증된 DID로 Privy 서버 API를 조회한다.
        // 클라이언트가 보낸 이메일을 신뢰하면 다른 계정으로 가입시킬 위험이 있다.
        const privyUser = await client.users()._get(verifiedToken.user_id);
        const emailAccount = privyUser.linked_accounts.find((account) => account.type === "email");

        return { providerUserId: verifiedToken.user_id, email: emailAccount?.address };
      } catch {
        // 잘못되었거나 만료된 토큰의 상세 사유는 외부에 노출하지 않는다.
        return undefined;
      }
    },
  };
};
