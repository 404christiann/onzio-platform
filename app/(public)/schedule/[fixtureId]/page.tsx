import ClubhouseMatchAreaPage from "@/components/ClubhouseMatchAreaPage";

export default async function MatchAreaPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;
  return <ClubhouseMatchAreaPage fixtureId={fixtureId} />;
}
