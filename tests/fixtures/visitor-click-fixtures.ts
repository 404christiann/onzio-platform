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
