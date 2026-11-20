import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-MATCH-AREA: a club's match page is rendered from fetchFixtureById. Public read access to `matches` is not limited
// to one club, so the `club_id` filter is the only thing that keeps one club's domain from showing another club's
// match. The logo lookup must also use the same client as the match read (the server page passes the request client).
const mocks = vi.hoisted(() => {
  const state = {
    resolve: vi.fn(),
    rows: [] as Array<Record<string, unknown>>,
    queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  };
  /** An in-memory stand-in for the Supabase client: it applies every `.eq` it is given to the rows, like the database. */
  function recordingClient(tag: string) {
    return {
      tag,
      from(table: string) {
        const query = { table, filters: [] as Array<[string, unknown]> };
        state.queries.push(query);
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => { query.filters.push([column, value]); return builder; },
          maybeSingle: async () => {
            const found = state.rows.filter((row) => query.filters.every(([column, value]) => row[column] === value));
            return { data: found[0] ?? null, error: null };
          },
        };
        return builder;
      },
    };
  }
  return { ...state, recordingClient, defaultClient: recordingClient("default") };
});
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: mocks.resolve }));
vi.mock("@/lib/supabase", () => ({ supabase: mocks.defaultClient }));
const { recordingClient, defaultClient } = mocks;
import { fetchFixtureById } from "@/lib/queries";

const ROSE = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ROSE_MATCH = "baf199e2-bea4-5fc7-840f-e1dc59fefb4d";
const OTHER_MATCH = "f6c712d3-7034-5ae3-8311-769c451c16bf";
const row = (id: string, clubId: string, opponent: string) => ({ id, club_id: clubId, date: "2027-05-02", time: "19:45:00", opponent, home: true });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.rows.splice(0, mocks.rows.length, row(ROSE_MATCH, ROSE, "Ocelot FC"), row(OTHER_MATCH, OTHER, "Other Club's Opponent"));
  mocks.resolve.mockImplementation(async (rows: unknown[]) => rows);
});

describe("fetchFixtureById reads one match for one club", () => {
  it("filters the match read by this club and by the match id", async () => {
    await fetchFixtureById(ROSE_MATCH, ROSE, recordingClient("request") as never);
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0].table).toBe("matches");
    expect(mocks.queries[0].filters).toEqual(expect.arrayContaining([["club_id", ROSE], ["id", ROSE_MATCH]]));
  });

  it("returns this club's match", async () => {
    await expect(fetchFixtureById(ROSE_MATCH, ROSE, recordingClient("request") as never)).resolves.toMatchObject({ id: ROSE_MATCH, opponent: "Ocelot FC" });
  });

  it("returns no match for another club's match id, even though that row exists and is readable", async () => {
    expect(mocks.rows.some((candidate) => candidate.id === OTHER_MATCH)).toBe(true);
    await expect(fetchFixtureById(OTHER_MATCH, ROSE, recordingClient("request") as never)).resolves.toBeNull();
    await expect(fetchFixtureById(ROSE_MATCH, OTHER, recordingClient("request") as never)).resolves.toBeNull();
  });

  it("returns no match for an id nobody owns", async () => {
    await expect(fetchFixtureById("99999999-9999-4999-8999-999999999999", ROSE, recordingClient("request") as never)).resolves.toBeNull();
  });
});

describe("fetchFixtureById resolves the opponent, sponsor and league logos with the client it was given", () => {
  it("hands the request client to the logo lookup, for this club and the three logo columns", async () => {
    const request = recordingClient("request");
    await fetchFixtureById(ROSE_MATCH, ROSE, request as never);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    const [rows, clubId, references, client] = mocks.resolve.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(clubId).toBe(ROSE);
    expect(references).toEqual([
      { assetId: "opponent_logo_asset_id", url: "opponent_logo_url" },
      { assetId: "sponsor_logo_asset_id", url: "sponsor_logo_url" },
      { assetId: "league_logo_asset_id", url: "league_logo_url" },
    ]);
    expect(client).toBe(request);
    expect(client).not.toBe(defaultClient);
  });

  it("uses the default browser client for both reads when none is given", async () => {
    await fetchFixtureById(ROSE_MATCH, ROSE);
    expect(mocks.resolve.mock.calls[0][3]).toBe(defaultClient);
    expect(mocks.queries).toHaveLength(1);
  });

  it("looks up no logos for a match that is not found", async () => {
    await fetchFixtureById(OTHER_MATCH, ROSE, recordingClient("request") as never);
    expect(mocks.resolve.mock.calls[0][0]).toEqual([]);
  });
});
