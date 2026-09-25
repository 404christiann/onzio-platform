import { fetchClubBranding, type ClubBranding } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

/** Keep the academy's first-paint crest without holding every route indefinitely. */
export async function loadAcademyShellBranding(clubId: string): Promise<ClubBranding | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    (async () => {
      const onzio = (await createClient()).schema("onzio");
      return { status: "fulfilled" as const, value: await fetchClubBranding(clubId, onzio) };
    })().catch((reason: unknown) => ({ status: "rejected" as const, reason })),
    new Promise<{ status: "timed-out" }>((resolve) => {
      timeout = setTimeout(() => resolve({ status: "timed-out" }), 2_500);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (result.status === "rejected") console.error("Tenant branding:", result.reason);
  return result.status === "fulfilled" ? result.value : null;
}
