// MLA P1 Step 8: the shared pathway@1 presentation document for Manu Ledesma
// Academy, used by both scripts/seed-mla-local.ts (local preview seed, run in
// Phase 1) and scripts/provision-mla-staging.ts (hosted staging provisioning,
// written but only ever run by Christian). Keeping the document in one module
// guarantees the two environments publish byte-identical configuration apart
// from metadata's actor/timestamp.

import { createHash } from "node:crypto";
import {
  parsePresentationDocument,
  templateRegistry,
  type PresentationDocument,
} from "@/packages/presentation";

export const MLA_SLUG = "manu-ledesma-academy";
export const MLA_NAME = "Manu Ledesma Academy";

// Byte-identical digest computation to the local-import precedent in
// lib/migration (sha256 over JSON.stringify of the parsed document). Not
// imported from that module to keep tenant seeds decoupled from another
// tenant's import pipeline; if this ever changes there, change it here too.
export function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// pathway@1's published configuration. homepage.sections is exactly the
// registry's defaultSections (asserted below), each with an empty config --
// all Phase 1 copy is hardcoded in components/pathway/*, because
// hasUnsafeConfiguration rejects URL/path-ish config content -- and no
// `provenance` key at all: the production-surface parser rejects
// sample/unresolved provenance, and Phase 1 has no provenanced values to
// record. navigation carries the registry's nine defaultRoutes (asserted
// below). The neutral light theme passes the production contrast gates:
// text.primary #17201B on surface.canvas #FFFFFF and action.primaryText
// #FFFFFF on action.primary #17201B both clear them comfortably.
function rawConfiguration(metadata: { createdBy: string; createdAt: string }) {
  return {
    schemaVersion: 1,
    template: { id: "pathway", version: 1 },
    fontPack: "geist",
    theme: {
      surface: {
        canvas: "#FFFFFF",
        elevated: "#FFFFFF",
        subtle: "#F4F4F2",
        inverse: "#17201B",
      },
      text: {
        primary: "#17201B",
        secondary: "#3F4A44",
        muted: "#6B746F",
        inverse: "#FFFFFF",
      },
      action: {
        primary: "#17201B",
        primaryHover: "#2C3831",
        primaryText: "#FFFFFF",
        secondary: "#6B746F",
      },
      border: {
        subtle: "#E4E6E4",
        strong: "#17201B",
      },
      status: {
        success: "#12A140",
        warning: "#D69E2E",
        danger: "#B42318",
      },
    },
    modules: {
      contact: true,
      sponsors: true,
      store: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "pathway.hero",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
        {
          id: "pathway-rail",
          type: "pathway.pathway-rail",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
        {
          id: "partner-strip",
          type: "pathway.partner-strip",
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
          routes: [
            "home",
            "academy",
            "training",
            "youth-club",
            "senior-club",
            "league",
            "merch",
            "about",
            "contact",
          ],
        },
      ],
    },
    metadata: {
      recommendationId: null,
      createdBy: metadata.createdBy,
      createdAt: metadata.createdAt,
      sourceArtifact: "prospectMockups:manu-ledesma-academy",
    },
  };
}

function assertMatchesRegistryDefaults(document: PresentationDocument): void {
  const registration = templateRegistry["pathway@1"];
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
 * Builds and VALIDATES the published MLA pathway@1 document.
 *
 * The load-bearing step is the round-trip through
 * parsePresentationDocument({ surface: "production" }): a published document
 * that fails that parse does NOT error at render time --
 * resolvePublishedPresentationTemplateKey (lib/club-context.ts) swallows the
 * failure and yields presentationTemplateKey: null, silently degrading the
 * tenant to the legacy default chrome. Both seeding scripts therefore refuse
 * to insert anything this function has not accepted (it throws on any
 * schema, registry, provenance, config-safety, or theme-contrast failure).
 */
export function buildMlaPathwayPresentationConfiguration(metadata: {
  createdBy: string;
  createdAt: string;
}): { configuration: PresentationDocument; configurationDigest: string } {
  const configuration = parsePresentationDocument(rawConfiguration(metadata), {
    surface: "production",
  });
  assertMatchesRegistryDefaults(configuration);
  return { configuration, configurationDigest: digestJson(configuration) };
}
