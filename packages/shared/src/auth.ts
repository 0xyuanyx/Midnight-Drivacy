import { z } from "zod";

export const RoleSchema = z.enum(["DRIVER", "INSURER"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * This deliberately models only the application-facing user fields. It does
 * not expose a complete external authentication-provider user object across the API boundary.
 */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: RoleSchema,
});
export type User = z.infer<typeof UserSchema>;

/** DRIVER onboarding에서만 받는 개인 정보다. 역할·이메일·외부 ID는 서버가 결정한다. */
export const DriverOnboardingRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  birthDate: z.iso.date(),
  phoneNumber: z.string().regex(/^01[0-9][0-9]{7,8}$/),
}).strict();
export type DriverOnboardingRequest = z.infer<typeof DriverOnboardingRequestSchema>;
