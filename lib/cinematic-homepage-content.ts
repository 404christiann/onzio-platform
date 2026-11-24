import { z } from "zod";
import type { supabase } from "@/lib/supabase";


export const CINEMATIC_NAV_ITEMS = [
  { id: "home", label: "Home", href: "/" },
  { id: "club", label: "Club", children: [
    { id: "about", label: "About the club", href: "/club/about" },
    { id: "roster", label: "Roster", href: "/roster" },
    { id: "club-crest", label: "Club crest", href: "/club/logo" },
    { id: "partners", label: "Club partners", href: "/sponsors" },
    { id: "tryouts", label: "Tryouts", href: "/tryouts" },
  ] },
  { id: "shop", label: "Shop", href: "/shop" },
  { id: "stadium-group", label: "Stadium", children: [
    { id: "stadium", label: "Stadium", href: "/stadium" },
    { id: "stadium-parking", label: "Stadium parking", href: "/stadium#parking-lot-no-5" },
    { id: "stadium-guidelines", label: "Stadium guidelines", href: "/stadium/guidelines" },
    { id: "chick-fil-a", label: "Chick-fil-A", href: "/stadium/chick-fil-a" },
    { id: "know-before-you", label: "Know before you", href: "/tickets/know-before-you-go" },
    { id: "fan-code", label: "Fan code of conduct", href: "/stadium/fan-code" },
    { id: "foothill-transit", label: "Foothill Transit", href: "/stadium/foothill-transit" },
    { id: "media-credentials", label: "Media credentials", href: "/stadium/media-credentials" },
  ] },
  // RC2027-TICKET-PAGES: Sam's Season Ticket Membership and Know Before You Go designs both sit under Tickets.
  { id: "tickets", label: "Tickets", children: [
    { id: "season-membership", label: "Season ticket membership", href: "/tickets/season-membership" },
    { id: "tickets-page", label: "Single match tickets", href: "/tickets" },
    { id: "know-before-you", label: "Know before you go", href: "/tickets/know-before-you-go" },
  ] },
  { id: "schedule", label: "Schedule", href: "/schedule" },
  { id: "news", label: "News", children: [
    { id: "injury-report", label: "Injury report", href: "/news/injury-report" },
    { id: "news-page", label: "News", href: "/news" },
  ] },
  { id: "community", label: "Community", children: [
    { id: "partnership", label: "Partnership opportunities", href: "/community/partnership" },
    { id: "national-anthem", label: "National anthem request", href: "/community/national-anthem" },
    { id: "contact", label: "Contact us", href: "/contact" },
  ] },
] satisfies { id: string; label: string; href?: string; children?: { id: string; label: string; href: string }[] }[];
export const CINEMATIC_NAV_LABEL_IDS = CINEMATIC_NAV_ITEMS.flatMap(item => [item.id, ...("children" in item ? item.children?.map(child => child.id) ?? [] : [])]);

const copy = z.string().max(1200);
const heading = z.string().max(120);
export function isSafeCinematicDestination(value: string): boolean {
  if (!value || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.length > 0;
  } catch {
    return false;
  }
}
const externalDestination = z.string().max(2000).refine(value => value === "" || isSafeCinematicDestination(value), "Enter a valid HTTPS URL.");
const artworkInput = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
const artwork = artworkInput.extend({ url: z.string().nullable(), width: z.number().int().positive().nullable().optional(), height: z.number().int().positive().nullable().optional(), upload: z.enum(["queued", "uploading", "ready", "failed"]).optional(), localFileKey: z.string().optional(), error: z.string().optional() });
/**
 * Optional show/hide for the raffle photo, next home match and ticket prices. Absent or true shows the section and only an
 * explicit false hides it (the rule lib/tickets-content.ts applies to its sections). It is never written as true: the saved
 * row's database check accepts the key only after the migration that adds it, so a save that hides nothing stays unchanged.
 */
