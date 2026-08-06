import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubs } from "../fixtures/entities";
import { fetchHomepageContent } from "@/lib/queries";

const CLUB_ID = clubs.alpha.id;

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/media-assets", () => ({
  resolveMediaReferences: vi.fn(async (rows: readonly Record<string, unknown>[]) => rows),
  resolveMediaStoragePath: vi.fn(async (_clubId, _assetId, fallback) => fallback),
}));

function emptyChain() {
  const query = {} as Record<string, any>;
  for (const method of ["select", "eq", "order", "limit"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolveResult: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolveResult);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation(() => emptyChain());
});

describe("fetchHomepageContent hero fallback", () => {
  it("does not fall back to the hardcoded Rose City default for a tenant-scoped club with no publicly-readable hero row", async () => {
    // Reproduces DCFC-602: RLS silently returns zero rows (not an error) for a
    // club whose public_access is below live/grace. Before this fix, the
    // hero field alone (unlike its slideshow/behindTheRose siblings in the
    // same function) fell through to DEFAULT_HOMEPAGE_HERO_CONTENT, which
    // renders "Rose City FC" branding for every other club.
    const content = await fetchHomepageContent(CLUB_ID);

    expect(content.hero.headline_line_one).toBe("");
    expect(content.hero.primary_cta_label).toBe("");
    expect(content.hero.primary_cta_href).toBe("");
    expect(content.hero.secondary_cta_label).toBe("");
    expect(content.hero.secondary_cta_href).toBe("");
  });

  it("still returns the branded default for a genuinely unscoped call", async () => {
    const content = await fetchHomepageContent();

    expect(content.hero.headline_line_one).toBe("Rose City FC");
  });
});
