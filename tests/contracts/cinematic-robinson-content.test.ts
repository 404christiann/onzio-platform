import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ROBINSON_IMAGE_SLOTS, emptyRobinsonContent, hydrateRobinsonContent, robinsonContentSchema, robinsonSaveSchema,
  type RobinsonContent,
} from "@/lib/cinematic-robinson-content";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";

const reference = () => structuredClone(robinsonReferenceContent) as RobinsonContent;
const rejects = (change: (content: RobinsonContent) => void) => {
  const content = reference();
  change(content);
  return !robinsonContentSchema.safeParse(content).success;
};

describe("Robinson Stadium content rules", () => {
  it("accepts Christian's confirmed copy with both the 2001 story date and the 1999 dedication date", () => {
    const content = robinsonContentSchema.parse(reference());
    expect(content.story.paragraphs[1]).toMatch(/^In 2001, Pasadena City College named Robinson Stadium/);
    expect(content.info.note).toBe("Dedicated as Robinson Stadium in 1999");
    expect(content.info.rows.map(row => [row.label, row.available])).toEqual([
      ["On-Site Parking", true], ["Mobile Tickets", true], ["Food Allowed", true], ["Pets Allowed", false], ["Snack Bar", true], ["Wi-Fi", false],
    ]);
    expect(content.directions.blocks.find(block => block.id === "parking-lot-no-5")?.heading).toBe("Parking Lot No. 5");
  });

  it("rejects unknown fields, overlong text and malformed rows", () => {
    expect(rejects(content => Object.assign(content, { clubId: randomUUID() }))).toBe(true);
    expect(rejects(content => Object.assign(content.heading, { color: "red" }))).toBe(true);
    expect(rejects(content => { content.heading.title = "x".repeat(121); })).toBe(true);
    expect(rejects(content => { content.story.quote = "x".repeat(4001); })).toBe(true);
    expect(rejects(content => { (content.info.rows[0] as { available: unknown }).available = "Limited"; })).toBe(true);
    expect(rejects(content => { content.info.rows = Array.from({ length: 13 }, () => ({ label: "Row", available: true })); })).toBe(true);
    expect(rejects(content => { content.story.paragraphs = Array.from({ length: 9 }, () => "Paragraph"); })).toBe(true);
  });

  it("requires exactly three Food & Beverage steps", () => {
    expect(rejects(content => { content.food.steps = content.food.steps.slice(0, 2); })).toBe(true);
    expect(rejects(content => { content.food.steps = [...content.food.steps, { label: "Fourth" }]; })).toBe(true);
  });

  it("requires unique, URL-safe Directions block IDs", () => {
    expect(rejects(content => { content.directions.blocks[1].id = content.directions.blocks[0].id; })).toBe(true);
    expect(rejects(content => { content.directions.blocks[0].id = "Parking Lot"; })).toBe(true);
  });

  it("accepts only image identities and descriptions, never URLs", () => {
    expect(rejects(content => { (content.images.seating as { assetId: unknown }).assetId = "https://example.test/map.jpg"; })).toBe(true);
    expect(rejects(content => Object.assign(content.images.seating, { url: "https://example.test/map.jpg" }))).toBe(true);
    expect(rejects(content => { content.images.seating.assetId = randomUUID(); })).toBe(false);
    expect(Object.keys(reference().images)).toEqual([...ROBINSON_IMAGE_SLOTS]);
  });

  it("gives a club without a saved page a neutral Stadium heading and nothing else", () => {
    const empty = robinsonContentSchema.parse(emptyRobinsonContent());
    expect(empty.heading).toEqual({ visible: true, title: "Stadium", subtitle: "" });
    for (const section of ["seating", "story", "info", "match", "lockers", "food", "route", "directions"] as const) expect(empty[section].visible).toBe(false);
    expect(JSON.stringify(empty)).not.toMatch(/Robinson|Rose City|Pasadena|Chick-fil-A/);
  });

  it("hydrates only this club's published media into direct storage URLs", () => {
    const content = reference(), seating = randomUUID(), missing = randomUUID();
    content.images.seating.assetId = seating;
    content.images.bus.assetId = missing;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://media.example.test";
    const page = hydrateRobinsonContent(content, [{ id: seating, storage_bucket: "onzio-media", storage_path: "tenant/homepage/seating map.webp", width: 3000, height: 1843 }]);
    expect(page.images.seating).toMatchObject({ url: "https://media.example.test/storage/v1/object/public/onzio-media/tenant/homepage/seating%20map.webp", width: 3000, height: 1843 });
    expect(page.images.bus.url).toBeNull();
    expect(page.images.seating.url).not.toContain("/render/image/");
  });

  it("accepts a save request only with the shared operation fields", () => {
    const request = { operationId: randomUUID(), expectedRevision: "0", designRevision: "design-1", content: reference(), retiredMediaAssetIds: [] };
    expect(robinsonSaveSchema.safeParse(request).success).toBe(true);
    expect(robinsonSaveSchema.safeParse({ ...request, clubId: randomUUID() }).success).toBe(false);
  });
});
