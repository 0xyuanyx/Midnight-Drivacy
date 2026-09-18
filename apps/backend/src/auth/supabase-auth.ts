import { createClient } from "@supabase/supabase-js";

export interface VerifiedAuthUser {
  id: string;
  email: string | undefined;
}

export interface SupabaseAuthVerifier {
  verifyAccessToken(accessToken: string): Promise<VerifiedAuthUser | undefined>;
}

/**
 * Token payload decoding alone cannot prove signature validity or revocation.
 * getUser(token) asks Supabase Auth to validate the bearer token before its
 * subject and email are used at the application boundary.
 */
export const createSupabaseAuthVerifier = (
  supabaseUrl: string,
  supabasePublishableKey: string,
): SupabaseAuthVerifier => {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async verifyAccessToken(accessToken: string): Promise<VerifiedAuthUser | undefined> {
      const { data, error } = await client.auth.getUser(accessToken);

      if (error || !data.user) {
        return undefined;
      }

      return { id: data.user.id, email: data.user.email };
    },
  };
};
