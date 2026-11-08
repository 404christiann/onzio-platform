import { clubTimeZoneOrDefault, DEFAULT_CLUB_TIME_ZONE } from "@/lib/club-time";
import { createPublicClient } from "@/lib/supabase-server";

// ADMIN-RE-03: the club's time zone for the public site, read separately from
// tenant resolution (lib/club-context.ts never selects it: the 2026-08-14
// outage). Fail-safe and time-boxed like loadAcademyShellBranding: an error, a
// slow read or a bad value gives Los Angeles, which is how every public page
// behaved before this step, and never holds the page.

const BUDGET_MS = 1_500;

export async function readPublicClubTimeZone(clubId: string): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const { data, error } = await createPublicClient()
          .schema("onzio")
          .from("clubs")
          .select("time_zone")
          .eq("id", clubId)
          .maybeSingle();
        return error || !data ? DEFAULT_CLUB_TIME_ZONE : clubTimeZoneOrDefault(data.time_zone);
      })(),
      new Promise<string>((resolve) => {
        timeout = setTimeout(() => resolve(DEFAULT_CLUB_TIME_ZONE), BUDGET_MS);
      }),
    ]);
  } catch {
    return DEFAULT_CLUB_TIME_ZONE;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
