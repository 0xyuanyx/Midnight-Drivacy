import { z } from "zod";

export const RoleSchema = z.enum(["DRIVER", "INSURER"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * This deliberately models only the application-facing user fields. It does
 * not expose the complete Supabase Auth user object across the API boundary.
 */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: RoleSchema,
});
export type User = z.infer<typeof UserSchema>;
