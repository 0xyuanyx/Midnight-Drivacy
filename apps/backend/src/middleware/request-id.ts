import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

/**
 * Correlation IDs are created at the HTTP boundary so future asynchronous
 * operations can be traced without relying on client-provided identifiers.
 */
export const requestId: RequestHandler = (_request, response, next) => {
  response.setHeader("x-request-id", randomUUID());
  next();
};
