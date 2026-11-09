import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  EARLIER_RESULTS_LIMIT,
  formatGameDay,
  loadScorePageData,
  resultLabel,
} from "@/lib/admin-score-data";

type Row = Record<string, unknown>;
type Call = { table: string; ops: Array<[string, unknown[]]> };

/** In-memory stand-in for the user-scoped client; applies filters and records calls. */
function fakeClient(tables: Record<string, Row[]>, failing: ReadonlySet<string> = new Set()) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    let rows = [...(tables[table] ?? [])];
    let limit: number | null = null;
    const sorts: Array<{ column: string; ascending: boolean }> = [];
    const record = (name: string, args: unknown[]) => call.ops.push([name, args]);
    const result = () => {
      if (failing.has(table)) return { data: null, error: { message: `${table} failed` } };
      let data = [...rows].sort((left, right) => {
        for (const { column, ascending } of sorts) {
          const order = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
          if (order) return ascending ? order : -order;
        }
        return 0;
      });
      if (limit !== null) data = data.slice(0, limit);
      return { data, error: null };
    };
    const api = {
      select: (...args: unknown[]) => (record("select", args), api),
      eq: (column: string, value: unknown) => {
        record("eq", [column, value]);
        rows = rows.filter((row) => row[column] === value);
        return api;
      },
      is: (column: string, value: unknown) => {
        record("is", [column, value]);
        rows = rows.filter((row) => (row[column] ?? null) === value);
        return api;
      },
      not: (column: string, operator: string, value: unknown) => {
        record("not", [column, operator, value]);
        rows = rows.filter((row) => (row[column] ?? null) !== value);
        return api;
      },
      lte: (column: string, value: string) => {
        record("lte", [column, value]);
        rows = rows.filter((row) => String(row[column]) <= value);
        return api;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        record("order", [column, options]);
        sorts.push({ column, ascending: options?.ascending ?? true });
        return api;
      },
      limit: (count: number) => (record("limit", [count]), (limit = count), api),
      maybeSingle: () => {
        const { data, error } = result();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return api;
  };
  const client = { schema: () => ({ from }) } as unknown as SupabaseClient;
  return { client, calls };
}

const CLUB = "club-a";
const OTHER = "club-b";
const SEASON = "season-1";
const CHICAGO = "America/Chicago";
// 2026-11-08 18:00 UTC is noon in Chicago.
const NOW = new Date("2026-11-08T18:00:00Z");

const seasons: Row[] = [
  { id: SEASON, club_id: CLUB, label: "Fall 2026 · League", active: true },
  { id: "season-0", club_id: CLUB, label: "Spring 2026", active: false },
  { id: "season-b", club_id: OTHER, label: "Other", active: true },
];

function match(overrides: Row): Row {
  return {
    club_id: CLUB,
    season_id: SEASON,
    time: "10:00",
    home: true,
    competition: null,
    rose_city_score: null,
    opponent_score: null,
    ...overrides,
  };
}

