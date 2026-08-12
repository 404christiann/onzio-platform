import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ContractError } from "@/lib/contract-error";
import { getClubContextBySlug } from "@/lib/club-context";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const club = await getClubContextBySlug((await params).slug);
  return {
    title: club.name,
    description: `Official website for ${club.name}.`,
    icons: { icon: "/club-logo" },
  };
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

  // The site template is tenant data: `editorial` renders the separate
  // editorial component package; every other club renders the classic
  // shared components exactly as before. The editorial modules (component
  // package, scoped stylesheet, and Geist font scope) are imported
  // dynamically so classic-template requests never evaluate them on the
  // server or construct the editorial React tree.
  //
  // This does NOT remove the editorial CSS/font/component JavaScript from
  // the client bundle classic tenants download: Next.js computes one static
  // client-reference/CSS manifest per compiled route, and both templates
  // share this one `/_clubs/[slug]` route file, so everything reachable
  // from either branch — dynamically imported or not — lands in that
  // route's shared chunk regardless of which branch a given request takes.
  // (Verified by diffing a classic-tenant page's shipped CSS/JS chunk
  // hashes between a static-import build and this dynamic-import build:
  // identical in both.) The editorial stylesheet stays inert for classic
  // tenants because every rule is scoped under the editorial wrapper's
  // template-name attribute selector, which classic markup never carries.
  // True client-asset isolation would require serving the two templates
  // from separate route files/segments, a larger change than this phase's
  // scope; the one piece of editorial UI genuinely absent from the classic
  // client bundle is `EditorialHomePlaceholder`, which `app/(public)/page.tsx`
  // reaches through a `next/dynamic` import from a Client Component, where
  // Next.js's ordinary client-side code-splitting applies.
  if (club.siteTemplate === "editorial") {
    const [
      { default: EditorialShell },
      { editorialFontClassName },
      { fetchClubIdentity, fetchClubThemeColors, fetchEditorialCrests },
      { fetchSiteSocialLinks },
    ] = await Promise.all([
      import("@/components/editorial/EditorialShell"),
      import("@/components/editorial/fonts"),
      import("@/lib/club-identity"),
      import("@/lib/queries"),
    ]);
    const [identity, theme, crests, socialLinks] = await Promise.all([
      fetchClubIdentity(club.id),
      fetchClubThemeColors(club.id),
      fetchEditorialCrests(club.id),
      fetchSiteSocialLinks(club.id),
    ]);
    return (
      <ClubContextProvider club={club}>
        <ClubBrandingProvider>
          <EditorialShell
            clubName={club.name}
            clubInitials={identity?.initials ?? club.name.slice(0, 3)}
            theme={theme}
            crestUrl={crests.crestUrl}
            crestOnDarkUrl={crests.crestOnDarkUrl}
            identity={identity}
            socialLinks={socialLinks}
            fontClassName={editorialFontClassName}
          >
            {children}
          </EditorialShell>
        </ClubBrandingProvider>
      </ClubContextProvider>
    );
  }

  return (
    <ClubContextProvider club={club}>
      <ClubBrandingProvider>
        <Nav />
        <main>{children}</main>
        <Footer />
      </ClubBrandingProvider>
    </ClubContextProvider>
  );
}
