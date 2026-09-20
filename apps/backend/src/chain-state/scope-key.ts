import { createHash } from "node:crypto";

import type { Scope } from "@drivacy/shared";

/**
 * `chain_states` identifies the business evaluation scope, not a particular
 * runtime deployment. Keep this serialization at the DB boundary so every B
 * repository addresses the same state row.
 */
export const chainScopeKey = (scope: Scope): string =>
  createHash("sha256").update(JSON.stringify(scope)).digest("hex");
