import { STADIUM_ARTWORK_SLOTS, emptyStadiumContent, type StadiumArtworkSlot, type StadiumContent } from "@/lib/stadium-content";
import { CHICK_FIL_A_ARTWORK_SLOTS, emptyChickFilAContent, type ChickFilAArtworkSlot, type ChickFilAContent } from "@/lib/chick-fil-a-content";
import { TICKET_ARTWORK_SLOTS, emptyTicketsContent, type TicketArtworkSlot, type TicketsContent } from "@/lib/tickets-content";

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
