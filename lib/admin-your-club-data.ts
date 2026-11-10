import type { SupabaseClient } from "@supabase/supabase-js";
import { clubLogoUrl, resolveFooterTagline } from "@/lib/club-branding";
import { EMPTY_SOCIAL, SOCIAL_PLATFORMS, type YourClubDraft } from "@/lib/your-club";

// ADMIN-RE-14: what "Your club" shows on first paint. Read with the signed-in
// person's own client (RLS is the boundary) and scoped to the club. Only the
// public site-wide details the page edits are selected: the logo, the footer
// line, the five social addresses and the four public contact fields.

export type YourClubData =
  | {
      status: "ready";
      /** The logo as it is saved; "" when the club has none. */
      logoPath: string;
      logoUrl: string;
      /** The footer line as it is saved, one value per field. */
      saved: YourClubDraft;
    }
  | { status: "error" };

type BrandingRow = { club_logo_path: string | null; footer_tagline: string | null };
type SocialRow = { id: string; href: string | null };
type ContactRow = {
  public_email: string | null;
  public_phone: string | null;
  service_area: string | null;
  hours: string | null;
};

export async function loadYourClubData(supabase: SupabaseClient, clubId: string): Promise<YourClubData> {
  const onzio = supabase.schema("onzio");
  const [branding, social, contact] = await Promise.all([
    onzio.from("site_branding").select("club_logo_path,footer_tagline").eq("club_id", clubId).maybeSingle(),
    onzio.from("site_social_links").select("id,href").eq("club_id", clubId),
    onzio
      .from("contact_profile")
      .select("public_email,public_phone,service_area,hours")
      .eq("club_id", clubId)
      .maybeSingle(),
  ]);
  if (branding.error || social.error || contact.error) return { status: "error" };

  const brandingRow = (branding.data ?? null) as BrandingRow | null;
  const contactRow = (contact.data ?? null) as ContactRow | null;
  const socialByPlatform = { ...EMPTY_SOCIAL };
  for (const row of (social.data ?? []) as SocialRow[]) {
    const platform = SOCIAL_PLATFORMS.find((candidate) => candidate.id === row.id);
    if (platform) socialByPlatform[platform.id] = row.href?.trim() ?? "";
  }

  const logoPath = brandingRow?.club_logo_path?.trim() ?? "";
  return {
    status: "ready",
    logoPath,
    logoUrl: logoPath ? clubLogoUrl(logoPath) : "",
    saved: {
      email: contactRow?.public_email ?? "",
      phone: contactRow?.public_phone ?? "",
      hours: contactRow?.hours ?? "",
      area: contactRow?.service_area ?? "",
      // A club that never wrote one shows the template's standard wording as a
      // real value, the way the old Branding page did (2026-08-09).
      footerLine: resolveFooterTagline(brandingRow?.footer_tagline),
      social: socialByPlatform,
    },
  };
}
