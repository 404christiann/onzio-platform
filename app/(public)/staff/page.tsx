"use client";

export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";

/**
 * Staff is not a standalone public nav item for the editorial template —
 * players and technical staff share `/roster` per the mockup spec
 * (soccerplatformmockups src/app/(public)/staff/page.tsx redirects the
 * same way). Classic tenants have no `/staff` page: this dispatcher
 * preserves that exact prior 404 outcome instead of introducing new
 * classic-facing behavior.
 */
export default function StaffPage() {
  const club = useClubContext();
  if (club.siteTemplate === "editorial") {
    redirect("/roster#staff");
  }
  notFound();
}
