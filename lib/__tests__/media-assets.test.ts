import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
  vi.resetModules();
});

describe("published media asset URL", () => {
  it("encodes a versioned path in the exact public media bucket", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-test-anon-key";
    const { mediaAssetUrl } = await import("@/lib/media-assets");
    expect(
      mediaAssetUrl({
        storage_bucket: "onzio-media",
        storage_path:
          "11111111-1111-4111-8111-111111111111/branding/file name.webp",
      }),
    ).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/branding/file%20name.webp",
    );
  });

  it("rejects legacy or staging buckets", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-test-anon-key";
    const { mediaAssetUrl } = await import("@/lib/media-assets");
    expect(() =>
      mediaAssetUrl({
        storage_bucket: "staging",
        storage_path: "tenant/file.webp",
      }),
    ).toThrow("Only published Onzio media");
  });
});
