import ClubhousePlayerProfilePage from "@/components/ClubhousePlayerProfilePage";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <ClubhousePlayerProfilePage playerId={playerId} />;
}
