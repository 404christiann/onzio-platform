import { z } from "zod";
import { linkDestinationSchema } from "@/lib/link-destination";
export const TICKET_ARTWORK_SLOTS = ["banner", "seat", "card", "raffle", "bus", "map", "partner"] as const;
export type TicketArtworkSlot = typeof TICKET_ARTWORK_SLOTS[number];
const heading = z.string().max(120);
const body = z.string().max(4000);
const art = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
export const ticketArtworkSchema = z.object(Object.fromEntries(TICKET_ARTWORK_SLOTS.map(slot => [slot, art])) as Record<TicketArtworkSlot, typeof art>).strict();
/**
 * RC-ADMIN-07: optional show/hide flags, one per public section of the Tickets page. Absent means shown; the page hides a
 * section only on an explicit false. Mirrors onzio_private.check_tickets_content. Never injected by load or save.
 */
export const TICKET_VISIBILITY_KEYS = ["perksVisible", "includesVisible", "transitVisible", "directionsVisible", "purchaseVisible"] as const;
export type TicketVisibilityKey = typeof TICKET_VISIBILITY_KEYS[number];
export const isTicketSectionShown = (content: Partial<Record<TicketVisibilityKey, boolean>>, key: TicketVisibilityKey): boolean => content[key] !== false;
export const ticketsContentSchema = z.object({
    title: heading, subtitle: heading, perksHeading: heading,
    perkLabels: z.tuple([heading, heading, heading]),
    includesHeading: heading, benefits: z.array(z.object({ title: heading, detail: body }).strict()).max(10),
    benefitsNote: body, transitHeading: heading, transitSubtitle: heading,
    directionsHeading: heading, directionsBody: body, parkingHeading: heading, parkingBody: body, parkingNote: body,
    purchaseUrl: linkDestinationSchema({ max: 2000 }),
    missingPurchaseLabel: heading, bannerHeightFraction: z.number().min(0.5).max(1), artwork: ticketArtworkSchema,
    perksVisible: z.boolean().optional(), includesVisible: z.boolean().optional(), transitVisible: z.boolean().optional(),
    directionsVisible: z.boolean().optional(), purchaseVisible: z.boolean().optional(),
}).strict();
export const ticketsDraftSchema = ticketsContentSchema.extend({ purchaseUrl: z.string().max(2000) });
export function ticketsDraftFingerprint(content: TicketsContent): string { return JSON.stringify(ticketsDraftSchema.parse(content)); }
export type TicketsContent = z.infer<typeof ticketsContentSchema>;
export type TicketsArtwork = {
    assetId: string | null;
    alt: string;
    url: string | null;
    width: number | null;
    height: number | null;
};
export type TicketsPageContent = Omit<TicketsContent, "artwork"> & {
    artwork: Record<TicketArtworkSlot, TicketsArtwork>;
};
export const ticketsSaveSchema = z.object({
    operationId: z.uuid(), expectedRevision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100),
    content: ticketsContentSchema, retiredMediaAssetIds: z.array(z.uuid()).max(100).default([]),
}).strict();
export type TicketsSaveRequest = z.infer<typeof ticketsSaveSchema>;
export type TicketsSnapshot = {
    revision: string;
    designRevision: string;
    content: TicketsContent | null;
    media: {
        id: string;
        storage_bucket: string;
        storage_path: string;
        width: number;
        height: number;
    }[];
    retiredMediaAssetIds?: string[];
    cleanupPending?: boolean;
    operation?: {
        status: "not-committed";
    } | {
        status: "committed";
        receipt: TicketsSnapshot;
    };
};
export function emptyTicketsContent(): TicketsContent {
    return { title: "Tickets", subtitle: "", perksHeading: "Perks", perkLabels: ["", "", ""], includesHeading: "Ticket includes",
        benefits: [], benefitsNote: "", transitHeading: "", transitSubtitle: "", directionsHeading: "", directionsBody: "",
        parkingHeading: "", parkingBody: "", parkingNote: "", purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon", bannerHeightFraction: 1,
        artwork: Object.fromEntries(TICKET_ARTWORK_SLOTS.map(slot => [slot, { assetId: null, alt: "" }])) as TicketsContent["artwork"] };
}
export function hydrateTicketsContent(content: TicketsContent | null, media: TicketsSnapshot["media"], validate = true): TicketsPageContent {
    const parsed = validate ? ticketsContentSchema.parse(content ?? emptyTicketsContent()) : content ?? emptyTicketsContent();
    const assets = new Map(media.map(asset => [asset.id, asset]));
    return { ...parsed, artwork: Object.fromEntries(TICKET_ARTWORK_SLOTS.map(slot => {
            const art = parsed.artwork[slot], asset = art.assetId ? assets.get(art.assetId) : undefined;
            return [slot, { ...art, url: asset?.storage_bucket === "onzio-media" && process.env.NEXT_PUBLIC_SUPABASE_URL
                        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null,
                    width: asset?.width ?? null, height: asset?.height ?? null }];
        })) as TicketsPageContent["artwork"] };
}
