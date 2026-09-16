import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    code: "NOT_FOUND",
    message: `Route ${request.method} ${request.path} was not found`,
  });
};

/**
 * Unexpected failures deliberately return no implementation details. Later
 * services can add observability here without exposing sensitive data to APIs.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  response.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};
