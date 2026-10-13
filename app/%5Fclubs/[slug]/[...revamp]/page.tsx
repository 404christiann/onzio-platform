import CinematicDestination from "@/components/cinematic/CinematicDestination";
import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { cinematicPlaceholderLabelId } from "@/lib/cinematic-routes";

export default async function HomepageDestination({ params }: { params: Promise<{ slug: string; revamp: string[] }> }) {
  const { slug, revamp } = await params;
  const club = await getClubContextBySlug(slug);
  const id = cinematicPlaceholderLabelId(club.presentationTemplateKey, `/${revamp.join("/")}`);
  if (!id) notFound();
  return <CinematicDestination clubId={club.id} labelId={id} />;
}
