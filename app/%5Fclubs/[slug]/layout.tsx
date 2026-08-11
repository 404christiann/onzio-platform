import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import RouteTransition from "@/components/RouteTransition";
import SiteLoading from "@/components/SiteLoading";
import TemplateFontScope from "@/components/TemplateFontScope";
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

  return (
    <ClubContextProvider club={club}>
      <ClubBrandingProvider>
        <TemplateFontScope templateKey={club.presentationTemplateKey}>
          <Nav />
          {/* Route-level fade+rise page transition. Wraps `children` only, so
              Nav and Footer stay put across navigations and neither
              component's source is touched (contract tests assert their link
              markup as literal strings). Rendered inside TemplateFontScope so
              SiteLoading inherits this template's `--color-red`. */}
          <main>
            <RouteTransition indicator={<SiteLoading />}>
              {children}
            </RouteTransition>
          </main>
          <Footer />
        </TemplateFontScope>
      </ClubBrandingProvider>
    </ClubContextProvider>
  );
}
