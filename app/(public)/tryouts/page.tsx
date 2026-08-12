"use client";

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";

const EditorialTryouts = nextDynamic(
  () => import("@/components/editorial/EditorialTryouts"),
);

/**
 * Editorial-template tryouts info page (`/tryouts`): informational-only
 * content, no registration form, per already-approved scope.
 *
 * Classic tenants never had a `/tryouts` route at all — this dispatcher
 * preserves that exact prior 404 outcome instead of introducing new
 * classic-facing behavior, mirroring the `/club`, `/staff`, and
 * `/schedule/[fixtureId]` dispatch precedent.
 */
export default function TryoutsPage() {
  const club = useClubContext();
  if (club.siteTemplate === "editorial") {
    return <EditorialTryouts />;
  }
  notFound();
}
