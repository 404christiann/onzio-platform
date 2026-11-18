import { renderCinematicPolicyRoute } from "@/components/cinematic/CinematicPolicyRoute";

export default async function FanCodePage({ params }: { params: Promise<{ slug: string }> }) {
  return renderCinematicPolicyRoute((await params).slug, "fanCode");
}
