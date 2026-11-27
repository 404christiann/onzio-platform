import { z } from "zod";
import { normalizedLink, refineLinkDestination } from "@/lib/link-destination";

export const PARTNER_PAGES = ["partners", "opportunities"] as const;
export type PartnerPage = (typeof PARTNER_PAGES)[number];
export const MAX_PARTNERS = 24;
/** White logos need a darker rendering on the white Partners pages. */
export const PARTNER_LOGO_TONES = ["original", "grey", "black"] as const;
export type PartnerLogoTone = (typeof PARTNER_LOGO_TONES)[number];
export const PARTNERSHIP_ROUTE = "/community/partnership";

const text = (max: number) => z.string().max(max);
const pageCopy = z.object({
  title: text(80), subtitle: text(120), intro: text(1200), ctaPrompt: text(160), ctaLabel: text(40),
}).strict();
const partnerRow = z.object({
  id: z.uuid(), name: text(80), role: text(160), logoAssetId: z.uuid().nullable(), tone: z.enum(PARTNER_LOGO_TONES),
}).strict();

export const cinematicPartnersDraftSchema = z.object({
  pages: z.object({ partners: pageCopy, opportunities: pageCopy.extend({ ctaHref: text(2000) }).strict() }).strict(),
  partners: z.array(partnerRow).max(MAX_PARTNERS),
}).strict();

export const cinematicPartnersContentSchema = cinematicPartnersDraftSchema.superRefine((value, context) => {
  for (const page of PARTNER_PAGES) {
    if (!value.pages[page].title.trim()) context.addIssue({ code: "custom", path: ["pages", page, "title"], message: "Enter a heading." });
  }
  refineLinkDestination(context, ["pages", "opportunities", "ctaHref"], value.pages.opportunities.ctaHref, { max: 2000 });
  const seen = new Set<string>();
  value.partners.forEach((row, index) => {
    if (!row.name.trim()) context.addIssue({ code: "custom", path: ["partners", index, "name"], message: "Enter the partner's name." });
    if (seen.has(row.id)) context.addIssue({ code: "custom", path: ["partners", index, "id"], message: "Duplicate partner." });
    seen.add(row.id);
  });
}).transform(value => ({
  ...value,
  pages: { ...value.pages, opportunities: { ...value.pages.opportunities, ctaHref: normalizedLink(value.pages.opportunities.ctaHref) } },
}));
export type CinematicPartnersContent = z.infer<typeof cinematicPartnersContentSchema>;
export type CinematicPartner = CinematicPartnersContent["partners"][number];

export const cinematicPartnersSaveSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: z.string().regex(/^[0-9]{1,20}$/),
  designRevision: z.string().min(1).max(100),
  content: cinematicPartnersContentSchema,
}).strict();
export type CinematicPartnersSave = z.infer<typeof cinematicPartnersSaveSchema>;

export type PartnerLogoMedia = { id: string; storage_path: string; width: number; height: number; label: string };
export type CinematicPartnersSnapshot = {
  revision: string;
  designRevision: string;
  content: CinematicPartnersContent | null;
  /** Logos the editor can reuse: the Sponsors editor's logos plus the logos in use here. */
  logos: PartnerLogoMedia[];
  retiredMediaAssetIds?: string[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: CinematicPartnersSnapshot };
};

export function starterCinematicPartnersContent(): CinematicPartnersContent {
  const prompt = "Interested in becoming a sponsor or partner?";
  return {
    pages: {
      partners: { title: "Club Partners", subtitle: "Fueled by our amazing partners", intro: "", ctaPrompt: prompt, ctaLabel: "Partnerships" },
      opportunities: { title: "Partnership Opportunities", subtitle: "Fueled by our amazing partners", intro: "", ctaPrompt: prompt, ctaLabel: "Partnerships", ctaHref: "" },
    },
    partners: [],
  };
}

export function partnerAction(content: CinematicPartnersContent, page: PartnerPage): { prompt: string; label: string; href: string } | null {
  const copy = content.pages[page];
  const href = page === "partners" ? PARTNERSHIP_ROUTE : content.pages.opportunities.ctaHref;
  if (!href || !copy.ctaLabel.trim()) return null;
  return { prompt: copy.ctaPrompt, label: copy.ctaLabel, href };
}
