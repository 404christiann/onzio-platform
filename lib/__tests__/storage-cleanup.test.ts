import { describe, expect, it } from "vitest";
import { storagePathFromPublicUrl } from "@/lib/storage-cleanup";

describe("storage cleanup URL parsing", () => {
  it("accepts the mapped versioned Onzio path", () => {
    expect(
      storagePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/about/44444444-4444-4444-8444-444444444444.png",
        { bucket: "about-page", allowedPrefixes: ["content/"] },
      ),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/about/44444444-4444-4444-8444-444444444444.png",
    );
  });

  it("rejects an Onzio path for the wrong surface", () => {
    expect(
      storagePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/shop/44444444-4444-4444-8444-444444444444.webp",
        { bucket: "about-page" },
      ),
    ).toBeNull();
  });
});
