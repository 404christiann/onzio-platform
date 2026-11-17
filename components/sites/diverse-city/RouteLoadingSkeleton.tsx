"use client";

import { usePathname } from "next/navigation";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import AcademyFontScope from "./FontScope";
import { AcademyPageLoadingSkeleton as AcademyPageLoadingSurface } from "./LoadingSkeleton";
import Nav from "./Nav";
import { academyLoadingRoute } from "./routes";

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

/** Page-only fallback for client navigation under the already resolved nav. */
export function AcademyRoutePageLoading() {
  const club = useClubContext();
  const pathname = usePathname();
  return <AcademyPageFrame pathname={pathname} clubName={club.name} />;
}

export default function AcademyRouteLoadingSkeleton() {
  const club = useClubContext();
  const pathname = usePathname();
  return (
    <AcademyFontScope>
      <ClubBrandingProvider>
        <Nav loadingAppearance />
        <main><AcademyPageFrame pathname={pathname} clubName={club.name} /></main>
      </ClubBrandingProvider>
    </AcademyFontScope>
  );
}
