import { type RequestHandler } from "express";

import type { User } from "@drivacy/shared";

import { authenticateAccessToken, type AuthDependencies } from "../auth/auth-service.js";
import { AppError } from "../errors/app-error.js";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: User;
  }
}

const bearerToken = (authorization: string | undefined): string => {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");

  if (!match) {
    throw new AppError("UNAUTHORIZED", "Authorization must use Bearer <access_token>", 401);
  }

  return match[1];
};

/** Resolves a verified Supabase user and its service-owned DB role onto the request. */
export const createRequireAuth = (dependencies: AuthDependencies): RequestHandler =>
  async (request, _response, next) => {
    const accessToken = bearerToken(request.header("authorization"));
    request.authUser = await authenticateAccessToken(accessToken, dependencies);
    next();
  };
