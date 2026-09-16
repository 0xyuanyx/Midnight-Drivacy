import express from "express";

import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { healthRouter } from "./routes/health.js";

/**
 * App construction is separate from network startup: tests can exercise the
 * HTTP contract without opening a port, while server.ts owns runtime concerns.
 */
export const createApp = (): express.Express => {
  const app = express();

  app.use(express.json());
  app.use(requestId);
  app.use(healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
