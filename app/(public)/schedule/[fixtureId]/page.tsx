import { headers } from "next/headers";
import ClubhouseMatchAreaPage from "@/components/ClubhouseMatchAreaPage";
import CinematicMatchSummaryPage from "@/components/cinematic/CinematicMatchSummaryPage";
import { getClubContext } from "@/lib/club-context";

export default async function MatchAreaPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
  }).catch(() => null);

  // RC2027-MATCH-SUMMARY: Sam's Match Summary page for cinematic@2 clubs.
  if (club?.presentationTemplateKey === "cinematic@2") {
    return <CinematicMatchSummaryPage fixtureId={fixtureId} />;
  }
  return <ClubhouseMatchAreaPage fixtureId={fixtureId} />;
}
