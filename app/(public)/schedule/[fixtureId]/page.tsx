import { headers } from "next/headers";
import ClubhouseMatchAreaPage from "@/components/ClubhouseMatchAreaPage";
import EditorialMatchArea from "@/components/editorial/EditorialMatchArea";
import { getClubContext } from "@/lib/club-context";

/**
 * Real per-template dispatch for the match-area route, added in E4.
 * Previously this file rendered ClubhouseMatchAreaPage unconditionally for
 * every template (that component internally no-ops to a "Match area
 * unavailable" state for every non-clubhouse template, including
 * editorial@1 -- see components/ClubhouseMatchAreaPage.tsx's `isClubhouse`
 * gate). editorial@1 gets a real match-area page now; every other
 * template's rendering is unchanged (still ClubhouseMatchAreaPage
 * unconditionally, with its own internal gate deciding what actually shows).
 *
 * This route only has `fixtureId` in its own params -- no `slug` -- so club
 * context can't come from useClubContext() the way roster/schedule's client
 * components get it lower in the tree, nor from a `slug` route param the
 * way app/%5Fclubs/[slug]/tryouts/page.tsx does. Instead this follows the
 * other established real precedent for resolving club context from a plain
 * async server component with no slug param: app/admin/(protected)/layout.tsx
 * reads the `host` header (set by middleware.ts on every request, including
 * the internal /_clubs/<slug>/... rewrite this route always renders behind)
 * and calls getClubContext({ hostname }). club-context.ts's resolution
 * functions are wrapped in React's request-scoped cache(), so this adds no
 * real extra query on local/.localhost hosts (the tenant layout above this
 * page already resolved the same club via getClubContextBySlug, which this
 * hits as a cache hit); on a real production hostname it is one additional
 * cached Supabase round trip per request, same tradeoff the admin layout
 * already accepts.
 */
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

  if (club?.presentationTemplateKey === "editorial@1") {
    return <EditorialMatchArea fixtureId={fixtureId} />;
  }
  return <ClubhouseMatchAreaPage fixtureId={fixtureId} />;
}
