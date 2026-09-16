/**
 * Shared contracts intentionally start with only the health-check type.
 * Rule, state, trip, and proof schemas remain undecided until the team agrees
 * on their cross-service contract in a later phase.
 */
export type HealthStatus = "ok";
