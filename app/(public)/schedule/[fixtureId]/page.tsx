"use client";

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";

const EditorialMatchArea = nextDynamic(
  () => import("@/components/editorial/EditorialMatchArea"),
);

/**
 * Per-fixture editorial match area. Classic has no per-fixture route today
 * (the classic `/schedule` fixture rows have no detail link), so this
 * preserves the exact same 404 outcome for classic tenants instead of
 * introducing new classic-facing behavior, matching the `/staff` dispatcher's
 * precedent from L5.
 */
export default function ScheduleFixturePage() {
  const club = useClubContext();
  if (club.siteTemplate === "editorial") {
    return <EditorialMatchArea />;
  }
  notFound();
}
