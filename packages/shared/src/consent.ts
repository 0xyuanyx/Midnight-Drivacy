import { z } from "zod";

/**
 * Timestamps cross the API boundary as ISO 8601 strings, independent of a
 * future database column representation.
 */
export const ConsentSchema = z.object({
  consented: z.boolean(),
  consentedAt: z.string().datetime(),
});
export type Consent = z.infer<typeof ConsentSchema>;
