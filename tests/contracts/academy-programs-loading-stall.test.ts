import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchClubBranding: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/queries", () => ({ fetchClubBranding: mocks.fetchClubBranding }));

import { loadAcademyShellBranding } from "@/lib/academy-shell-branding";

const clubId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ schema: (schema: string) => ({ schema }) });
});

afterEach(() => vi.useRealTimers());

describe("academy shell stalled reads", () => {
  it("uses the tenant-scoped server client for a healthy first-paint crest", async () => {
    const branding = { logoPath: "/alpha.webp", inverseLogoPath: "", footerTagline: "Alpha" };
    mocks.fetchClubBranding.mockResolvedValue(branding);

    await expect(loadAcademyShellBranding(clubId)).resolves.toBe(branding);
    expect(mocks.fetchClubBranding).toHaveBeenCalledWith(clubId, { schema: "onzio" });
  });

  it("settles with the provider fallback when the server branding read never resolves", async () => {
    vi.useFakeTimers();
    mocks.fetchClubBranding.mockImplementation(() => new Promise(() => {}));

    const branding = loadAcademyShellBranding(clubId);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.fetchClubBranding).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(branding).resolves.toBeNull();
  });

  it("does not start hydrated Programs data in the page-wide Suspense boundary", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "app/%5Fclubs/[slug]/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("await loadAcademyShellBranding(club.id)");
    expect(layout).toContain("<Nav />");
    expect(layout).not.toContain("fetchPrograms");
    expect(layout).not.toContain("initialPrograms=");
  });
});
