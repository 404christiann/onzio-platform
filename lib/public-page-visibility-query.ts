import { cache } from "react";
import { parsePublicPageVisibility, type PublicPageVisibility } from "@/lib/public-page-visibility";
import { createClient } from "@/lib/supabase-server";

// The club's "Visible to visitors" switches (onzio.clubs.public_page_visibility), read in
// their own query on purpose: lib/club-context.ts must never select a new clubs column (the
// 2026-08-14 outage, when production lacked a column the tenant lookup asked for and every
// request returned UNKNOWN_TENANT). This read FAILS OPEN: any error, including the column not
// existing yet in production, gives {} and every page is shown.
// It uses the request's own client (the same one tenant resolution uses): anonymous visitors read
// what anon may read, and a signed-in member of a club that is not live yet still reads their
// club, so an owner previewing their site sees the pages they hid as hidden.
// Server code only; client components read the result through PublicPageVisibilityProvider.
export const fetchPublicPageVisibility = cache(async (clubId: string): Promise<PublicPageVisibility> => {
  try {
    const { data, error } = await (await createClient())
      .schema("onzio")
      .from("clubs")
      .select("public_page_visibility")
      .eq("id", clubId)
      .maybeSingle();
    if (error || !data) return {};
    return parsePublicPageVisibility(data.public_page_visibility);
  } catch {
    return {};
  }
});
