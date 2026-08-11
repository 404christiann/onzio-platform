"use client";

import { useOptionalClubContext } from "@/components/ClubContextProvider";
import type { TemplateKey } from "@/packages/presentation";

// Public site's loading indicator (admin's equivalent is AdminLoading.tsx),
// shown by RouteTransition once a navigation has been pending a while.
// Reuses the existing spinner-ellipsis keyframe, same as AdminLoading.
//
// Color resolves per template, all existing values, nothing new: clubhouse@1
// falls back to the literal #AD3234 because --clubhouse-accent is scoped to
// component classes this fixed-overlay indicator renders outside of; every
// other template gets --color-red, which already resolves itself per
// template (:root's #E7001B, overridden to the DCFC-D132-locked #FF1616
// under academy@1's [data-font-pack] scope that TemplateFontScope applies).

/** Staggered starts so the dots ripple rather than bounce in unison -- the
 *  same offsets `AdminLoading` uses. */
const DOT_ANIMATIONS = [
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0s]",
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0.12s]",
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0.24s]",
] as const;

function accentForTemplate(templateKey: TemplateKey | null): string {
  if (templateKey === "clubhouse@1") {
    return "var(--clubhouse-accent, #AD3234)";
  }
  return "var(--color-red)";
}

export default function SiteLoading() {
  // Optional rather than required: `app/(public)/layout.tsx` renders outside a
  // `ClubContextProvider`, and this must not be the thing that throws there.
  // Falling through to `--color-red` is the correct default anyway.
  const club = useOptionalClubContext();
  const accent = accentForTemplate(club?.presentationTemplateKey ?? null);

  return (
    <div
      role="status"
      aria-label="loading"
      className="inline-flex items-end rounded-full px-5 py-3 text-2xl font-bold leading-none shadow-lg"
      style={{
        color: accent,
        backgroundColor: "var(--color-white)",
        border: "1px solid var(--color-gray-light)",
      }}
    >
      <span className="flex items-end" aria-hidden="true">
        {DOT_ANIMATIONS.map((animation, index) => (
          <span key={index} className={`inline-block ${animation}`}>
            .
          </span>
        ))}
      </span>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
