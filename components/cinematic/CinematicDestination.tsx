import Link from "next/link";
import { CINEMATIC_NAV_ITEMS, fetchCinematicHomepageContent, resolveCinematicNavLabel } from "@/lib/cinematic-homepage-content";
import { createClient } from "@/lib/supabase-server";

/** Temporary destinations while the approved homepage is the delivery scope. */
export default async function CinematicDestination({ clubId, labelId }: { clubId: string; labelId: string }) {
  const content = await fetchCinematicHomepageContent(clubId, (await createClient()).schema("onzio"));
  const items = CINEMATIC_NAV_ITEMS.flatMap(item => [item, ...("children" in item ? item.children ?? [] : [])]);
  const title = resolveCinematicNavLabel(content, labelId, items.find(item => item.id === labelId)?.label ?? "Coming soon");
  return <section className="cinematic-placeholder" style={{ padding: "96px 24px", minHeight: "55vh", textAlign: "center" }}><h1>{title}</h1><p>More information will be available soon.</p><Link href="/">Back to home</Link></section>;
}
