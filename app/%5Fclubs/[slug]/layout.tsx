import { headers } from "next/headers";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import TemplateFontScope from "@/components/TemplateFontScope";
import EditorialShell from "@/components/editorial/EditorialShell";
import { ContractError } from "@/lib/contract-error";
import { getClubContextBySlug } from "@/lib/club-context";
import { loadAcademyShellBranding } from "@/lib/academy-shell-branding";
import AcademyRouteLoadingSkeleton, { AcademyPageLoadingSkeleton } from "@/components/AcademyRouteLoadingSkeleton";
import type { ClubContext } from "@/lib/club-context";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const club = await getClubContextBySlug((await params).slug);
  const description = `Official website for ${club.name}.`;
  const host = (await headers()).get("host");
  // Link-preview crawlers (iMessage, Slack, etc.) need an absolute image
  // URL — a relative one either fails outright or resolves against the
  // wrong origin. /club-logo already resolves to this tenant's real crest
  // per-request, so reuse it rather than duplicating that lookup here.
  const logoUrl = host ? `https://${host}/club-logo` : undefined;

  return {
    title: club.name,
    description,
    icons: { icon: "/club-logo" },
    openGraph: {
      title: club.name,
      description,
      ...(host ? { url: `https://${host}` } : {}),
      images: logoUrl ? [{ url: logoUrl }] : undefined,
    },
    twitter: {
      // The crest is a square patch, not a wide banner, so "summary" (not
      // summary_large_image) is the card shape that won't stretch it.
      card: "summary",
      title: club.name,
      description,
      images: logoUrl ? [logoUrl] : undefined,
    },
  };
}

async function AcademyResolvedShell({ club, children }: { club: ClubContext; children: React.ReactNode }) {
  // Keep the first-paint crest when the request is healthy, but never hold
  // every route behind an unbounded branding read. The provider can retry on
  // the client when this request fails or exceeds the budget.
  const branding = await loadAcademyShellBranding(club.id);

  return (
    <ClubBrandingProvider initialBranding={branding}>
      {/* Remove the footer and its links while the page loader is present so
          slow routes cannot scroll into a blank footer-sized area. */}
      <style>{`html:has([data-academy-page-loading]) footer { display: none; }`}</style>
      <Nav />
      <main>
        <Suspense fallback={<AcademyPageLoadingSkeleton />}>
          {children}
        </Suspense>
      </main>
      <Footer />
    </ClubBrandingProvider>
  );
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let club;
  try {
    club = await getClubContextBySlug(slug);
  } catch (error) {
    if (error instanceof ContractError) notFound();
    throw error;
  }

  if (club.presentationTemplateKey === "editorial@1") {
    // editorial@1 is a completely custom shell (own header/motion/main/
    // footer, see components/editorial/EditorialShell.tsx) -- it does not
    // reuse Nav/Footer/TemplateFontScope at all, mirroring how the
    // superseded reference branch built it. Every other template keeps the
    // exact byte-identical return below.
    return (
      <ClubContextProvider club={club}>
        <ClubBrandingProvider>
          <EditorialShell>{children}</EditorialShell>
        </ClubBrandingProvider>
      </ClubContextProvider>
    );
  }

  // The header remains usable while branding or page content is pending.
  // Programs load independently inside Nav, so they never hold the page.
  if (club.presentationTemplateKey === "academy@1") {
    return (
      <ClubContextProvider club={club}>
        <TemplateFontScope templateKey={club.presentationTemplateKey}>
          <Suspense fallback={<AcademyRouteLoadingSkeleton />}>
            <AcademyResolvedShell club={club}>{children}</AcademyResolvedShell>
          </Suspense>
        </TemplateFontScope>
      </ClubContextProvider>
    );
  }

  return (
    <ClubContextProvider club={club}>
      <ClubBrandingProvider>
        <TemplateFontScope templateKey={club.presentationTemplateKey}>
          <Nav />
          <main>{children}</main>
          <Footer />
        </TemplateFontScope>
      </ClubBrandingProvider>
    </ClubContextProvider>
  );
}
