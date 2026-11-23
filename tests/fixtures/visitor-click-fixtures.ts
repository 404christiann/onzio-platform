import type { NewsEditorArticle } from "@/lib/cinematic-news";
import type { NewsDraft } from "@/lib/cinematic-news-editor";
import type { NewsCardItem } from "@/components/admin/news/news-page";
import type { SponsorDraft } from "@/lib/sponsor-content";
import type { CinematicPartnersContent, PartnerLogoMedia } from "@/lib/cinematic-partners-content";
import type { CinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";
import type { InjuryAsset, InjuryPlayerRow } from "@/lib/cinematic-injury-report-query";
import type { InjuryMedia } from "@/lib/cinematic-injury-report-editor";
import { STADIUM_ARTWORK_SLOTS, emptyStadiumContent, type StadiumArtworkSlot, type StadiumContent } from "@/lib/stadium-content";
import { CHICK_FIL_A_ARTWORK_SLOTS, emptyChickFilAContent, type ChickFilAArtworkSlot, type ChickFilAContent } from "@/lib/chick-fil-a-content";
import { TICKET_ARTWORK_SLOTS, emptyTicketsContent, type TicketArtworkSlot, type TicketsContent } from "@/lib/tickets-content";
import { type KnowBeforeYouGoContent, type SeasonMembershipContent, knowBeforeYouGoItemIds, seasonMembershipItemIds } from "@/lib/cinematic-ticket-pages-content";

/**
 * UI-PREVIEW-CLICK-VISITOR-2: Foothill Transit, Chick-fil-A and Tickets drafts with every owner field filled, so every
 * declared click target has a node to land on. Same media shape and url scheme as robinson-click-fixture.
 */
type Media = { id: string; storage_bucket: string; storage_path: string; width: number; height: number };
const assetId = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const mediaFor = (folder: string, slots: readonly string[]): Media[] => slots.map((slot, index) => ({ id: assetId(index), storage_bucket: "onzio-media", storage_path: `${folder}/${slot}.webp`, width: 640, height: 360 }));
const urlFor = (folder: string, slot: string) => `https://media.test/storage/v1/object/public/onzio-media/${folder}/${slot}.webp`;
const imagesFor = <S extends string>(slots: readonly S[]) => Object.fromEntries(slots.map((slot, index) => [slot, { assetId: assetId(index), alt: `${slot} picture` }])) as Record<S, { assetId: string; alt: string }>;

export const FOOTHILL_FIXTURE_MEDIA = mediaFor("foothill", STADIUM_ARTWORK_SLOTS);
export const foothillFixtureUrl = (slot: StadiumArtworkSlot) => urlFor("foothill", slot);
export function foothillFixture(): StadiumContent {
  return {
    ...emptyStadiumContent(),
    title: "Foothill Transit", subtitle: "Ride the bus to the match",
    includesHeading: "Your ticket includes",
    benefits: [{ title: "Free bus ride", detail: "Show your ticket to the driver." }, { title: "Reserved seat", detail: "Section five." }, { title: "Scarf", detail: "One per fan." }],
    benefitsNote: "Terms apply.",
    sections: [
      { id: "by-bus", heading: "By Bus", body: "Take Line 187.", note: "Buses run late.", bullets: ["Stop at Colorado Blvd", "Stop at Sierra Bonita"], visible: true },
      { id: "no-heading", heading: "", body: "A block with no heading.", note: "", bullets: [], visible: true },
      { id: "hidden-block", heading: "Hidden block", body: "Not on the page.", note: "", bullets: ["Hidden bullet"], visible: false },
      { id: "parking", heading: "Parking", body: "Daily permits are two dollars.", note: "Lot 5 is on Bonnie Ave.", bullets: ["Bring cash"], visible: true },
    ],
    artwork: imagesFor(STADIUM_ARTWORK_SLOTS),
  };
}

export const CHICK_FIL_A_FIXTURE_MEDIA = mediaFor("chick-fil-a", CHICK_FIL_A_ARTWORK_SLOTS);
export const chickFilAFixtureUrl = (slot: ChickFilAArtworkSlot) => urlFor("chick-fil-a", slot);
export function chickFilAFixture(): ChickFilAContent {
  return {
    ...emptyChickFilAContent(),
    title: "Food & Beverage", subtitle: "Eat before the match",
    detailsHeading: "Meal pass details", detailsBody: "Show your pass at the drive-thru.",
    stepLabels: ["Drive-Thru", "Free Game Ticket", "Enjoy during Game"], stepNumbers: ["1", "2", "3"],
    artwork: imagesFor(CHICK_FIL_A_ARTWORK_SLOTS),
  };
}

export const TICKETS_FIXTURE_MEDIA = mediaFor("tickets", TICKET_ARTWORK_SLOTS);
export const ticketsFixtureUrl = (slot: TicketArtworkSlot) => urlFor("tickets", slot);
export function ticketsFixture(): TicketsContent {
  return {
    ...emptyTicketsContent(),
    title: "Tickets", subtitle: "Season and single match",
    perksHeading: "Season perks", perkLabels: ["Reserved seat", "Season card", "Raffle entry"],
    includesHeading: "Your ticket includes",
    benefits: [{ title: "Free bus ride", detail: "Show your ticket to the driver." }, { title: "Reserved seat", detail: "Section five." }, { title: "Scarf", detail: "One per fan." }],
    benefitsNote: "Terms apply.",
    transitHeading: "Ride the bus", transitSubtitle: "Save on gas",
    directionsHeading: "Directions", directionsBody: "Take Colorado Blvd to the stadium.",
    parkingHeading: "Parking", parkingBody: "Daily permits are two dollars.", parkingNote: "Lot 5 is on Bonnie Ave.",
    purchaseUrl: "https://tickets.test/buy", missingPurchaseLabel: "Ticket link coming soon", bannerHeightFraction: 1,
    artwork: imagesFor(TICKET_ARTWORK_SLOTS),
  };
}

/**
 * UI-PREVIEW-CLICK-VISITOR-3: Season Ticket Membership and Know Before You Go drafts with every owner field filled. Their
 * images are keyed by slot and by the stable id of each price row, benefit and tile, so a fixture lists those ids.
 */
const slotImages = (slots: readonly string[]) => Object.fromEntries(slots.map((slot, index) => [slot, { assetId: assetId(index), alt: `${slot} picture` }])) as Record<string, { assetId: string; alt: string }>;
export const ticketPageFixtureUrl = (folder: string, slot: string) => urlFor(folder, slot);

export function seasonFixture(): SeasonMembershipContent {
  const content: SeasonMembershipContent = {
    heading: { title: "Season Ticket Membership", subtitle: "Join the Rose City family" },
    intro: { visible: true, text: "Become a season ticket member.", highlights: ["Reserved seat", "Scarf"], includesHeading: "Membership includes", includes: ["Every home match", "A member card", "Raffle entries"] },
    pricing: {
      visible: true, sectionLabel: "Section", columns: ["Full season per match price*", "Single match price", "Full season savings"],
      rows: [{ id: "seat-general", name: "General Seating", prices: ["$12", "$15", "$3"] }, { id: "seat-reserved", name: "Reserved Seating", prices: ["$18", "$22", "$4"] }, { id: "seat-club", name: "Club Seating", prices: ["$30", "$36", "$6"] }],
      footnote: "Prices include fees.",
    },
    button: { visible: true, label: "Buy Season Membership", href: "https://tickets.test/season" },
    benefits: { visible: true, heading: "Member Benefits", items: [{ id: "benefit-seat", label: "Reserved seat" }, { id: "benefit-card", label: "Member card" }, { id: "benefit-raffle", label: "Raffle entry" }] },
    closing: { visible: true, heading: "Become a member today" },
    images: {},
  };
  content.images = slotImages(["ticket", ...seasonMembershipItemIds(content)]);
  return content;
}
export const seasonFixtureMedia = (content: SeasonMembershipContent) => mediaFor("season-membership", Object.keys(content.images));

export function kbygFixture(): KnowBeforeYouGoContent {
  const content: KnowBeforeYouGoContent = {
    heading: { title: "Know Before You Go", subtitle: "Match day made easy" },
    match: { visible: true, competition: "USL League Two", watchLabel: "Watch live on", watchHref: "https://youtube.test/live" },
    facts: { visible: true, tiles: [{ id: "tile-gates", label: "Gates open at 5pm" }, { id: "tile-bag", label: "Clear bags only" }, { id: "tile-park", label: "Park at Lot 5" }] },
    raffle: { visible: true, heading: "Halftime raffle", subheading: "Win a PlayStation 5", body: "Enter at the **fan table** before halftime." },
    donor: { visible: true, heading: "Raffle donor", name: "Corner Bakery", body: "Thanks to our donor.", buttonLabel: "Visit the donor", buttonHref: "https://donor.test" },
    images: {},
  };
  content.images = slotImages(["youtube", "raffle", "donor", ...knowBeforeYouGoItemIds(content)]);
  return content;
}
export const kbygFixtureMedia = (content: KnowBeforeYouGoContent) => mediaFor("know-before-you-go", Object.keys(content.images));

/**
 * UI-PREVIEW-CLICK-LIST-1: Partners and Injury Report drafts with every owner field filled. Partners and injuries are keyed by
 * their row uuid; the fixture has three of each so a reorder moves the ids with the rows.
 */

export const PARTNER_IDS = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000003"] as const;
export const PARTNER_LOGO_IDS = ["bbbbbbbb-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000003"] as const;
export const partnersFixtureLogos = (): PartnerLogoMedia[] => PARTNER_LOGO_IDS.map((id, index) => ({ id, storage_path: `partners/logo-${index}.webp`, width: 320, height: 160, label: `Logo ${index + 1}` }));
export const partnerLogoUrl = (id: string) => `https://media.test/storage/v1/object/public/onzio-media/partners/logo-${id === PARTNER_LOGO_IDS[0] ? 0 : 1}.webp`;
export const partnersFixtureLogoUrls = () => Object.fromEntries(PARTNER_LOGO_IDS.map(id => [id, partnerLogoUrl(id)]));
/** Partner 1 and 3 have a logo; partner 2 has none, so its card shows the name as text. */
export function partnersFixture(): CinematicPartnersContent {
  return {
    pages: {
      partners: { title: "Club Partners", subtitle: "Fueled by our partners", intro: "Meet the people behind the club.", ctaPrompt: "Want to partner with us?", ctaLabel: "Partnerships" },
      opportunities: { title: "Partnership Opportunities", subtitle: "Grow with Rose City", intro: "Join us for the season.", ctaPrompt: "Ready to talk?", ctaLabel: "Email us", ctaHref: "https://partners.test/contact" },
    },
    partners: [
      { id: PARTNER_IDS[0], name: "Alpha Bank", role: "Official bank", logoAssetId: PARTNER_LOGO_IDS[0], tone: "original" },
      { id: PARTNER_IDS[1], name: "Beta Brewing", role: "Official beer", logoAssetId: null, tone: "grey" },
      { id: PARTNER_IDS[2], name: "Gamma Gear", role: "Official kit", logoAssetId: PARTNER_LOGO_IDS[1], tone: "black" },
    ],
  };
}

export const ENTRY_IDS = ["cccccccc-0000-4000-8000-000000000001", "cccccccc-0000-4000-8000-000000000002", "cccccccc-0000-4000-8000-000000000003"] as const;
export const INJURY_PLAYER_IDS = ["dddddddd-0000-4000-8000-000000000001", "dddddddd-0000-4000-8000-000000000002", "dddddddd-0000-4000-8000-000000000003"] as const;
export const INJURY_LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001", INJURY_BAND_ID = "eeeeeeee-0000-4000-8000-000000000002";
export const injuryMediaFixture = (): InjuryMedia[] => [
  { id: INJURY_LOGO_ID, storage_path: "injury/logo.webp", width: 320, height: 120, kind: "graphic" },
  { id: INJURY_BAND_ID, storage_path: "injury/band.webp", width: 1600, height: 400, kind: "photograph" },
];
export const injuryUrl = (name: "logo" | "band") => `https://media.test/storage/v1/object/public/onzio-media/injury/${name}.webp`;
export const injuryRosterFixture = (): { players: InjuryPlayerRow[]; assets: InjuryAsset[] } => ({
  players: INJURY_PLAYER_IDS.map((id, index) => ({ id, name: ["Pat Quinn", "Sam Reyes", "Lee Moore"][index], number: 7 + index, position: ["Forward", "Midfielder", "Defender"][index], photo_url: `https://media.test/players/${index}.jpg`, photo_asset_id: null, active: true })),
  assets: [],
});
export function injuryFixture(): CinematicInjuryReportContent {
  return {
    page: { presenterName: "MVMNT CULTR", rehabHeading: "Rehab with MVMNT CULTR", quote: "Recovery is a team sport.", quoteAttribution: "Head physio", videoUrl: "https://www.youtube.com/embed/abc123def45?rel=0", bandAlt: "Players in rehab" },
    presenterLogoAssetId: INJURY_LOGO_ID,
    bandAssetId: INJURY_BAND_ID,
    entries: [
      { id: ENTRY_IDS[0], playerId: INJURY_PLAYER_IDS[0], injury: "Hamstring strain", timeline: "2-3 weeks", note: "Light training only." },
      { id: ENTRY_IDS[1], playerId: INJURY_PLAYER_IDS[1], injury: "Ankle sprain", timeline: "Day-to-day", note: "" },
      { id: ENTRY_IDS[2], playerId: INJURY_PLAYER_IDS[2], injury: "Knee bruise", timeline: "1 week", note: "Back for the derby." },
    ],
  };
}

/**
 * UI-PREVIEW-CLICK-LIST-2: News articles (three saved, one removed, one new) with every field filled, and Rose City sponsors
 * (a saved one, an unsaved upload, one with a website). Same media url scheme as the fixtures above.
 */
export const NEWS_IDS = ["ffffffff-0000-4000-8000-000000000001", "ffffffff-0000-4000-8000-000000000002", "ffffffff-0000-4000-8000-000000000003"] as const;
export const NEWS_NEW_KEY = "new-1";
export const newsCoverUrl = (name: string) => `https://media.test/storage/v1/object/public/onzio-media/news/${name}.webp`;
const NEWS_COVER_ASSET = "99999999-0000-4000-8000-000000000001";
export function newsDraftFixture(index: number): NewsDraft {
  return {
    category: (["news", "community", "partner"] as const)[index % 3], cardHeading: ["Foothill Transit", "Fan Night", "Derby Day"][index % 3],
    title: ["New bus line to Robinson", "Fan night is back", "The derby preview"][index % 3], subtitle: `Subtitle ${index}`, coverAlt: `Cover ${index}`,
    body: `First paragraph ${index}\nSecond paragraph ${index}`, actionLabel: "Partner with us", actionHref: "/community/partnership",
    publishedLocal: `2026-11-1${index}T12:00`, coverAssetId: index === 2 ? null : NEWS_COVER_ASSET, coverUrl: index === 2 ? "" : newsCoverUrl(`cover-${index}`),
  };
}
function newsArticleFixture(index: number, removed = false): NewsEditorArticle {
  const { body, coverAssetId, coverUrl, publishedLocal, ...content } = newsDraftFixture(index);
  void coverUrl; void publishedLocal; void coverAssetId;
  return {
    id: NEWS_IDS[index], slug: `article-${index}`, revision: "r1", publishedAt: `2026-11-1${index}T20:00:00.000Z`, removedAt: removed ? "2026-11-20T00:00:00.000Z" : null,
    cover: index === 2 ? null : { assetId: NEWS_COVER_ASSET, storage_bucket: "onzio-media", storage_path: `news/cover-${index}.webp`, width: 2287, height: 1237 } as NewsEditorArticle["cover"],
    content: { ...content, paragraphs: body.split("\n") },
  };
}
/** Cards as the page lists them: newest first, a removed one (no preview button) and an unsaved new one with a cover typed in. */
export function newsCardsFixture(): NewsCardItem[] {
  const saved = [0, 1, 2].map(index => {
    const article = newsArticleFixture(index, index === 1), draft = newsDraftFixture(index);
    return { key: article.id, article, draft, removed: index === 1, changed: index === 0, isNew: false, publishedAt: article.publishedAt, title: draft.title, slug: article.slug, coverUrl: draft.coverUrl };
  });
  const fresh = newsDraftFixture(0);
  return [...saved, { key: NEWS_NEW_KEY, article: null, draft: { ...fresh, title: "A brand new article" }, removed: false, changed: true, isNew: true, publishedAt: "2026-11-21T20:00:00.000Z", title: "A brand new article", slug: null, coverUrl: fresh.coverUrl }];
}
export const SPONSOR_KEYS = ["11111111-0000-4000-8000-000000000001", "11111111-0000-4000-8000-000000000002", "upload-3"] as const;
export const sponsorLogoUrl = (index: number) => `https://media.test/storage/v1/object/public/onzio-media/sponsors/logo-${index}.webp`;
export const sponsorDraftsFixture = (): SponsorDraft[] => SPONSOR_KEYS.map((key, index) => ({
  key, id: index === 2 ? null : key, name: ["Alpha Bank", "Beta Brewing", "Gamma Gear"][index], logo_url: sponsorLogoUrl(index),
  website: index === 1 ? "betabrewing.test" : "", homepage: true, footer: false,
}));
