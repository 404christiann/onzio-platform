import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopSnapshot } from "@/lib/shop-editor/contract";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";

const base = "https://project.supabase.co";
const photo = (assetId: string | null, order = 0) => ({
  rowId: `row-${order}`, assetId, order, kit_variant: "home" as const,
  url: `https://legacy.example/${order}.jpg`, caption: `Photo ${order}`,
});
const media = (id: string, storage_path: string, storage_bucket = "onzio-media") => ({ id, storage_path, storage_bucket });
function snapshot(overrides: Partial<ShopSnapshot> = {}): ShopSnapshot {
  return {
    revision: "7", designRevision: "design-1", templateKey: "academy@1", surface: "shop",
    sections: [], photos: [], photoRows: [], purchase: null, media: [], ...overrides,
  };
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", base));
afterEach(() => vi.unstubAllEnvs());

describe("Shop snapshot photo resolution", () => {
  it("resolves both photo collections with exact segment encoding and preserves metadata and order", () => {
    const input = snapshot({
      photos: [photo("public", 2), photo("public", 1)], photoRows: [photo("public", 3)],
      media: [media("public", "shop/season 2026/50%?#.webp")],
      operation: { status: "not-committed" },
    });
    const before = structuredClone(input);
    const result = hydrateShopSnapshot(input);
    const url = `${base}/storage/v1/object/public/onzio-media/shop/season%202026/50%25%3F%23.webp`;
    expect(result).toEqual({ ...input, photos: input.photos.map((p) => ({ ...p, url })), photoRows: input.photoRows.map((p) => ({ ...p, url })) });
    expect(input).toEqual(before);
    expect(result.photos[0]).not.toBe(input.photos[0]);
    expect(result.photoRows[0]).not.toBe(input.photoRows[0]);
  });

  it("retains legacy, unmatched and private photos in both collections", () => {
    const photos = [photo(null), photo("missing", 1), photo("private", 2)];
    const input = snapshot({ photos, photoRows: photos, media: [media("private", "secret.webp", "private-bucket")] });
    const result = hydrateShopSnapshot(input);
    expect(result).toEqual(input);
    for (const collection of [result.photos, result.photoRows]) {
      collection.forEach((p, i) => expect(p).toBe(photos[i]));
    }
  });

  it.each([undefined, ""])("keeps persisted URLs when the base URL is %s", (value) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", value);
    const photos = [photo("public")];
    const input = snapshot({ photos, photoRows: photos, media: [media("public", "photo.webp")] });
    const result = hydrateShopSnapshot(input);
    expect(result).toEqual(input);
    expect(result.photos[0]).toBe(photos[0]);
    expect(result.photoRows[0]).toBe(photos[0]);
  });

  it("uses each committed receipt's own media and leaves the input untouched", () => {
    const receipt = snapshot({
      revision: "8", photos: [photo("shared")], photoRows: [photo("receipt-only", 1)],
      media: [media("shared", "receipt/shared.webp"), media("receipt-only", "receipt/only.webp")],
    });
    const input = snapshot({
      photos: [photo("shared")], photoRows: [photo("receipt-only", 1)],
      media: [media("shared", "outer/shared.webp")], operation: { status: "committed", receipt },
    });
    const before = structuredClone(input);
    const result = hydrateShopSnapshot(input);
    expect(result.photos[0].url).toBe(`${base}/storage/v1/object/public/onzio-media/outer/shared.webp`);
    expect(result.photoRows[0]).toBe(input.photoRows[0]);
    expect(result.operation?.status).toBe("committed");
    if (result.operation?.status !== "committed") throw new Error("Missing committed receipt");
    expect(result.operation.receipt.photos[0].url).toBe(`${base}/storage/v1/object/public/onzio-media/receipt/shared.webp`);
    expect(result.operation.receipt.photoRows[0].url).toBe(`${base}/storage/v1/object/public/onzio-media/receipt/only.webp`);
    expect(result.operation.receipt.revision).toBe("8");
    expect(input).toEqual(before);
  });
});
