import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import RouteTransition from "@/components/RouteTransition";
import SiteLoading from "@/components/SiteLoading";

export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      {/* Same route-level fade+rise as the rewritten tenant layout at
          `app/_clubs/[slug]/layout.tsx`. Middleware rewrites every public
          tenant path into that route group, so this layout is the secondary
          path; both are wrapped so the behaviour cannot diverge. */}
      <main>
        <RouteTransition indicator={<SiteLoading />}>
          {children}
        </RouteTransition>
      </main>
      <Footer />
    </>
  );
}
