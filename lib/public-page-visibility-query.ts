import { cache } from "react";
import { parsePublicPageVisibility, type PublicPageVisibility } from "@/lib/public-page-visibility";
import { createClient, createPublicClient } from "@/lib/supabase-server";

// The club's "Visible to visitors" switches (onzio.clubs.public_page_visibility), read in
// their own query on purpose: lib/club-context.ts must never select a new clubs column (the
// 2026-08-14 outage, when production lacked a column the tenant lookup asked for and every
// request returned UNKNOWN_TENANT). This read FAILS OPEN: any error, including the column not
// existing yet in production, gives {} and every page is shown. Server code only; client
// components read the result through PublicPageVisibilityProvider.
type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createPublicClient>;

async function readVisibility(client: () => Client | Promise<Client>, clubId: string): Promise<PublicPageVisibility> {
  try {
    const { data, error } = await (await client())
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
}

/** Visitor-facing read (anon client, no cookies). */
export const fetchPublicPageVisibility = cache((clubId: string) => readVisibility(() => createPublicClient(), clubId));

/**
 * Admin read with the signed-in client, so an owner of a club that is not live yet (which anon
 * cannot read) still sees the saved switches. Same fail-open rule.
 */
export const fetchAdminPageVisibility = cache((clubId: string) => readVisibility(() => createClient(), clubId));
