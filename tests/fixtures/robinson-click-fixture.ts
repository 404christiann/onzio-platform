import { ROBINSON_IMAGE_SLOTS, emptyRobinsonContent, type RobinsonContent, type RobinsonImageSlot, type RobinsonSnapshot } from "@/lib/cinematic-robinson-content";

/** A Robinson draft with every owner field filled, so every declared click target has a node to land on. */
const assetId = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
export const ROBINSON_FIXTURE_MEDIA: RobinsonSnapshot["media"] = ROBINSON_IMAGE_SLOTS.map((slot, index) => ({
  id: assetId(index), storage_bucket: "onzio-media", storage_path: `robinson/${slot}.webp`, width: 640, height: 360,
}));
export const robinsonFixtureUrl = (slot: RobinsonImageSlot) => `https://media.test/storage/v1/object/public/onzio-media/robinson/${slot}.webp`;

export function robinsonFixture(): RobinsonContent {
  const content = emptyRobinsonContent();
  const image = (slot: RobinsonImageSlot) => ({ assetId: assetId(ROBINSON_IMAGE_SLOTS.indexOf(slot)), alt: `${slot} picture` });
  return {
    ...content,
    heading: { visible: true, title: "Robinson Stadium", subtitle: "Pasadena, California" },
    seating: { visible: true, caption: "Home Field Advantage", expandLabel: "View map full size" },
    story: { visible: true, paragraphs: ["First story paragraph.", "Second story paragraph.", "Third story paragraph."], quote: "We cannot wait for kickoff", attribution: "The GM" },
    info: { visible: true, heading: "Stadium Info", note: "Dedicated in 1999", rows: [
      { label: "On-Site Parking", available: true }, { label: "Pets Allowed", available: false }, { label: "Wi-Fi", available: false }, { label: "Snack Bar", available: true },
    ] },
    match: { visible: true },
    lockers: { visible: true },
    food: { visible: true, heading: "Food and Beverage", body: "Drive thru, order, enjoy.", steps: [{ label: "Drive-Thru" }, { label: "Free Game Ticket" }, { label: "Enjoy during Game" }] },
    route: { visible: true, heading: "Road to the Match", subheading: "Save on gas" },
    directions: { visible: true, blocks: [
      { id: "by-transit", heading: "By Foothill Transit", paragraphs: ["Take Line 187.", "Walk five minutes."], note: "Buses run late.", bullets: ["Stop at Colorado Blvd", "Stop at Sierra Bonita"], closing: "Use the Trip Planner." },
      { id: "no-heading", heading: "", paragraphs: ["A block with no heading."], note: "", bullets: [], closing: "Plan your trip online." },
      { id: "parking", heading: "Parking Lot No. 5", paragraphs: ["Daily permits are two dollars."], note: "Lot 5 is on Bonnie Ave.", bullets: [], closing: "" },
      { id: "service-areas", heading: "Service Areas", paragraphs: [], note: "", bullets: ["San Gabriel Valley", "Downtown Los Angeles", "Neighboring counties"], closing: "" },
    ] },
    images: Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => [slot, image(slot)])) as RobinsonContent["images"],
  };
}
