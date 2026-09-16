import { Router } from "express";

import type { HealthStatus } from "@drivacy/shared";

export const healthRouter = Router();

healthRouter.get("/health", (_request, response) => {
  const status: HealthStatus = "ok";

  // This endpoint reports only this process. It must not imply that services
  // not connected in this phase (DB, Supabase, or Midnight) are healthy.
  response.json({ status, service: "drivacy-backend" });
});
