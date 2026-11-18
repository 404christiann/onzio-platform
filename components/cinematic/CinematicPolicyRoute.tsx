import { notFound } from "next/navigation";
import CinematicDestination from "@/components/cinematic/CinematicDestination";
import CinematicPolicyPage from "@/components/cinematic/CinematicPolicyPage";
import { getClubContextBySlug } from "@/lib/club-context";
import type { PolicyPageKey } from "@/lib/cinematic-policies-content";
import { fetchCinematicPolicyContent } from "@/lib/cinematic-policies-query";
import { createClient } from "@/lib/supabase-server";

const PLACEHOLDER_LABELS: Record<PolicyPageKey, string> = { guidelines: "stadium-guidelines", fanCode: "fan-code" };

/** Server boundary shared by /stadium/guidelines and /stadium/fan-code (cinematic@2 only). */
export async function renderCinematicPolicyRoute(slug: string, page: PolicyPageKey) {
  const club = await getClubContextBySlug(slug);
  if (club.presentationTemplateKey !== "cinematic@2") notFound();
  const content = await fetchCinematicPolicyContent(club.id, (await createClient()).schema("onzio"));
  return content ? <CinematicPolicyPage page={content[page]} /> : <CinematicDestination clubId={club.id} labelId={PLACEHOLDER_LABELS[page]} />;
}
