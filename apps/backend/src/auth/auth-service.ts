import { RoleSchema, UserSchema, type User } from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type { AuthRepository } from "./auth-repository.js";
import type { SupabaseAuthVerifier } from "./supabase-auth.js";

export interface AuthDependencies {
  authRepository: AuthRepository;
  supabaseAuthVerifier: SupabaseAuthVerifier;
}

export const authenticateAccessToken = async (
  accessToken: string,
  { authRepository, supabaseAuthVerifier }: AuthDependencies,
): Promise<User> => {
  const authUser = await supabaseAuthVerifier.verifyAccessToken(accessToken);

  if (!authUser) {
    throw new AppError("UNAUTHORIZED", "The access token is invalid or expired", 401);
  }

  if (!authUser.email) {
    throw new AppError("UNAUTHORIZED", "The authenticated user has no email address", 401);
  }

  // An Auth account alone must not automatically become a Drivacy user.
  const serviceUserId = await authRepository.findUserId(authUser.id);
  if (!serviceUserId) {
    throw new AppError(
      "USER_NOT_INITIALIZED",
      "The authenticated user is not initialized for Drivacy",
      403,
    );
  }

  const storedRole = await authRepository.findRoleByUserId(authUser.id);
  const role = RoleSchema.safeParse(storedRole);
  if (!role.success) {
    // There is intentionally no implicit DRIVER default: provisioning assigns roles explicitly.
    throw new AppError("ROLE_NOT_ASSIGNED", "The authenticated user has no assigned role", 403);
  }

  const user = UserSchema.safeParse({ id: authUser.id, email: authUser.email, role: role.data });
  if (!user.success) {
    throw new AppError("AUTH_USER_INVALID", "The authenticated user data is invalid", 401);
  }

  return user.data;
};
