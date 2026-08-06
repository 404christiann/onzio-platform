import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubs } from "../fixtures/entities";
import { fetchLeagueStandings } from "@/lib/queries";

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

describe("fetchLeagueStandings public fallback", () => {
  it("does not surface the admin editor's Rose City demo table to a tenant-scoped club with no standings configured yet", async () => {
    // Reproduces DCFC-602: normalizeStandingsRows/normalizeStandingsSettings
    // intentionally return DEFAULT_STANDINGS_ROWS/SETTINGS for an empty
    // input as the admin editor's empty-state preview. The public query
    // path must not inherit that behavior — a club with zero real standings
    // rows should render nothing, not a fake "Rose City FC" league table.
    const content = await fetchLeagueStandings(CLUB_ID);

    expect(content.rows).toEqual([]);
    expect(content.settings.title).toBe("");
    expect(content.settings.intro).toBe("");
  });

  it("still returns the branded default rows for a genuinely unscoped call", async () => {
    const content = await fetchLeagueStandings();

    expect(content.rows.length).toBeGreaterThan(0);
    expect(content.rows[0].team_name).toBe("Rose City FC");
  });
});
