import type { ErrorRequestHandler, RequestHandler } from "express";

import type { ApiError, RequestId } from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";

const responseRequestId = (response: Parameters<RequestHandler>[1]): RequestId | undefined => {
  const value = response.getHeader("x-request-id");
  return typeof value === "string" ? value : undefined;
};

export const notFoundHandler: RequestHandler = (request, response) => {
  const body: ApiError = {
    code: "NOT_FOUND",
    message: `Route ${request.method} ${request.path} was not found`,
    requestId: responseRequestId(response),
  };
  response.status(404).json(body);
};

/**
 * Unexpected failures deliberately return no implementation details. Later
 * services can add observability here without exposing sensitive data to APIs.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    const body: ApiError = {
      code: error.code,
      message: error.message,
      requestId: responseRequestId(response),
    };
    response.status(error.statusCode).json(body);
    return;
  }

  const body: ApiError = {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    requestId: responseRequestId(response),
  };
  response.status(500).json(body);
};
