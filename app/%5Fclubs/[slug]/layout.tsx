import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import EditorialShell from "@/components/editorial/EditorialShell";
import { editorialFontClassName } from "@/components/editorial/fonts";
import { ContractError } from "@/lib/contract-error";
import { getClubContextBySlug } from "@/lib/club-context";
import {
  fetchClubIdentity,
  fetchClubThemeColors,
  fetchEditorialCrests,
} from "@/lib/club-identity";
import { fetchSiteSocialLinks } from "@/lib/queries";
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
  // shared components exactly as before.
  if (club.siteTemplate === "editorial") {
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
