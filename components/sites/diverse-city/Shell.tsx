"use client";

import { Suspense, type ReactNode } from "react";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import AcademyFontScope from "./FontScope";
import Footer from "./Footer";
import Nav from "./Nav";
import { AcademyRoutePageLoading } from "./RouteLoadingSkeleton";

/**
 * The one frame around every Academy page. Public routes and the editor
 * preview both render it. A preview shows the header and footer only in
 * playback, and never the loading-time footer guard or page fallback.
 */
export default function AcademyShell({ children }: { children: ReactNode }) {
  const preview = useHomepagePreview();
  const publicPage = preview === null;
  const chrome = publicPage || Boolean(preview.playback);

  return (
    <AcademyFontScope>
      {/* Remove the footer and its links while the page loader is present so
          slow routes cannot scroll into a blank footer-sized area. */}
      {publicPage && <style>{`html:has([data-academy-page-loading]) footer { display: none; }`}</style>}
      {chrome && <Nav />}
      <main>
        {publicPage ? (
          <Suspense fallback={<AcademyRoutePageLoading />}>{children}</Suspense>
        ) : (
          children
        )}
      </main>
      {chrome && <Footer />}
    </AcademyFontScope>
  );
}
