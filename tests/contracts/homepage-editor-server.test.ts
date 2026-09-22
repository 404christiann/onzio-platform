import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContract } from "../helpers/contract";
import { homepageDraft, photoFixture } from "../fixtures/homepage-editor";

type Snapshot = {
  revision: string;
  designRevision: string;
  content: ReturnType<typeof homepageDraft>;
  media: Array<{ id: string; storage_bucket: string; storage_path: string }>;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: Snapshot };
};
type Hydrate = <T extends Snapshot>(snapshot: T) => T;

const baseUrl = "https://project.supabase.co";
const assetId = photoFixture(1).assetId as string;

async function hydrate() {
  return loadContract<Hydrate>("@/lib/homepage-editor/server", "hydrateHomepageSnapshot");
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    revision: "revision-1",
    designRevision: "design-1",
    content: homepageDraft(),
    media: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", baseUrl);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("homepage snapshot media hydration", () => {
  it("builds a direct normalized public URL and encodes path segments", async () => {
    const input = snapshot({
      media: [{ id: assetId, storage_bucket: "onzio-media", storage_path: "homepage/season 2026/match photo.webp" }],
    });
    const result = (await hydrate())(input);

    expect(result.content.photos.items[0].url).toBe(
      `${baseUrl}/storage/v1/object/public/onzio-media/homepage/season%202026/match%20photo.webp`,
    );
  });

  it("keeps the persisted URL when the asset is unmatched or not public", async () => {
    const unmatched = snapshot({
      media: [{ id: "99999999-9999-4999-8999-999999999999", storage_bucket: "onzio-media", storage_path: "missing.webp" }],
    });
    const foreignBucket = snapshot({
      media: [{ id: assetId, storage_bucket: "private-bucket", storage_path: "private/photo.webp" }],
    });

    expect((await hydrate())(unmatched).content.photos.items[0].url).toBe(
      homepageDraft().photos.items[0].url,
    );
    expect((await hydrate())(foreignBucket).content.photos.items[0].url).toBe(
      homepageDraft().photos.items[0].url,
    );
  });

  it("hydrates a committed receipt recursively without mutating the original snapshot", async () => {
    const receipt = snapshot({
      revision: "receipt-revision",
      media: [{ id: assetId, storage_bucket: "onzio-media", storage_path: "receipts/receipt photo.webp" }],
    });
    const input = snapshot({ operation: { status: "committed", receipt } });
    const before = JSON.parse(JSON.stringify(input));
    const result = (await hydrate())(input);

    expect(result.operation?.status).toBe("committed");
    if (result.operation?.status === "committed") {
      expect(result.operation.receipt.content.photos.items[0].url).toBe(
        `${baseUrl}/storage/v1/object/public/onzio-media/receipts/receipt%20photo.webp`,
      );
    }
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
    expect(result.operation).not.toBe(input.operation);
  });

  it("preserves a legacy URL when no durable asset identity exists", async () => {
    const legacyUrl = "https://legacy.example/homepage/old-photo.jpg";
    const content = homepageDraft();
    content.photos.items[0] = { ...content.photos.items[0], assetId: null, url: legacyUrl };

    const result = (await hydrate())(snapshot({ content }));

    expect(result.content.photos.items[0].url).toBe(legacyUrl);
  });
});
