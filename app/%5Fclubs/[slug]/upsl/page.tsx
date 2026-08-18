import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayUpslTryoutSpotlight from "@/components/pathway/PathwayUpslTryoutSpotlight";
import PathwayUpslMatchChannelPanel from "@/components/pathway/PathwayUpslMatchChannelPanel";
import PathwayUpslStandingsTable from "@/components/pathway/PathwayUpslStandingsTable";
import { upslContent } from "@/components/pathway/content";
import { clubLogoUrl } from "@/lib/club-branding";
import { fetchClubBranding, fetchLeagueStandings } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

// pathway@1 UPSL page (MLA P1 Step 6): the club-supplied tryout and match
// channel stories lead directly into MLA's tenant-owned league table.
export default async function TenantUpslPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();
  const onzio = (await createClient()).schema("onzio");
  const [crestUrl, standings] = await Promise.all([
    fetchClubBranding(club.id, onzio)
      .then(({ logoPath }) => clubLogoUrl(logoPath))
      .catch((error: unknown) => {
        console.error("TenantUpslPage pathway crest:", error);
        return "";
      }),
    fetchLeagueStandings(club.id, onzio).catch((error: unknown) => {
      console.error("TenantUpslPage pathway standings:", error);
      return null;
    }),
  ]);

  return (
    <>
      <PathwayUpslTryoutSpotlight {...upslContent.tryouts} />
      <PathwayUpslMatchChannelPanel
        {...upslContent.channel}
        channelName={club.name}
        channelCrest={crestUrl ? { src: crestUrl } : undefined}
      />
      {standings ? (
        <PathwayUpslStandingsTable
          settings={standings.settings}
          rows={standings.rows}
          clubCrest={crestUrl ? { src: crestUrl } : undefined}
        />
      ) : null}
    </>
  );
}
