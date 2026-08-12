"use client";

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";

const EditorialClubStory = nextDynamic(
  () => import("@/components/editorial/EditorialClubStory"),
);

/**
 * Editorial-template club story page (`/club`): story + "Find us" info,
 * matching the approved concept mockup's `ClubScreen.tsx` minus its
 * decorative, non-functional contact form (deferred to a real contact page
 * in a later session, per Christian's already-approved decision).
 *
 * `/club` is a distinct path from the classic template's `/club/about` and
 * `/club/logo` (both nested under `app/(public)/club/`), so there is no
 * route collision. Classic tenants never had a `/club` route at all — this
 * dispatcher preserves that exact prior 404 outcome instead of introducing
 * new classic-facing behavior, mirroring the `/staff` and
 * `/schedule/[fixtureId]` dispatch precedent.
 */
export default function ClubStoryPage() {
  const club = useClubContext();
  if (club.siteTemplate === "editorial") {
    return <EditorialClubStory />;
  }
  notFound();
}
