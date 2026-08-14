"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import EditorialMatchdaySlideshow from "@/components/editorial/EditorialMatchdaySlideshow";
import { EditorialIdentityProvider } from "@/components/editorial/EditorialIdentityContext";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import {
  fetchClubIdentity,
  fetchClubThemeColors,
  type ClubIdentityContent,
  type ClubThemeColors,
} from "@/lib/editorial-identity";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";
import type { DraftHomepagePhoto } from "@/lib/homepage-content";
import "@/styles/editorial.css";

/**
 * Live-style preview for the Slideshow tab of /admin/homepage on editorial@1.
 *
 * What this replaces: the homepage admin used to hand-roll a mockup of the
 * slideshow -- `draftPhotos[0]` in a 16/9 box with a hardcoded "01 / NN"
 * label and a decorative red bar. It never advanced, had no transition, no
 * arrows or progress track, no heading, and none of the editorial slideshow's
 * actual composition (blurred backdrop, navy shade, contained photo inset from
 * the left, oversized two-tone heading). Every other admin surface already
 * solves this by mounting the *real* public component inside ScaledPagePreview
 * (see ScaledTryoutsPreview / ScaledContactPreview), so this does the same
 * instead of maintaining a second, drifting implementation of the slideshow.
 *
 * Mounting the real component means the preview inherits its real behavior for
 * free: the 4s auto-advance, the 0.9s cross-fade, the arrow/counter/progress
 * controls, and the "hidden entirely when there are no photos" rule.
 *
 * Two things the public shell normally provides have to be reproduced here,
 * because the admin route is not wrapped in EditorialShell:
 *
 *  1. `data-site-template="editorial"` plus the --club-* custom properties
 *     every rule in styles/editorial.css is scoped to and derives its palette
 *     from. That scoping is also why importing the stylesheet into the admin
 *     bundle cannot leak into the rest of the admin UI.
 *  2. EditorialIdentityProvider, so the slideshow's heading resolves from
 *     club_identity (slideshow_heading_top/em) exactly as it does publicly,
 *     rather than falling back to the context default and rendering no heading.
 *
 * The photos come from the unsaved admin draft, not from a fetch, so the
 * preview reflects edits before they are saved.
 */

const DEFAULT_PRIMARY = "#1B2958";
const DEFAULT_SECONDARY = "#AD3234";

/**
 * ScaledPagePreview lays the page out at a fixed 1440px desktop width, but a
 * `vw`-based token still resolves against the real browser viewport. --pad-x
 * is the gutter the slideshow's heading and controls are pinned to, so it is
 * pinned to the value a 1440px desktop produces (clamp(20px, 5vw, 72px) => the
 * 72px cap) instead of tracking the admin window width.
 */
const DESKTOP_PAD_X = "72px";

function toPreviewPhotos(
  photos: DraftHomepagePhoto[],
): DBHomepageSlideshowPhoto[] {
  return photos.map((photo, index) => ({
    // Unsaved uploads have no row id yet; the real component keys on `id`, and
    // an index-derived key cannot collide with a saved photo's uuid.
    id: photo.id ?? `draft-${index}`,
    url: photo.url,
    alt: photo.alt,
    sort_order: index,
    created_at: "",
  }));
}

export default function ScaledSlideshowPreview({
  photos,
}: {
  photos: DraftHomepagePhoto[];
}) {
  const club = useClubContext();
  const { clubLogoUrl, inverseLogoUrl } = useClubBranding();
  const [identity, setIdentity] = useState<ClubIdentityContent | null>(null);
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? DEFAULT_PRIMARY,
    secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    accent: club.secondaryColor ?? DEFAULT_SECONDARY,
  });

  useEffect(() => {
    let cancelled = false;

    fetchClubIdentity(club.id)
      .then((value) => {
        if (!cancelled) setIdentity(value);
      })
      .catch((error: unknown) => {
        console.error("ScaledSlideshowPreview: fetchClubIdentity:", error);
      });

    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? DEFAULT_PRIMARY,
      secondary: club.secondaryColor ?? DEFAULT_SECONDARY,
    })
      .then((value) => {
        if (!cancelled) setTheme(value);
      })
      .catch((error: unknown) => {
        console.error("ScaledSlideshowPreview: fetchClubThemeColors:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [club.id, club.primaryColor, club.secondaryColor]);

  const previewPhotos = useMemo(() => toPreviewPhotos(photos), [photos]);

  if (previewPhotos.length === 0) {
    // Matches the real component, which renders nothing at all with no photos.
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex aspect-[16/9] items-center justify-center">
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            Slideshow hidden until a photo is added.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScaledPagePreview className="rounded-lg border border-border">
      <div
        data-site-template="editorial"
        style={
          {
            "--club-primary": theme.primary,
            "--club-secondary": theme.secondary,
            "--club-accent": theme.accent,
            "--pad-x": DESKTOP_PAD_X,
            // The template wrapper is a full-page shell publicly
            // (min-height: 100svh); inside a section-sized preview that would
            // add an empty paper band under the slideshow.
            minHeight: 0,
          } as CSSProperties
        }
      >
        <EditorialIdentityProvider
          value={{
            identity,
            crestUrl: clubLogoUrl,
            crestOnDarkUrl: inverseLogoUrl || clubLogoUrl,
          }}
        >
          <EditorialMatchdaySlideshow photos={previewPhotos} />
        </EditorialIdentityProvider>
      </div>
    </ScaledPagePreview>
  );
}
