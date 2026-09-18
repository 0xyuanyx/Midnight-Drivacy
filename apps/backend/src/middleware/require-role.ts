import type { RequestHandler } from "express";

import { type Role } from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";

/** Must be mounted after requireAuth, which establishes request.authUser. */
export const requireRole = (requiredRole: Role): RequestHandler => (request, _response, next) => {
  if (!request.authUser) {
    next(new AppError("UNAUTHORIZED", "Authentication is required", 401));
    return;
  }

  if (request.authUser.role !== requiredRole) {
    next(new AppError("FORBIDDEN", "The authenticated user lacks the required role", 403));
    return;
  }

  next();
};
