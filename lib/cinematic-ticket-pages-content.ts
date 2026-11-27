import { z } from "zod";
import { linkDestinationSchema } from "@/lib/link-destination";
import type { VisitorPageMedia, VisitorPageSnapshot } from "@/lib/visitor-page-editor";

/**
 * RC2027-TICKET-PAGES: Season Ticket Membership and Know Before You Go (cinematic@2, Tickets menu).
 * Mirrors onzio_private.check_ticket_page_content. `images` holds one entry per fixed slot and per list item
 * (keyed by the item's ID); image identities live in onzio.cinematic_ticket_page_images, the JSON keeps descriptions.
 */
export const TICKET_PAGE_KEYS = ["season-membership", "know-before-you-go"] as const;
export type TicketPageKey = typeof TICKET_PAGE_KEYS[number];
export const TICKET_PAGE_PATHS: Record<TicketPageKey, string> = {
  "season-membership": "/tickets/season-membership",
  "know-before-you-go": "/tickets/know-before-you-go",
};
export const TICKET_PAGE_FIXED_SLOTS = {
  "season-membership": ["ticket"],
  "know-before-you-go": ["youtube", "raffle", "donor"],
} as const satisfies Record<TicketPageKey, readonly string[]>;
export const MAX_SEASON_HIGHLIGHTS = 12;
export const MAX_SEASON_INCLUDES = 30;
export const MAX_SEASON_PRICE_ROWS = 6;
export const MAX_SEASON_BENEFITS = 12;
export const MAX_KBYG_TILES = 24;