describe("Enter a score data (ADMIN-RE-06)", () => {
  it("lists unscored games two hours after kickoff in club time, newest first", async () => {
    const { client } = fakeClient({
      seasons,
      matches: [
        match({ id: "old", date: "2026-11-01", opponent: "Riverside" }),
        match({ id: "new", date: "2026-11-07", opponent: "Westfield", competition: "League", home: false }),
        // 9:00 in Chicago today is three hours ago; 10:30 is an hour and a half ago.
        match({ id: "today-done", date: "2026-11-08", time: "09:00", opponent: "Morning FC" }),
        match({ id: "today-playing", date: "2026-11-08", time: "10:30", opponent: "Midday FC" }),
        match({ id: "future", date: "2026-11-15", opponent: "Later FC" }),
        match({ id: "half", date: "2026-11-02", opponent: "Half FC", rose_city_score: 1 }),
        match({ id: "other-season", date: "2026-11-03", opponent: "Spring FC", season_id: "season-0" }),
        match({ id: "other-club", date: "2026-11-04", opponent: "Elsewhere", club_id: OTHER, season_id: "season-b" }),
      ],
    });
    const data = await loadScorePageData(client, CLUB, CHICAGO, NOW);
    expect(data.status).toBe("ready");
    if (data.status !== "ready") return;
    expect(data.seasonLabel).toBe("Fall 2026 · League");
    expect(data.needScore.map((game) => game.id)).toEqual(["today-done", "new", "old"]);
    expect(data.needScore[1]).toEqual({
      id: "new",
      opponent: "Westfield",
      home: false,
      when: "Sat, Nov 7 · 10:00 AM · League",
      day: "Sat, Nov 7",
      ourScore: null,
      theirScore: null,
    });
  });

  it("shows earlier results from the active season, newest first, capped", async () => {
    const scored = Array.from({ length: EARLIER_RESULTS_LIMIT + 3 }, (_, index) =>
      match({
        id: `scored-${index}`,
        date: `2026-10-${String(index + 1).padStart(2, "0")}`,
        opponent: `Team ${index}`,
        rose_city_score: index,
        opponent_score: 1,
      }),
    );
    const { client, calls } = fakeClient({
      seasons,
      matches: [...scored, match({ id: "other-club", date: "2026-10-30", opponent: "X", club_id: OTHER, rose_city_score: 1, opponent_score: 1 })],
    });
    const data = await loadScorePageData(client, CLUB, CHICAGO, NOW);
    if (data.status !== "ready") throw new Error("expected ready");
    expect(data.needScore).toEqual([]);
    expect(data.earlier).toHaveLength(EARLIER_RESULTS_LIMIT);
    expect(data.earlier[0].id).toBe(`scored-${EARLIER_RESULTS_LIMIT + 2}`);
    // Every query is scoped to the club; nothing but match facts is selected.
    for (const call of calls) {
      expect(call.ops).toContainEqual(["eq", ["club_id", CLUB]]);
    }
    const selects = calls.flatMap((call) => call.ops.filter(([name]) => name === "select").map(([, args]) => String(args[0])));
    expect(selects).toEqual([
      "id,label",
      "id,date,time,opponent,home,competition,rose_city_score,opponent_score",
      "id,date,time,opponent,home,competition,rose_city_score,opponent_score",
    ]);
  });

  it("has nothing to list without an active season", async () => {
    const { client } = fakeClient({ seasons: [], matches: [match({ id: "x", date: "2026-11-01", opponent: "X" })] });
    expect(await loadScorePageData(client, CLUB, CHICAGO, NOW)).toEqual({
      status: "ready",
      seasonLabel: null,
      needScore: [],
      earlier: [],
    });
  });

  it("reports a failed read instead of claiming every score is in", async () => {
    for (const table of ["seasons", "matches"]) {
      const { client } = fakeClient({ seasons, matches: [] }, new Set([table]));
      expect(await loadScorePageData(client, CLUB, CHICAGO, NOW)).toEqual({ status: "error" });
    }
  });

  it("words the result Won, Drew or Lost, and nothing until both scores are in", () => {
    expect(resultLabel(3, 1)).toBe("Won 3–1");
    expect(resultLabel(1, 1)).toBe("Drew 1–1");
    expect(resultLabel(0, 0)).toBe("Drew 0–0");
    expect(resultLabel(10, 12)).toBe("Lost 10–12");
    expect(resultLabel(null, 1)).toBeNull();
    expect(resultLabel(2, null)).toBeNull();
  });

  it("formats a plain game date without shifting it across zones", () => {
    expect(formatGameDay("2026-11-08")).toBe("Sun, Nov 8");
    expect(formatGameDay("2026-12-31")).toBe("Thu, Dec 31");
    expect(formatGameDay("not a date")).toBe("");
  });
});
