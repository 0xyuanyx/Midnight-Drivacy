/**
 * 인증 공급자가 검증한 최소 신원 정보다. 이 값은 외부 공급자의 식별자이며,
 * 애플리케이션 권한 검사에 직접 쓰지 않는다.
 */
export interface VerifiedAuthIdentity {
  providerUserId: string;
  email?: string;
}

/** 외부 access token 검증을 DB/업무 로직에서 분리하는 경계다. */
export interface AuthVerifier {
  verifyAccessToken(accessToken: string): Promise<VerifiedAuthIdentity | undefined>;
}
