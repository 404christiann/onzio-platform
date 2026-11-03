import {
  fontPacks,
  sectionRegistry,
  templateRegistry,
  type PresentationDocument,
  type ActiveTemplateKey,
} from "@/packages/presentation";

type ActiveTemplateId = "clubhouse" | "academy";

const FALLBACKS: Record<ActiveTemplateId, { fontPack: string; sections: string[] }> = {
  clubhouse: {
    fontPack: "geist",
    sections: [
      "clubhouse.hero",
      "shared.next-match",
      "clubhouse.slideshow",
      "clubhouse.kits",
      "shared.history",
      "clubhouse.partners",
    ],
  },
  academy: {
    fontPack: "montserrat-inter-dmsans",
    sections: [
      "academy.hero",
      "academy.kit-feature",
      "shared.next-match",
      "shared.history",
      "academy.partners",
      "academy.standings",
      "academy.programs-pathway",
    ],
  },
};

export function presentationDocumentForTemplate(
  source: PresentationDocument,
  templateId: ActiveTemplateId,
): PresentationDocument {
  const key: ActiveTemplateKey = `${templateId}@1`;
  const fallback = FALLBACKS[templateId];
  const sections = source.homepage.sections.filter((section) =>
    sectionRegistry[section.type]?.compatibleTemplates?.includes(key),
  );
  const routes = source.navigation.groups
    .flatMap((group) => group.routes)
    .filter((route) => templateRegistry[key].supportedRoutes.includes(route));

  return {
    ...source,
    template: { id: templateId, version: 1 },
    fontPack: fontPacks[source.fontPack]?.compatibleTemplates?.includes(key)
      ? source.fontPack
      : fallback.fontPack,
    homepage: {
      sections:
        sections.length > 0
          ? sections
          : fallback.sections.map((type) => ({
              id: type.replace(".", "-"),
              type,
              enabled: true,
              emptyBehavior: sectionRegistry[type].emptyBehavior,
              config: {},
            })),
    },
    navigation: {
      groups: [{ id: "main", label: null, routes: routes.length > 0 ? routes : templateRegistry[key].defaultRoutes }],
    },
  };
}
