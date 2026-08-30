"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import AboutClubPageClient from "@/components/AboutClubPageClient";
import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import EditorialAboutPage from "@/components/editorial/EditorialAboutPage";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  fetchClubThemeColors,
  type ClubThemeColors,
} from "@/lib/editorial-identity";
import type {
  DBAboutPageContent,
  DBClubLogoPageContent,
} from "@/lib/db-types";
// Side-effect import: editorial.css's rules are scoped under
// [data-site-template="editorial"] and are normally only pulled into the
// bundle by components/editorial/EditorialShell.tsx, which the admin app
// never mounts. The editorial branch below renders that same markup, so the
// stylesheet has to be imported here directly or it would render unstyled.
// Same wiring as ScaledTryoutsPreview and ScaledShopKitPreview.
import "@/styles/editorial.css";

/**
 * Live-style preview for /admin/about.
 *
 * The previous preview mounted the real page component directly inside the
 * admin column and let it respond to that column's width, so it rendered its
 * mobile/tablet layout and re-flowed as the browser resized — the sizing
 * problem this replaces. Rendering at a fixed desktop width and scaling the
 * result down keeps the proportions a visitor actually sees, matching
 * ScaledShopKitPreview.
 *
 * The real public /club/about route
 * (app/%5Fclubs/[slug]/club/about/page.tsx) branches on
 * club.presentationTemplateKey: editorial@1 tenants (Lions FC) get
 * EditorialAboutPage, everyone else falls through to AboutClubPageClient.
 * This preview mirrors that branch instead of always rendering
 * AboutClubPageClient, which previously showed every editorial tenant the
 * default template's layout instead of their own club-colored editorial
 * page. Both components read the same DBAboutPageContent draft, so no data
 * is remapped here. academy@1/clubhouse@1/cinematic@1/heritage@1 and clubs
 * with no published presentation are unaffected.
 *
 * The "logo" variant has no editorial branch on purpose: templateRegistry's
 * editorial@1 entry lists no "club-logo" route, so /admin/about hides that
 * tab for the template entirely and never mounts this variant for it.
 */
const DESKTOP_PREVIEW_WIDTH = 1440;

// Mirrors EditorialShell.tsx's own fallback constants, used there until its
// async fetchClubThemeColors call resolves.
const EDITORIAL_DEFAULT_PRIMARY = "#1B2958";
const EDITORIAL_DEFAULT_SECONDARY = "#AD3234";

type ScaledAboutPreviewProps =
  | { variant: "about"; content: DBAboutPageContent }
  | { variant: "logo"; content: DBClubLogoPageContent };

export default function ScaledAboutPreview(props: ScaledAboutPreviewProps) {
  const club = useClubContext();
  const isEditorialAbout =
    club.presentationTemplateKey === "editorial@1" && props.variant === "about";
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? EDITORIAL_DEFAULT_PRIMARY,
    secondary: club.secondaryColor ?? EDITORIAL_DEFAULT_SECONDARY,
    accent: club.secondaryColor ?? EDITORIAL_DEFAULT_SECONDARY,
  });

  useEffect(() => {
    if (!isEditorialAbout) return;
    let cancelled = false;

    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? EDITORIAL_DEFAULT_PRIMARY,
      secondary: club.secondaryColor ?? EDITORIAL_DEFAULT_SECONDARY,
    })
      .then((value) => {
        if (!cancelled) setTheme(value);
      })
      .catch((error: unknown) => {
        console.error("ScaledAboutPreview: fetchClubThemeColors:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isEditorialAbout, club.id, club.primaryColor, club.secondaryColor]);

  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const nextScale = Math.min(1, frame.clientWidth / DESKTOP_PREVIEW_WIDTH);
      setScale(nextScale);
      setScaledHeight(canvas.scrollHeight * nextScale);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    document.fonts?.ready.then(measure);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="relative w-full overflow-hidden bg-white">
      <div
        style={{
          position: "relative",
          width: DESKTOP_PREVIEW_WIDTH * scale,
          height: scaledHeight || undefined,
          margin: "0 auto",
        }}
      >
        <div
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: DESKTOP_PREVIEW_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {props.variant === "about" ? (
            isEditorialAbout ? (
              <div
                data-site-template="editorial"
                style={
                  {
                    "--club-primary": theme.primary,
                    "--club-secondary": theme.secondary,
                    "--club-accent": theme.accent,
                  } as CSSProperties
                }
              >
                <EditorialAboutPage content={props.content} />
              </div>
            ) : (
              <AboutClubPageClient content={props.content} animate={false} />
            )
          ) : (
            <ClubLogoPageClient content={props.content} animate={false} />
          )}
        </div>
      </div>
    </div>
  );
}
