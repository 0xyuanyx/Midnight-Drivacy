import {
  DriverOnboardingRequestSchema,
  RoleSchema,
  UserSchema,
  type DriverOnboardingRequest,
  type User,
} from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type { AuthRepository } from "./auth-repository.js";
import type { AuthVerifier } from "./auth-verifier.js";

export class DriverOnboardingService {
  public constructor(
    private readonly authRepository: AuthRepository,
    private readonly authVerifier: AuthVerifier,
  ) {}

  public async complete(accessToken: string, requestBody: unknown): Promise<User> {
    const request = DriverOnboardingRequestSchema.safeParse(requestBody);
    if (!request.success) {
      throw new AppError("INVALID_REQUEST", "Driver onboarding request is invalid", 400);
    }

    const identity = await this.authVerifier.verifyAccessToken(accessToken);
    if (!identity) {
      throw new AppError("UNAUTHORIZED", "The access token is invalid or expired", 401);
    }
    if (!identity.email) {
      throw new AppError("UNAUTHORIZED", "The authenticated Privy user has no email address", 401);
    }

    const driver = await this.authRepository.completeDriverOnboarding({
      provider: "PRIVY",
      providerUserId: identity.providerUserId,
      email: identity.email,
      ...this.profile(request.data),
    });

    const role = RoleSchema.safeParse(driver.role);
    if (!role.success) {
      throw new AppError("ROLE_NOT_ASSIGNED", "The authenticated user has no assigned role", 403);
    }
    if (role.data !== "DRIVER") {
      throw new AppError("FORBIDDEN", "The authenticated user is not a driver", 403);
    }

    const user = UserSchema.safeParse({ id: driver.id, email: driver.email, role: role.data });
    if (!user.success) {
      throw new AppError("AUTH_USER_INVALID", "The authenticated user data is invalid", 401);
    }

    return user.data;
  }

  private profile(request: DriverOnboardingRequest): DriverOnboardingRequest {
    return request;
  }
}