const short = z.string().max(120);
const long = z.string().max(4000);
const visible = z.boolean();
/** RC-ADMIN-07: optional show/hide flag (absent = shown; hidden only on an explicit false). */
const optionalVisible = z.boolean().optional();
export const isTicketPartShown = (part: { visible?: boolean }): boolean => part.visible !== false;
const link = linkDestinationSchema({ max: 2000 });
const itemId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}-[a-z0-9-]{1,50}$`), "Invalid item ID.");
export const ticketPageImageSchema = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
const images = z.record(z.string().regex(/^[a-z0-9-]{1,60}$/), ticketPageImageSchema);

/** One image entry per fixed slot and list item, and unique item IDs. */
function slotRule(fixed: readonly string[], ids: (content: never) => string[]) {
  return (content: { images: Record<string, unknown> }, context: z.RefinementCtx) => {
    const itemIds = ids(content as never);
    if (new Set(itemIds).size !== itemIds.length) context.addIssue({ code: "custom", path: ["images"], message: "Each item needs its own ID." });
    const expected = [...fixed, ...itemIds].sort(), actual = Object.keys(content.images).sort();
    if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
      context.addIssue({ code: "custom", path: ["images"], message: "Each item needs exactly one image slot." });
    }
  };
}

const seasonShape = z.object({
  heading: z.object({ title: short, subtitle: short, visible: optionalVisible }).strict(),
  intro: z.object({ visible: optionalVisible, text: long, highlights: z.array(long).max(MAX_SEASON_HIGHLIGHTS), includesHeading: short, includes: z.array(long).max(MAX_SEASON_INCLUDES) }).strict(),
  pricing: z.object({
    visible, sectionLabel: short, columns: z.array(short).length(3),
    rows: z.array(z.object({ id: itemId("seat"), name: short, prices: z.array(z.string().max(40)).length(3) }).strict()).max(MAX_SEASON_PRICE_ROWS),
    footnote: long,
  }).strict(),
  button: z.object({ visible: optionalVisible, label: z.string().max(60), href: link }).strict(),
  benefits: z.object({ visible, heading: short, items: z.array(z.object({ id: itemId("benefit"), label: short }).strict()).max(MAX_SEASON_BENEFITS) }).strict(),
  closing: z.object({ visible, heading: short }).strict(),
  images,
}).strict();
export const seasonMembershipItemIds = (content: z.infer<typeof seasonShape>) => [...content.pricing.rows.map(row => row.id), ...content.benefits.items.map(item => item.id)];
export const seasonMembershipSchema = seasonShape.superRefine(slotRule(TICKET_PAGE_FIXED_SLOTS["season-membership"], seasonMembershipItemIds));
export type SeasonMembershipContent = z.infer<typeof seasonMembershipSchema>;

const kbygShape = z.object({
  heading: z.object({ title: short, subtitle: short }).strict(),
  match: z.object({ visible, competition: short, watchLabel: short, watchHref: link }).strict(),
  facts: z.object({ visible, tiles: z.array(z.object({ id: itemId("tile"), label: short }).strict()).max(MAX_KBYG_TILES) }).strict(),
  raffle: z.object({ visible, heading: short, subheading: short, body: z.string().max(2000) }).strict(),
  donor: z.object({ visible, heading: short, name: short, body: long, buttonLabel: z.string().max(60), buttonHref: link }).strict(),
  images,
}).strict();
export const knowBeforeYouGoItemIds = (content: z.infer<typeof kbygShape>) => content.facts.tiles.map(tile => tile.id);
export const knowBeforeYouGoSchema = kbygShape.superRefine(slotRule(TICKET_PAGE_FIXED_SLOTS["know-before-you-go"], knowBeforeYouGoItemIds));
export type KnowBeforeYouGoContent = z.infer<typeof knowBeforeYouGoSchema>;

export type TicketPageContentMap = { "season-membership": SeasonMembershipContent; "know-before-you-go": KnowBeforeYouGoContent };
export type TicketPageContent<K extends TicketPageKey = TicketPageKey> = TicketPageContentMap[K];
export const ticketPageSchemas = { "season-membership": seasonMembershipSchema, "know-before-you-go": knowBeforeYouGoSchema } as const;

export function ticketPageSaveSchema<K extends TicketPageKey>(key: K) {
  return z.object({
    operationId: z.uuid(), expectedRevision: z.string().regex(/^\d{1,20}$/), designRevision: z.string().min(1).max(100),
    content: ticketPageSchemas[key] as unknown as z.ZodType<TicketPageContent<K>>, retiredMediaAssetIds: z.array(z.uuid()).max(100).default([]),
  }).strict();
}
export type TicketPageSaveRequest<K extends TicketPageKey = TicketPageKey> = {
  operationId: string; expectedRevision: string; designRevision: string; content: TicketPageContent<K>; retiredMediaAssetIds: string[];
};
export type TicketPageSnapshot<K extends TicketPageKey = TicketPageKey> = VisitorPageSnapshot<TicketPageContent<K>>;

const blank = () => ({ assetId: null, alt: "" });

/** A club that has never saved the page: the title only, every other section empty and hidden. */
export function emptyTicketPageContent<K extends TicketPageKey>(key: K): TicketPageContent<K> {
  if (key === "season-membership") {
    const content: SeasonMembershipContent = {
      heading: { title: "Season Ticket Membership", subtitle: "" },
      intro: { text: "", highlights: [], includesHeading: "Includes", includes: [] },
      pricing: { visible: false, sectionLabel: "Section", columns: ["Full season per match price", "Single match price", "Full season savings"], rows: [], footnote: "" },
      button: { label: "Buy Season Membership", href: "" },
      benefits: { visible: false, heading: "Member Benefits", items: [] },
      closing: { visible: false, heading: "" },
      images: { ticket: blank() },
    };
    return content as TicketPageContent<K>;
  }
  const content: KnowBeforeYouGoContent = {
    heading: { title: "Know Before You Go", subtitle: "" },
    match: { visible: true, competition: "", watchLabel: "", watchHref: "" },
    facts: { visible: false, tiles: [] },
    raffle: { visible: false, heading: "", subheading: "", body: "" },
    donor: { visible: false, heading: "", name: "", body: "", buttonLabel: "", buttonHref: "" },
    images: { youtube: blank(), raffle: blank(), donor: blank() },
  };
  return content as TicketPageContent<K>;
}

export function ticketPageDraftFingerprint<K extends TicketPageKey>(key: K, content: TicketPageContent<K>): string {
  return JSON.stringify(ticketPageSchemas[key].parse(content));
}

export type TicketPageImage = z.infer<typeof ticketPageImageSchema> & { url: string | null; width: number | null; height: number | null };
export type TicketPageView<K extends TicketPageKey = TicketPageKey> = Omit<TicketPageContent<K>, "images"> & { images: Record<string, TicketPageImage> };

export function ticketPageMediaUrl(asset: VisitorPageMedia | undefined): string | null {
  return asset?.storage_bucket === "onzio-media" && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null;
}

/** Attach image addresses without validating, so the editor preview keeps working while a link is half typed. */
export function ticketPageView<K extends TicketPageKey>(content: TicketPageContent<K>, media: VisitorPageMedia[]): TicketPageView<K> {
  const assets = new Map(media.map(asset => [asset.id, asset]));
  return { ...content, images: Object.fromEntries(Object.entries(content.images).map(([slot, stored]) => {
    const asset = stored.assetId ? assets.get(stored.assetId) : undefined, url = ticketPageMediaUrl(asset);
    return [slot, { ...stored, url, width: url ? asset!.width : null, height: url ? asset!.height : null }];
  })) };
}

export function hydrateTicketPage<K extends TicketPageKey>(key: K, content: TicketPageContent<K> | null, media: VisitorPageMedia[]): TicketPageView<K> {
  return ticketPageView(ticketPageSchemas[key].parse(content ?? emptyTicketPageContent(key)) as TicketPageContent<K>, media);
}
