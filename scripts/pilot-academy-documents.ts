import { z } from "zod";
import { validateRegistrationStatusToken } from "../lib/registration-status-token";
import { academyHref, academyRoutes, type AcademyRouteId } from "../components/sites/diverse-city/routes";

const segment = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const academyProofParametersSchema = z.object({
  programSlug: segment, formSlug: segment, playerId: z.uuid(), fixtureId: z.uuid(),
  confirmationToken: z.string().refine(value => {
    try { validateRegistrationStatusToken(value); return true; } catch { return false; }
  }, "Confirmation token must satisfy the shared registration contract"),
}).strict();
export type AcademyProofParameters = z.infer<typeof academyProofParametersSchema>;

const publicCases = {
  home: { selector: "main h1", text: null },
  about: { selector: "main h1", text: "Academy proof story" },
  logo: { selector: "main", text: "Proof crest feature" },
  contact: { selector: "main h1", text: "Academy proof contact" },
  programs: { selector: "main", text: "Academy proof program" },
  programDetail: { selector: "main h1", text: "Academy proof program" },
  register: { selector: "main h1", text: "Academy proof registration" },
  registerConfirmation: { selector: "main", text: "Registration confirmed" },
  roster: { selector: "main", text: "Proof Player" },
  rosterPlayer: { selector: "main", text: "Profile unavailable." },
  schedule: { selector: "main", text: "Proof Opponent" },
  scheduleFixture: { selector: "main", text: "Match area unavailable." },
  shop: { selector: "main", text: "Home kit pilot" },
  sponsors: { selector: "main", text: "Proud partner" },
  staff: { selector: "main", text: "Proof Coach" },
  stats: { selector: "main", text: "Team statistics are not published for this site yet." },
  tryouts: { selector: "main", text: "Academy proof tryouts" },
} satisfies Record<AcademyRouteId, { selector: string; text: string | null }>;

const previews = {
  homepage: { path: "/admin/homepage", frame: "Homepage preview", action: null },
  about: { path: "/admin/about", frame: "Public About page preview", action: null },
  contact: { path: "/admin/contact", frame: "Public Contact page preview", action: null },
  tryouts: { path: "/admin/tryouts", frame: "Tryouts page editing preview", action: null },
  programs: { path: "/admin/programs", frame: "/programs preview", action: "All programs" },
  programDetail: { path: "/admin/programs", frame: "program-detail", action: "Academy proof program" },
  shop: { path: "/admin/shop", frame: "Shop page preview", action: "Shop page" },
  homeKit: { path: "/admin/shop", frame: "Shop page preview", action: "Homepage shop feature" },
  sponsorsCarousel: { path: "/admin/sponsors", frame: null, action: null },
  standings: { path: "/admin/standings", frame: null, action: null },
  brandingFooter: { path: "/admin/branding", frame: null, action: null },
} as const;
export type AcademyPreviewId = keyof typeof previews;
const publicIds = Object.keys(academyRoutes).filter((id): id is AcademyRouteId => Object.hasOwn(publicCases, id));
const previewIds = Object.keys(previews).filter((id): id is AcademyPreviewId => Object.hasOwn(previews, id));
export const academyProofDocumentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public"), route: z.enum(publicIds) }).strict(),
  z.object({ kind: z.literal("preview"), preview: z.enum(previewIds) }).strict(),
]);
export type AcademyProofDocument = z.infer<typeof academyProofDocumentSchema>;
export type AcademyProofDocumentCase = {
  id: string; document: AcademyProofDocument; path: string;
  selector: string; text: string | null; frame: string | null; action: string | null;
};

export function academyProofDocuments(input: AcademyProofParameters): readonly AcademyProofDocumentCase[] {
  const parameters = academyProofParametersSchema.parse(input);
  function publicPath(route: AcademyRouteId) {
    switch (route) {
      case "programDetail": return academyHref(route, { programSlug: parameters.programSlug });
      case "register": return academyHref(route, { formSlug: parameters.formSlug });
      case "registerConfirmation": return `${academyHref(route, { formSlug: parameters.formSlug })}?token=${parameters.confirmationToken}`;
      case "rosterPlayer": return academyHref(route, { playerId: parameters.playerId });
      case "scheduleFixture": return academyHref(route, { fixtureId: parameters.fixtureId });
      default: return academyHref(route);
    }
  }
  return [
    ...publicIds.map(route => ({ id: `public.${route}`, document: { kind: "public", route } as const,
      path: publicPath(route), ...publicCases[route], frame: null, action: null })),
    ...previewIds.map(preview => ({ id: `preview.${preview}`, document: { kind: "preview", preview } as const,
      ...previews[preview], frame: previews[preview].frame === "program-detail" ? `${publicPath("programDetail")} preview` : previews[preview].frame, selector: "[data-admin-public-preview]", text: preview === "standings" ? "Academy proof club" : preview === "brandingFooter" ? "Academy proof footer" : null })),
  ];
}

export function academyProofDocumentPath(input: AcademyProofDocument, parameters: AcademyProofParameters) {
  const document = academyProofDocumentSchema.parse(input);
  const item = academyProofDocuments(parameters).find(item => JSON.stringify(item.document) === JSON.stringify(document));
  if (!item) throw new Error("UNKNOWN_ACADEMY_PROOF_DOCUMENT");
  return item.path;
}

export function assertAcademyProofCoverage(observed: readonly string[]) {
  const expected = [...publicIds.map(id => `public.${id}`), ...previewIds.map(id => `preview.${id}`)].sort();
  if (observed.length !== expected.length || new Set(observed).size !== observed.length
    || observed.toSorted().some((id, index) => id !== expected[index])) throw new Error("INCOMPLETE_ACADEMY_PROOF_COVERAGE");
}
