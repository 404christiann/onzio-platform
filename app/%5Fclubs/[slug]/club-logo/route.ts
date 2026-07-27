import { NextResponse } from "next/server";
import { clubLogoUrl, DEFAULT_CLUB_LOGO_PATH } from "@/lib/club-branding";
import { getClubContextBySlug } from "@/lib/club-context";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const club = await getClubContextBySlug((await params).slug);
  const { data } = await supabase
    .from("site_branding")
    .select("club_logo_path")
    .eq("club_id", club.id)
    .limit(1);
  const logoPath =
    (data as { club_logo_path?: string }[] | null)?.[0]?.club_logo_path ||
    DEFAULT_CLUB_LOGO_PATH;
  const response = NextResponse.redirect(clubLogoUrl(logoPath));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
