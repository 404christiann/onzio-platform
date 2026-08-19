// CV United C1 (fix-up): the shared crest@1 presentation document for CV
// United, used by scripts/seed-cv-united.ts. Mirrors the pattern established
// by scripts/mla-pathway-presentation.ts (Manu Ledesma Academy's pathway@1
// document) so both tenants' seeds stay consistent.
//
// Without a published presentation_documents row, resolvePublishedPresentationTemplateKey
// (lib/club-context.ts) silently returns null and the tenant renders through
// legacy default chrome instead of crest@1 -- this module exists specifically
// to prevent that failure mode, per the load-bearing comment on
// buildMlaPathwayPresentationConfiguration below.

import { createHash } from "node:crypto";
import {
  parsePresentationDocument,
  templateRegistry,
  type PresentationDocument,
} from "@/packages/presentation";

export const CV_UNITED_SLUG = "cv-united";
export const CV_UNITED_NAME = "CV United";

export function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// crest@1's published configuration. homepage.sections is exactly the
// registry's defaultSections; all Phase 1 copy is hardcoded in
// components/crest/*, so config stays empty and there's no provenance key
// (the production-surface parser rejects sample/unresolved provenance).
// navigation carries the registry's six defaultRoutes.
//
// Visual refresh (2026-08-18): Christian reviewed the earlier
// Real-Madrid-inspired navy/gold/white mock against the real reference site
// (Manu Ledesma Academy, pathway@1) and supplied CV United's real crest and
// real brand colors -- Black #060605, Red #EC0A0C, Gold #E3A71C, Light Gold
// #F9D444. Theme below maps them onto the same schema the prior mock used
// (Black plays the role the prior navy played -- dominant ink / inverse
// surface; Red is now the primary action color; Gold is a secondary accent
// used sparingly, matching the crest artwork's own gold trim/wordmark, not
// a dominant UI color). `accent.two` is a darkened, contrast-legible tint
// of the brand gold (not a separately-supplied brand color) for anywhere
// gold text must sit on a light surface -- the bright gold fails text
// contrast the same way the prior mock's bright gold did, hence the same
// two-shades-of-gold split. Kept byte-identical to styles/globals.css's
// `.crest-home` block so the published document and the CSS never drift.
//
// Typography + section-rhythm precision pass (2026-08-19): only
// `theme.surface.subtle` changed here (#F4EFE2 -> #FAFAFA, see its own
// comment below) -- the black inverted feature band this pass removed, the
// monospace eyebrow, the corrected H1/H2 type scale, and the true-pill
// button shape are all component-level CSS typography/layout mechanics
// (styles/globals.css, components/crest/CrestHero.tsx,
// components/crest/CrestFeatureBand.tsx), not colors, so this schema-bound
// theme object otherwise carries no schema slot for them and is unchanged
// beyond that one surface value.
function rawConfiguration(metadata: { createdBy: string; createdAt: string }) {
  return {
    schemaVersion: 1,
    template: { id: "crest", version: 1 },
    // Bold, tight-tracking sans-serif matching MLA's real headline
    // typeface -- Geist Sans, the same "geist" pack pathway@1 (MLA) uses.
    // No dedicated pack fit before this either: "playfair-inter"'s
    // high-contrast didone voice was the approved direction for the old
    // Real-Madrid-inspired mock, but the verified real reference is a
    // modern grotesk, not a serif display face -- geist already covers it,
    // so no new pack was registered (see packages/presentation/index.ts).
    fontPack: "geist",
    theme: {
      surface: {
        canvas: "#FFFFFF",
        elevated: "#FBF8EF",
        // Barely-off-white (2026-08-19 typography/section-rhythm pass):
        // MLA's real section background, measured live as rgb(250,250,250).
        // Was #F4EFE2 (a warm cream matching the earlier Real-Madrid-
        // inspired mock); now also the feature band's own background,
        // replacing the removed black inverted band -- kept byte-identical
        // to styles/globals.css's `.crest-home` block per the established
        // convention (see that file's `--crest-surface-subtle` comment).
        subtle: "#FAFAFA",
        inverse: "#060605",
      },
      text: {
        primary: "#060605",
        secondary: "#46413A",
        muted: "#767065",
        inverse: "#FFFFFF",
      },
      action: {
        primary: "#EC0A0C",
        primaryHover: "#C40809",
        primaryText: "#FFFFFF",
        secondary: "#E3A71C",
      },
      border: {
        subtle: "#E5DFCE",
        strong: "#060605",
      },
      status: {
        success: "#1B7A43",
        warning: "#B45309",
        danger: "#B42318",
      },
      accent: {
        one: "#E3A71C",
        two: "#8A5E12",
      },
    },
    modules: {
      roster: true,
      schedule: true,
      sponsors: true,
      contact: true,
      registrations: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "crest.hero",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
        {
          id: "feature-band",
          type: "crest.feature-band",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "partner-strip",
          type: "crest.partner-strip",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
      ],
    },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          // Kept byte-identical in shape to templateRegistry["crest@1"]
          // .defaultRoutes (packages/presentation/index.ts) -- CV United C1
          // shop scope added "store" before "contact";
          // assertMatchesRegistryDefaults below enforces this stays in sync.
          routes: ["home", "club", "roster", "schedule", "store", "contact", "join"],
        },
      ],
    },
    metadata: {
      recommendationId: null,
      createdBy: metadata.createdBy,
      createdAt: metadata.createdAt,
      sourceArtifact: "prospectMockups:cv-united",
    },
  };
}

function assertMatchesRegistryDefaults(document: PresentationDocument): void {
  const registration = templateRegistry["crest@1"];
  const sectionTypes = document.homepage.sections.map((section) => section.type);
  if (
    sectionTypes.length !== registration.defaultSections.length ||
    registration.defaultSections.some((type, index) => sectionTypes[index] !== type)
  ) {
    throw new Error(
      `homepage.sections must be exactly the registered defaultSections ` +
        `[${registration.defaultSections.join(", ")}]; got [${sectionTypes.join(", ")}].`,
    );
  }
  const routes = document.navigation.groups[0]?.routes ?? [];
  if (
    document.navigation.groups.length !== 1 ||
    routes.length !== registration.defaultRoutes.length ||
    registration.defaultRoutes.some((route, index) => routes[index] !== route)
  ) {
    throw new Error(
      `navigation must be one "main" group carrying exactly the registered ` +
        `defaultRoutes [${registration.defaultRoutes.join(", ")}].`,
    );
  }
  for (const section of document.homepage.sections) {
    if (Object.keys(section.config).length > 0 || section.provenance !== undefined) {
      throw new Error(
        `Phase 1 sections must have empty config and no provenance (section ${section.id}).`,
      );
    }
  }
}

/**
 * Builds and VALIDATES the published crest@1 document for CV United. Refuses
 * to return anything parsePresentationDocument({ surface: "production" })
 * has not accepted -- see module comment for why an unvalidated document is
 * worse than no document at all (it degrades silently, not loudly).
 */
export function buildCrestPresentationConfiguration(metadata: {
  createdBy: string;
  createdAt: string;
}): { configuration: PresentationDocument; configurationDigest: string } {
  const configuration = parsePresentationDocument(rawConfiguration(metadata), {
    surface: "production",
  });
  assertMatchesRegistryDefaults(configuration);
  return { configuration, configurationDigest: digestJson(configuration) };
}
