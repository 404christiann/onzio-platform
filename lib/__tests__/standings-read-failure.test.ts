import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLeagueStandings } from "@/lib/queries";
import { DEFAULT_STANDINGS_ROWS, DEFAULT_STANDINGS_SETTINGS } from "@/lib/standings-content";

const clubId = "11111111-1111-4111-8111-111111111111";
const { from, state } = vi.hoisted(() => ({ from: vi.fn(), state: { failedTable: "league_standings" } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));
vi.mock("@/lib/media-assets", () => ({
  resolveMediaReferences: vi.fn(async (rows: readonly Record<string, unknown>[]) => rows),
  resolveMediaStoragePath: vi.fn(async (_clubId, _assetId, fallback) => fallback),
}));
beforeEach(() => {
  vi.clearAllMocks();
  from.mockImplementation((table: string) => {
    const response = table === state.failedTable
      ? { data: null, error: { message: `${table} unavailable` } }
      : { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "limit", "order"]) chain[method] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve);
    return chain;
  });
});

describe("Standings read failures", () => {
  for (const table of ["league_standings", "league_standings_settings"]) {
    it(`strict admin loading rejects ${table} failures instead of enabling default replacement`, async () => {
      state.failedTable = table;
      await expect(fetchLeagueStandings(clubId, { strict: true })).rejects.toThrow(`${table} unavailable`);
    });
    it(`tenant public loading retains its safe empty fallback for ${table} failures`, async () => {
      state.failedTable = table;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await fetchLeagueStandings(clubId);
      expect(result.rows).toEqual([]);
      expect(result.settings).toEqual(DEFAULT_STANDINGS_SETTINGS);
      vi.restoreAllMocks();
    });
    it(`legacy unscoped loading retains its branded fallback for ${table} failures`, async () => {
      state.failedTable = table;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await fetchLeagueStandings();
      expect(result.rows).toEqual(DEFAULT_STANDINGS_ROWS);
      vi.restoreAllMocks();
    });
  }
});
