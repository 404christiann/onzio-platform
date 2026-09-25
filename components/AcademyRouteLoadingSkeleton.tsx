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

/** Page-only fallback for client navigation under the already resolved nav. */
export function AcademyPageLoadingSkeleton() {
  const club = useOptionalClubContext();
  const pathname = usePathname();
  if (club?.presentationTemplateKey !== "academy@1") return null;
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
