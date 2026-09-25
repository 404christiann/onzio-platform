"use client";

import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { AcademyPageLoadingSkeleton as AcademyPageLoadingSurface } from "@/components/AcademyLoadingSkeleton";
import { academyLoadingRoute } from "@/lib/academy-loading-route";
import { useOptionalClubContext } from "@/components/ClubContextProvider";

function AcademyPageFrame({ pathname, clubName }: { pathname: string; clubName?: string }) {
  const route = academyLoadingRoute(pathname);
  const labels = {
    home: clubName ? "Loading " + clubName + "…" : "Loading home…",
    "program-detail": "Loading program…",
    programs: "Loading programs…",
    navy: "Loading page…",
    shop: "Loading store…",
    about: "Loading club…",
    roster: "Loading squad…",
    schedule: "Loading fixtures…",
    logo: "Loading club logo…",
    registration: "Loading registration…",
    simple: "Loading page…",
  };
  return <AcademyPageLoadingSurface label={labels[route]} />;
}

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

/** Page-only fallback for client navigation under the already resolved nav. */
export function AcademyPageLoadingSkeleton() {
  const club = useOptionalClubContext();
  const pathname = usePathname();
  if (club?.presentationTemplateKey !== "academy@1") return <OtherTemplatePageLoading />;
  return <AcademyPageFrame pathname={pathname} clubName={club.name} />;
}

export default function AcademyRouteLoadingSkeleton() {
  const club = useOptionalClubContext();
  const pathname = usePathname();
  if (!club) return null;
  return (
    <ClubBrandingProvider>
      <Nav loadingAppearance />
      <main><AcademyPageFrame pathname={pathname} clubName={club.name} /></main>
    </ClubBrandingProvider>
  );
}
