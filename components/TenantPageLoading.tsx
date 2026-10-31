"use client";

import { useOptionalClubContext } from "@/components/ClubContextProvider";
import { AcademyRoutePageLoading } from "@/components/sites/diverse-city/RouteLoadingSkeleton";

function OtherTemplatePageLoading() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-6 text-slate-600" role="status" aria-busy="true" aria-label="Loading page">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 motion-safe:animate-spin" aria-hidden="true" />
        Loading page…
      </div>
    </div>
  );
}

/** Route-level fallback for every tenant. Only the legacy template choice lives here. */
export default function TenantPageLoading() {
  const club = useOptionalClubContext();
  if (club?.presentationTemplateKey !== "academy@1") return <OtherTemplatePageLoading />;
  return <AcademyRoutePageLoading />;
}
