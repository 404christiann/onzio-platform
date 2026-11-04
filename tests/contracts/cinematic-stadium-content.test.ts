import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import copy from "@/assets/rose-city-stadium-2027/content.json";
import { emptyStadiumContent, fullStadiumCrop, hydrateStadiumContent, resetStadiumMapFraming, stadiumContentSchema, stadiumCropViewBox, stadiumDraftFingerprint, stadiumSaveSchema } from "@/lib/stadium-content";

afterEach(() => vi.unstubAllEnvs());
describe("Stadium content and map framing boundaries", () => {
  it("accepts the approved source content and preserves exact original card/map geometry", () => {
    const content = stadiumContentSchema.parse(copy);
    expect(content.sections.map(section => section.id)).toEqual(["directions", "parking", "line-187", "service-areas"]);
    expect(stadiumCropViewBox(content.phoneCardCrop, 2380, 1216)).toBe("96 54 652 1104");
    expect(stadiumCropViewBox(content.phoneMapCrop, 2380, 1216)).toBe("754 0 1626 1216");
  });
  it("keeps replacement images fully visible instead of copying original-only crops", () => {
    const content = stadiumContentSchema.parse(copy), replacement = resetStadiumMapFraming(content);
    expect(replacement.phoneMapLayout).toBe("full");
    expect(replacement.phoneCardCrop).toEqual(fullStadiumCrop());
    expect(replacement.phoneMapCrop).toEqual(fullStadiumCrop());
    expect(replacement.sections).toEqual(content.sections);
    expect(content.phoneMapLayout).toBe("split");
  });
  it.each([
    { x: -0.1, y: 0, width: 1, height: 1 }, { x: 0.8, y: 0, width: 0.3, height: 1 },
    { x: 0, y: 0.8, width: 1, height: 0.3 }, { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: Number.NaN },
  ])("rejects out-of-image or invalid crop %j", crop => {
    expect(stadiumContentSchema.safeParse({ ...emptyStadiumContent(), phoneCardCrop: crop }).success).toBe(false);
  });
  it("rejects duplicate section IDs and unexpected control/tenant/delivery fields", () => {
    const content = stadiumContentSchema.parse(copy);
    expect(stadiumContentSchema.safeParse({ ...content, sections: [content.sections[0], content.sections[0]] }).success).toBe(false);
    expect(stadiumContentSchema.safeParse({ ...content, purchaseUrl: "https://attacker.test" }).success).toBe(false);
    const request = { operationId: randomUUID(), expectedRevision: "0", designRevision: "design", content, retiredMediaAssetIds: [] };
    expect(stadiumSaveSchema.safeParse(request).success).toBe(true);
    expect(stadiumSaveSchema.safeParse({ ...request, club_id: randomUUID() }).success).toBe(false);
    expect(stadiumSaveSchema.safeParse({ ...request, content: { ...content, artwork: { ...content.artwork, map: { ...content.artwork.map, url: "https://attacker.test/map.png" } } } }).success).toBe(false);
    expect(stadiumContentSchema.safeParse({ ...content, sections: [{ ...content.sections[0], url: "https://attacker.test" }] }).success).toBe(false);
  });
  it("hydrates only snapshot media identities and published bucket URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const id = randomUUID(), content = emptyStadiumContent();
    content.artwork.map = { assetId: id, alt: "Transit map" };
    expect(hydrateStadiumContent(content, []).artwork.map.url).toBeNull();
    const media = [{ id, storage_bucket: "onzio-media", storage_path: "tenant/homepage/image name.png", width: 2380, height: 1216 }];
    const hydrated = hydrateStadiumContent(content, media);
    expect(hydrated.artwork.map.url).toBe("https://media.example.test/storage/v1/object/public/onzio-media/tenant/homepage/image%20name.png");
    expect(hydrated.artwork.map.width).toBe(2380);
    expect(hydrateStadiumContent(content, [{ ...media[0], storage_bucket: "private-staging" }]).artwork.map.url).toBeNull();
  });
  it("has tenant-neutral defaults and canonical recovery despite reordered database keys", () => {
    const content = emptyStadiumContent();
    expect(JSON.stringify(content)).not.toMatch(/Rose City|187|discount|Chick/);
    const reordered = Object.fromEntries(Object.entries(content).reverse()) as typeof content;
    expect(stadiumDraftFingerprint(reordered)).toBe(stadiumDraftFingerprint(content));
    expect(content.artwork.map.assetId).toBeNull();
  });
});
