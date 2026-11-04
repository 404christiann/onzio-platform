import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { CHICK_FIL_A_ARTWORK_SLOTS, CHICK_FIL_A_MEDIA_COLUMNS, chickFilAContentSchema, chickFilADraftFingerprint, chickFilARecoverySchema, chickFilASaveSchema, emptyChickFilAContent, hydrateChickFilAContent } from "@/lib/chick-fil-a-content";
import { fetchChickFilAContent } from "@/lib/chick-fil-a-query";
import type { supabase } from "@/lib/supabase";

describe("Chick-fil-A authored content boundaries", () => {
  it("saves IDs and editable descriptions while rejecting injected delivery URLs, club IDs and duplicate purchase ownership", () => {
    const content = emptyChickFilAContent(), request = { operationId: randomUUID(), expectedRevision: "0", designRevision: "cinematic@2", content, retiredMediaAssetIds: [] };
    expect(chickFilASaveSchema.safeParse(request).success).toBe(true);
    expect(chickFilASaveSchema.safeParse({ ...request, clubId: randomUUID() }).success).toBe(false);
    expect(chickFilAContentSchema.safeParse({ ...content, purchaseUrl: "https://checkout.test" }).success).toBe(false);
    expect(chickFilAContentSchema.safeParse({ ...content, artwork: { ...content.artwork, map: { assetId: null, alt: "Map", url: "https://attacker.test/map" } } }).success).toBe(false);
    expect(chickFilAContentSchema.safeParse({ ...content, stepLabels: ["one", "two"] }).success).toBe(false);
    expect(JSON.stringify(content)).not.toContain("Rose City");
  });
  it("hydrates only existing normal public media and rejects private or traversal paths", () => {
    const id = randomUUID(), content = emptyChickFilAContent(); content.artwork.map = { assetId: id, alt: "Edited transit map" };
    const asset = { id, storage_bucket: "onzio-media", storage_path: `${randomUUID()}/homepage/map.png`, width: 2484, height: 1156 };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    try {
      expect(hydrateChickFilAContent(content, []).artwork.map.url).toBeNull();
      expect(hydrateChickFilAContent(content, [asset]).artwork.map).toMatchObject({ alt: "Edited transit map", width: 2484, height: 1156, url: `http://127.0.0.1:55321/storage/v1/object/public/onzio-media/${asset.storage_path}` });
      expect(hydrateChickFilAContent(content, [{ ...asset, storage_bucket: "onzio-upload-staging" }]).artwork.map.url).toBeNull();
      expect(hydrateChickFilAContent(content, [{ ...asset, storage_path: "tenant/../private.png" }]).artwork.map.url).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
  it("keeps JSON key order irrelevant and rejects a recovered draft that differs from its locked pending operation", () => {
    const content = emptyChickFilAContent();
    expect(chickFilADraftFingerprint(Object.fromEntries(Object.entries(content).reverse()) as typeof content)).toBe(chickFilADraftFingerprint(content));
    const pending = { operationId: randomUUID(), expectedRevision: "1", designRevision: "design", content, retiredMediaAssetIds: [] };
    const recovered = { content, revision: "1", designRevision: "design", pending, retired: [], media: [] };
    expect(chickFilARecoverySchema.safeParse(recovered).success).toBe(true);
    expect(chickFilARecoverySchema.safeParse({ ...recovered, content: { ...content, title: "Changed after save started" } }).success).toBe(false);
    expect(chickFilARecoverySchema.safeParse({ ...recovered, revision: "2" }).success).toBe(false);
  });
  it("reads alt-only stored JSON with authoritative snake-case media IDs before validating and filters tenant/published media", async () => {
    const id = randomUUID(), clubId = randomUUID(), content = emptyChickFilAContent();
    const row = { content: { ...content, artwork: Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => [slot, { alt: content.artwork[slot].alt }])) }, ...Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => [CHICK_FIL_A_MEDIA_COLUMNS[slot], slot === "map" ? id : null])) };
    const page = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }; page.select.mockReturnValue(page); page.eq.mockReturnValue(page); page.maybeSingle.mockResolvedValue({ data: row, error: null });
    const media = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), in: vi.fn() }; media.select.mockReturnValue(media); media.eq.mockReturnValue(media); media.is.mockReturnValue(media); media.in.mockResolvedValue({ data: [], error: null });
    const from = vi.fn((table: string) => table === "cinematic_chick_fil_a_content" ? page : media);
    const result = await fetchChickFilAContent(clubId, { from } as unknown as typeof supabase);
    expect(result.artwork.map.assetId).toBe(id); expect(result.artwork.map.url).toBeNull();
    expect(page.eq).toHaveBeenCalledWith("club_id", clubId);
    expect(media.eq).toHaveBeenCalledWith("club_id", clubId); expect(media.eq).toHaveBeenCalledWith("status", "published");
    expect(media.is).toHaveBeenCalledWith("deleted_at", null); expect(media.in).toHaveBeenCalledWith("id", [id]);
  });
});
