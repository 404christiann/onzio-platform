import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createClient } from "@/lib/admin-client";
import { normalizeGraphic } from "@/lib/media-processing";

const client = vi.hoisted(() => ({ stagingUpload: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({ auth: {}, storage: { from: () => ({ uploadToSignedUrl: client.stagingUpload }) } }) }));
beforeEach(() => {
  client.stagingUpload.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("authorize")
    ? { path: "tenant/homepage/staging.png", token: "signed", authorization: "authorization" }
    : { data: { assetId: "11111111-1111-4111-8111-111111111111", storagePath: "tenant/homepage/published.webp", publicUrl: "http://127.0.0.1/storage/v1/object/public/onzio-media/tenant/homepage/published.webp" } }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("cinematic artwork replacement", () => {
  it("uses graphic authorization for artwork and preserves photograph authorization for match slides", async () => {
    const png = new File([new Uint8Array([1, 2, 3])], "ticket.png", { type: "image/png" });
    const graphic = await createClient().storage.from("homepage-artwork").upload("artwork-ticket.png", png);
    expect(graphic.error).toBeNull();
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ surface: "homepage", kind: "graphic" });
    vi.mocked(fetch).mockClear();
    await createClient().storage.from("homepage").upload("match.jpg", png);
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ surface: "homepage", kind: "photo" });
  });
  it("keeps transparent trophy artwork transparent through graphic normalization", async () => {
    const bytes = await sharp({ create: { width: 600, height: 500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const normalized = await normalizeGraphic(bytes);
    const result = await sharp(normalized.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(normalized.hasAlpha).toBe(true);
    expect(result.info.channels).toBe(4);
    expect(result.data[3]).toBe(0);
    expect(normalized.width).toBe(600); expect(normalized.height).toBe(500);
  });
});
