import { renderCinematicPolicyRoute } from "@/components/cinematic/CinematicPolicyRoute";

export default async function StadiumGuidelinesPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderCinematicPolicyRoute((await params).slug, "guidelines");
}
