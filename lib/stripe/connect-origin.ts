import type { SupabaseClient } from "@supabase/supabase-js";
import { verifiedClubOrigin } from "@/lib/stripe-config";
import type { ConnectEnv } from "@/lib/stripe/connect-config";

/**
 * Resolves the origin Stripe should redirect back to for a club, from the
 * club's own verified primary domain for the running environment.
 *
 * Never derived from a request header. Checkout return URLs and Connect
 * onboarding return URLs are both places where a spoofed origin would send a
 * family or a club owner somewhere an attacker controls, so the hostname comes
 * from `onzio.club_domains` and must be active, primary, and verified
 * (AGENTS.md: "Resolve tenant identity from a normalized verified domain").
 *
 * Returns null rather than a fallback: no origin means no redirect target, and
 * inventing one would be worse than refusing.
 */
export async function resolveClubPrimaryOrigin(
  client: SupabaseClient<any, any, any>,
  clubId: string,
  env: ConnectEnv = process.env,
): Promise<string | null> {
  const environment = env.ONZIO_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") return null;

  const { data, error } = await client
    .schema("onzio")
    .from("club_domains")
    .select("hostname")
    .eq("club_id", clubId)
    .eq("environment", environment)
    .eq("is_primary", true)
    .eq("active", true)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (error || !data?.hostname) return null;
  return verifiedClubOrigin(data.hostname);
}
