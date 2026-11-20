"use client";

import { useOptionalClubContext } from "@/components/ClubContextProvider";
import TenantPageLoading from "@/components/TenantPageLoading";

/**
 * Route fallback for the Roster, Schedule, Shop and Club logo pages. The shared fallback is shorter than these
 * pages, so the footer was visible under it and got pushed down when the page streamed in. A viewport-tall
 * fallback keeps the footer below the fold before and after, so nothing visible moves. Other templates keep the
 * shared fallback.
 */
export default function CinematicRouteLoading() {
  const club = useOptionalClubContext();
  if (club?.presentationTemplateKey !== "cinematic@2") return <TenantPageLoading />;
  return (
    <div className="flex items-start justify-center px-6 pt-[30svh] text-slate-600" style={{ minHeight: "100svh" }} role="status" aria-busy="true" aria-label="Loading page">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 motion-safe:animate-spin" aria-hidden="true" />
        Loading page…
      </div>
    </div>
  );
}
