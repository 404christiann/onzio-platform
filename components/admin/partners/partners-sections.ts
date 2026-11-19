import { mediaAssetUrl } from "@/lib/media-assets";
import {
  cinematicPartnersDraftSchema, cinematicPartnersSaveSchema, starterCinematicPartnersContent,
  type CinematicPartner, type CinematicPartnersContent, type CinematicPartnersSave, type CinematicPartnersSnapshot, type PartnerLogoMedia, type PartnerLogoTone, type PartnerPage,
} from "@/lib/cinematic-partners-content";

/** Pure pieces of the Partners editor: what the dialog edits, what counts as changed, and the save request. */

export const PAGE_LABELS: Record<PartnerPage, string> = { partners: "Club Partners", opportunities: "Partnership Opportunities" };
export const PAGE_ROUTES: Record<PartnerPage, string> = { partners: "/sponsors", opportunities: "/community/partnership" };
export const TONES: Record<PartnerLogoTone, string> = { original: "Original colours", grey: "Grey (for a white logo)", black: "Black (for a white logo)" };
export const TONE_SHORT: Record<PartnerLogoTone, string> = { original: "Original", grey: "Grey", black: "Black" };

/** A dialog section: one of the two pages, or one partner by its row id. */
export type PartnersDialogId = `page:${PartnerPage}` | `partner:${string}`;
export const pageDialogId = (page: PartnerPage): PartnersDialogId => `page:${page}`;
export const partnerDialogId = (id: string): PartnersDialogId => `partner:${id}`;
export function parseDialogId(id: string): { kind: "page"; page: PartnerPage } | { kind: "partner"; id: string } | null {
  if (id === "page:partners" || id === "page:opportunities") return { kind: "page", page: id.slice(5) as PartnerPage };
  if (id.startsWith("partner:")) return { kind: "partner", id: id.slice(8) };
  return null;
}

export const savedContent = (snapshot: Pick<CinematicPartnersSnapshot, "content"> | null): CinematicPartnersContent => snapshot?.content ?? starterCinematicPartnersContent();

/** The draft in schema key order, so two copies of the same content compare equal whatever order they were built in. */
function normalized(content: CinematicPartnersContent): string {
  const parsed = cinematicPartnersDraftSchema.safeParse(content);
  return JSON.stringify(parsed.success ? parsed.data : content);
}
export const partnersDirty = (draft: CinematicPartnersContent, saved: CinematicPartnersContent) => normalized(draft) !== normalized(saved);

const piece = (value: unknown) => JSON.stringify(value);
export function changedPages(draft: CinematicPartnersContent, saved: CinematicPartnersContent): PartnerPage[] {
  return (["partners", "opportunities"] as const).filter(page => piece(draft.pages[page]) !== piece(saved.pages[page]));
}
/** A partner is changed when it is new, its fields differ, or it moved. */
export function changedPartnerIds(draft: CinematicPartnersContent, saved: CinematicPartnersContent): Set<string> {
  const before = new Map(saved.partners.map((partner, index) => [partner.id, { index, text: piece(partner) }]));
  return new Set(draft.partners.flatMap((partner, index) => {
    const was = before.get(partner.id);
    return !was || was.index !== index || was.text !== piece(partner) ? [partner.id] : [];
  }));
}

export const partnerName = (partner: CinematicPartner, index: number) => partner.name.trim() || `Partner ${index + 1}`;

export function logoUrl(logo: PartnerLogoMedia): string {
  try { return mediaAssetUrl({ storage_bucket: "onzio-media", storage_path: logo.storage_path }); } catch { return ""; }
}
export function mergeLogos(...lists: PartnerLogoMedia[][]): PartnerLogoMedia[] {
  const byId = new Map<string, PartnerLogoMedia>();
  for (const logo of lists.flat()) if (!byId.has(logo.id)) byId.set(logo.id, logo);
  return [...byId.values()];
}

/** The save body. Built exactly as the editor always built it: a retried save sends its stored request unchanged. */
export function partnersSaveInput(args: { pending: CinematicPartnersSave | null; operationId: () => string; snapshot: Pick<CinematicPartnersSnapshot, "revision" | "designRevision">; draft: CinematicPartnersContent }) {
  return args.pending ?? { operationId: args.operationId(), expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, content: args.draft };
}
export function partnersSaveRequest(args: Parameters<typeof partnersSaveInput>[0]) {
  return cinematicPartnersSaveSchema.safeParse(partnersSaveInput(args));
}

/** One partner on its own, with the page's own heading and bottom bar switched off: what a card previews. */
export function singlePartnerContent(content: CinematicPartnersContent, partner: CinematicPartner): CinematicPartnersContent {
  const blank = { ...content.pages.partners, title: "", subtitle: "", intro: "", ctaLabel: "" };
  return { pages: { partners: blank, opportunities: { ...content.pages.opportunities, ...blank } }, partners: [partner] };
}
/** The page with only the partner being edited, in the page's own words: what the dialog previews. */
export function pageWithPartner(content: CinematicPartnersContent, partner: CinematicPartner): CinematicPartnersContent {
  return { ...content, partners: [partner] };
}
/** The first few partners, to keep a page-sized card preview light. */
export function pageSample(content: CinematicPartnersContent, limit = 3): CinematicPartnersContent {
  return content.partners.length <= limit ? content : { ...content, partners: content.partners.slice(0, limit) };
}
