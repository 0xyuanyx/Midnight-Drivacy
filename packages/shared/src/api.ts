import { z } from "zod";

export const RequestIdSchema = z.string().min(1);
export type RequestId = z.infer<typeof RequestIdSchema>;

/**
 * The request ID is the same correlation value emitted in the x-request-id
 * response header; error codes themselves remain endpoint-specific for now.
 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: RequestIdSchema.optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