const optionalVisibility = { visible: z.boolean().optional() };
export const cinematicHomepageSaveSchema = z.object({
  sponsors: z.object({ heading }).strict(),
  raffle: artworkInput.extend(optionalVisibility),
  ticket: artworkInput.extend({ visible: z.boolean() }),
  // Optional so saves and rows from before the footer logo existed still parse.
  footerLogo: artworkInput.default({ assetId: null, alt: "" }),
  /**
   * The header sponsor logo, owner-editable. Key absent means leave the header logo as it is. Present sets it, and assetId null
   * clears it. It lives in presentation (header_partner_media_asset_id) in stored and loaded content, never in the content JSON.
   */
  headerPartner: artworkInput.optional(),
  match: z.object({ heading, buttonLabel: z.string().max(60), buttonHref: z.string().max(2000).regex(/^\/(?!\/)(?:[-A-Za-z0-9_/?#=&%.]*)$/), emptyMessage: copy, ...optionalVisibility }).strict(),
  prices: z.object({ heading, rows: z.array(z.object({ id: z.string().min(1).max(60), label: heading, price: z.string().max(60), description: copy, note: copy, accent: z.enum(["none", "aqua", "lime"]) }).strict()).max(10), footnote: copy, ...optionalVisibility }).strict().refine(value => new Set(value.rows.map(row => row.id)).size === value.rows.length, "Price row IDs must be unique."),
  championship: z.object({ league: heading, year: z.string().max(20), title: heading, body: copy, trophy: artworkInput }).strict(),
  navigation: z.object({
    labels: z.record(z.string(), z.string().trim().min(1).max(60)).refine(value => Object.keys(value).every(id => CINEMATIC_NAV_LABEL_IDS.includes(id)), "Unknown navigation label."),
    destinations: z.object({ tryouts: externalDestination, mediaCredentials: externalDestination, nationalAnthem: externalDestination.default("") }).strict().default({ tryouts: "", mediaCredentials: "", nationalAnthem: "" }),
  }).strict(),
}).strict();
export const cinematicPresentationSchema = z.object({
  headerPartner: artwork, heroPoster: artwork, seatsBackground: artwork, episodePoster: artwork,
  heroVideoGuid: z.string(), heroVideoLibraryId: z.string(),
  sponsorTreatments: z.record(z.uuid(), z.enum(["invert", "dark-lettering"])),
}).strict();
export const cinematicHomepageContentSchema = cinematicHomepageSaveSchema.omit({ headerPartner: true }).extend({
  raffle: artwork.extend(optionalVisibility), ticket: artwork.extend({ visible: z.boolean() }),
  footerLogo: artwork.default({ assetId: null, url: null, alt: "" }),
  championship: cinematicHomepageSaveSchema.shape.championship.extend({ trophy: artwork }),
  presentation: cinematicPresentationSchema,
});
export type CinematicArtwork = z.infer<typeof artwork>;
export type CinematicHomepageContent = z.infer<typeof cinematicHomepageContentSchema>;
export type CinematicHomepageSaveContent = z.infer<typeof cinematicHomepageSaveSchema>;
export type CinematicArtworkSlot = "raffle" | "ticket" | "trophy" | "footerLogo" | "headerPartner";
export const CINEMATIC_ARTWORK_SLOTS: readonly CinematicArtworkSlot[] = ["raffle", "ticket", "trophy", "footerLogo", "headerPartner"];

/** True unless the owner hid the section: only an explicit false hides it, and a missing key shows it. */
export function isHomepageSectionShown(part: { visible?: boolean }): boolean {
  return part.visible !== false;
}
/**
 * What visitors are sent: a hidden raffle photo, next home match or ticket prices section keeps only its switch, so its
 * words and image never reach the public page. Editors and previews use the full content.
 */
export function withoutHiddenHomepageSections(content: CinematicHomepageContent): CinematicHomepageContent {
  const next = { ...content };
  if (!isHomepageSectionShown(content.raffle)) next.raffle = { assetId: null, url: null, alt: "", visible: false };
  if (!isHomepageSectionShown(content.match)) next.match = { ...content.match, heading: "", buttonLabel: "", emptyMessage: "", visible: false };
  if (!isHomepageSectionShown(content.prices)) next.prices = { heading: "", rows: [], footnote: "", visible: false };
  return next;
}
/** The save and storage form of a visibility flag: written as false when hidden, and left out when shown. */
const hiddenFlag = (part: { visible?: boolean }) => part.visible === false ? { visible: false as const } : {};

/** Tenant-neutral until the operator imports the club's approved content. */
export function defaultCinematicHomepageContent(): CinematicHomepageContent {
  const empty = (): CinematicArtwork => ({ assetId: null, url: null, alt: "" });
  return {
    sponsors: { heading: "Powered by our partners" },
    raffle: empty(), ticket: { ...empty(), visible: true }, footerLogo: empty(),
    match: { heading: "Next home match", buttonLabel: "Buy tickets", buttonHref: "/tickets", emptyMessage: "The next home match will be announced soon." },
    prices: { heading: "Ticket prices", rows: [], footnote: "" },
    championship: { league: "", year: "", title: "", body: "", trophy: empty() },
    navigation: { labels: {}, destinations: { tryouts: "", mediaCredentials: "", nationalAnthem: "" } },
    presentation: { headerPartner: empty(), heroPoster: empty(), seatsBackground: empty(), episodePoster: empty(), heroVideoGuid: "", heroVideoLibraryId: "", sponsorTreatments: {} },
  };
}
export function resolveCinematicNavLabel(content: CinematicHomepageContent, id: string, fallbackLabel: string): string {
  return content.navigation.labels[id] ?? fallbackLabel;
}
export function cinematicArtwork(content: CinematicHomepageContent, slot: CinematicArtworkSlot): CinematicArtwork {
  if (slot === "trophy") return content.championship.trophy;
  if (slot === "headerPartner") return content.presentation.headerPartner;
  return content[slot];
}
/**
 * The change a newly chosen file makes to a slot. A new header sponsor logo also starts with an empty description: the old
 * one ("Foothill Transit") would otherwise keep the site showing the Foothill Transit mark, tied to that page, instead of it.
 */
export function queuedArtwork(slot: CinematicArtworkSlot, localFileKey: string): Partial<CinematicArtwork> {
  return { upload: "queued", localFileKey, ...(slot === "headerPartner" ? { alt: "" } : {}) };
}
export function cinematicHomepageEditableContent(content: CinematicHomepageContent): CinematicHomepageSaveContent {
  const media = ({ assetId, alt }: CinematicArtwork) => ({ assetId, alt });
  const { visible: matchVisible, ...match } = content.match;
  const { visible: pricesVisible, ...prices } = content.prices;
  return {
    sponsors: content.sponsors,
    raffle: { ...media(content.raffle), ...hiddenFlag(content.raffle) }, ticket: { ...media(content.ticket), visible: content.ticket.visible },
    footerLogo: media(content.footerLogo ?? { assetId: null, url: null, alt: "" }),
    // Always listed so the editor's change check sees a header edit. The save payload drops it unless it changed.
    headerPartner: media(content.presentation.headerPartner),
    match: { ...match, ...hiddenFlag({ visible: matchVisible }) }, prices: { ...prices, ...hiddenFlag({ visible: pricesVisible }) },
    championship: { ...content.championship, trophy: media(content.championship.trophy) },
    navigation: content.navigation,
  };
}
/**
 * The payload for one save. `headerPartner` is left out unless a baseline is given and this draft's header logo (asset or
 * description) differs from it, so a save that never touches the header leaves it alone on the server.
 */
export function cinematicHomepageSaveContent(content: CinematicHomepageContent, baseline?: CinematicHomepageContent): CinematicHomepageSaveContent {
  const { headerPartner, ...rest } = cinematicHomepageSaveSchema.parse(cinematicHomepageEditableContent(content));
  const before = baseline?.presentation.headerPartner;
  const changed = !!before && !!headerPartner && (before.assetId !== headerPartner.assetId || before.alt !== headerPartner.alt);
  return changed ? { ...rest, headerPartner } : rest;
}

export const CINEMATIC_MEDIA_COLUMNS = {
  raffle: "raffle_media_asset_id", ticket: "ticket_media_asset_id", trophy: "trophy_media_asset_id", footerLogo: "footer_logo_media_asset_id",
  headerPartner: "header_partner_media_asset_id", heroPoster: "hero_poster_media_asset_id",
  seatsBackground: "seats_background_media_asset_id", episodePoster: "episode_poster_media_asset_id",
} as const;

/** FK columns own media identity; JSON stores copy and descriptions only. */
export function cinematicHomepageStorageRecord(content: CinematicHomepageContent) {
  const editable = cinematicHomepageSaveContent(content);
  return {
    // No baseline is passed, so editable has no headerPartner: the header logo is stored only in its column and artworkAlt.
    content: { ...editable, raffle: { alt: editable.raffle.alt, ...hiddenFlag(editable.raffle) }, ticket: { alt: editable.ticket.alt, visible: editable.ticket.visible }, footerLogo: { alt: editable.footerLogo.alt }, championship: { ...editable.championship, trophy: { alt: editable.championship.trophy.alt } } },
    raffle_media_asset_id: content.raffle.assetId, ticket_media_asset_id: content.ticket.assetId, trophy_media_asset_id: content.championship.trophy.assetId,
    footer_logo_media_asset_id: content.footerLogo.assetId,
    header_partner_media_asset_id: content.presentation.headerPartner.assetId, hero_poster_media_asset_id: content.presentation.heroPoster.assetId,
    seats_background_media_asset_id: content.presentation.seatsBackground.assetId, episode_poster_media_asset_id: content.presentation.episodePoster.assetId,
    presentation_config: {
      heroVideoGuid: content.presentation.heroVideoGuid, heroVideoLibraryId: content.presentation.heroVideoLibraryId,
      sponsorTreatments: content.presentation.sponsorTreatments,
      artworkAlt: Object.fromEntries(["headerPartner", "heroPoster", "seatsBackground", "episodePoster"].map(key => [key, content.presentation[key as "headerPartner"].alt])),
    },
  };
}

export async function fetchCinematicHomepageContent(clubId: string, client?: typeof supabase): Promise<CinematicHomepageContent> {
  const queryClient = client ?? (await import("@/lib/supabase")).supabase;
  const { data, error } = await queryClient.from("homepage_revamp_content").select("*").eq("club_id", clubId).maybeSingle();
  if (error) throw new Error(`fetchCinematicHomepageContent: ${error.message}`);
  if (!data) return defaultCinematicHomepageContent();
  const row = data as unknown as Record<string, unknown>;
  const stored = row.content as CinematicHomepageSaveContent;
  const config = row.presentation_config as { heroVideoGuid?: string; heroVideoLibraryId?: string; sponsorTreatments?: Record<string, "invert" | "dark-lettering">; artworkAlt?: Record<string,string> };
  const ids = Object.values(CINEMATIC_MEDIA_COLUMNS).map(column => row[column]).filter((id): id is string => typeof id === "string");
  const assets = ids.length ? await queryClient.from("media_assets").select("id,storage_bucket,storage_path,width,height").eq("club_id", clubId).eq("status", "published").is("deleted_at", null).in("id", ids) : { data: [], error: null };
  if (assets.error) throw new Error(`fetchCinematicHomepageContent media: ${assets.error.message}`);
  const byId = new Map((assets.data ?? []).map(asset => [asset.id, asset]));
  const resolve = (key: keyof typeof CINEMATIC_MEDIA_COLUMNS, alt: string): CinematicArtwork => {
    const id = row[CINEMATIC_MEDIA_COLUMNS[key]];
    const asset = typeof id === "string" ? byId.get(id) : null;
    return { assetId: typeof id === "string" ? id : null, url: asset && asset.storage_bucket === "onzio-media" && process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null, width: asset?.width ?? null, height: asset?.height ?? null, alt };
  };
  return cinematicHomepageContentSchema.parse({
    ...stored, raffle: { ...resolve("raffle", stored.raffle.alt), ...hiddenFlag(stored.raffle) }, ticket: { ...resolve("ticket", stored.ticket.alt), visible: stored.ticket.visible },
    footerLogo: resolve("footerLogo", stored.footerLogo?.alt ?? ""),
    championship: { ...stored.championship, trophy: resolve("trophy", stored.championship.trophy.alt) },
    presentation: {
      ...Object.fromEntries(["headerPartner", "heroPoster", "seatsBackground", "episodePoster"].map(key => [key, resolve(key as keyof typeof CINEMATIC_MEDIA_COLUMNS, config.artworkAlt?.[key] ?? "")])),
      heroVideoGuid: config.heroVideoGuid ?? "", heroVideoLibraryId: config.heroVideoLibraryId ?? "", sponsorTreatments: config.sponsorTreatments ?? {},
    },
  });
}
