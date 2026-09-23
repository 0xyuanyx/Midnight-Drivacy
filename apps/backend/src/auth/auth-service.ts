import { RoleSchema, UserSchema, type User } from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type { AuthRepository } from "./auth-repository.js";
import type { AuthVerifier } from "./auth-verifier.js";

export interface AuthDependencies {
  authRepository: AuthRepository;
  authVerifier: AuthVerifier;
}

export const authenticateAccessToken = async (
  accessToken: string,
  { authRepository, authVerifier }: AuthDependencies,
): Promise<User> => {
  const authIdentity = await authVerifier.verifyAccessToken(accessToken);

  if (!authIdentity) {
    throw new AppError("UNAUTHORIZED", "The access token is invalid or expired", 401);
  }

  // Privy DID는 외부 식별자일 뿐이다. 반드시 DB 매핑을 거쳐 내부 UUID로 전환한다.
  const serviceUser = await authRepository.findUserByProviderIdentity("PRIVY", authIdentity.providerUserId);
  if (!serviceUser) {
    throw new AppError(
      "USER_NOT_INITIALIZED",
      "The authenticated user is not initialized for Drivacy",
      403,
    );
  }

  const storedRole = await authRepository.findRoleByUserId(serviceUser.id);
  const role = RoleSchema.safeParse(storedRole);
  if (!role.success) {
    // There is intentionally no implicit DRIVER default: provisioning assigns roles explicitly.
    throw new AppError("ROLE_NOT_ASSIGNED", "The authenticated user has no assigned role", 403);
  }

  // 응답과 후속 객체 권한 검사는 외부 DID가 아닌 Drivacy UUID를 사용한다.
  const user = UserSchema.safeParse({ id: serviceUser.id, email: serviceUser.email, role: role.data });
  if (!user.success) {
    throw new AppError("AUTH_USER_INVALID", "The authenticated user data is invalid", 401);
  }

  return user.data;
};
