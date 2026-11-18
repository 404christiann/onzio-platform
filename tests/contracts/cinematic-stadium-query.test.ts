import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fetchStadiumContent } from "@/lib/stadium-query";
import { emptyStadiumContent } from "@/lib/stadium-content";

afterEach(() => vi.unstubAllEnvs());
describe("Stadium trusted query and authoritative media identities", () => {
  it("reconstructs IDs from the tenant FK columns before validating alt-only database JSON", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const id = randomUUID(), copy = emptyStadiumContent();
    const row = { content: { ...copy, artwork: { bus: { alt: "" }, map: { alt: "Saved map description" }, partner: { alt: "" } } }, bus_media_asset_id: null, map_media_asset_id: id, partner_media_asset_id: null };
    const contentChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) };
    const mediaChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id, storage_bucket: "onzio-media", storage_path: "tenant/homepage/map.png", width: 2380, height: 1216 }], error: null }) };
    const client = { from: vi.fn().mockImplementation(table => table === "cinematic_stadium_content" ? contentChain : mediaChain) };
    const result = await fetchStadiumContent("tenant", client as unknown as Parameters<typeof fetchStadiumContent>[1]);
    expect(result.artwork.map.assetId).toBe(id);
    expect(result.artwork.map.alt).toBe("Saved map description");
    expect(result.artwork.map.url).toContain("tenant/homepage/map.png");
    expect(contentChain.eq).toHaveBeenCalledWith("club_id", "tenant");
    expect(mediaChain.eq).toHaveBeenCalledWith("club_id", "tenant");
    expect(mediaChain.eq).toHaveBeenCalledWith("status", "published");
    expect(mediaChain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(mediaChain.in).toHaveBeenCalledWith("id", [id]);
  });
  it("fails on an actual backend error instead of exposing another tenant's defaults as saved data", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }) };
    await expect(fetchStadiumContent("tenant", { from: () => chain } as unknown as Parameters<typeof fetchStadiumContent>[1])).rejects.toThrow("Unable to load Stadium content.");
  });
});
