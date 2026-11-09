import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  gamesNeedingScoreHint,
  loadAdminHomeData,
  newSignUpsHint,
  newSignUpsSince,
  readOwnDisplayName,
} from "@/lib/admin-home-data";

type Row = Record<string, unknown>;
type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * An in-memory stand-in for the user-scoped Supabase client: it applies the
 * filters the loader asks for to plain rows and records every call, so tests
 * see both the answer and the query that produced it.
 */
function fakeClient(tables: Record<string, Row[]>, failing: ReadonlySet<string> = new Set()) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    let rows = [...(tables[table] ?? [])];
    let window: [number, number] | null = null;
    let limit: number | null = null;
    const record = (name: string, args: unknown[]) => call.ops.push([name, args]);
    const result = () => {
      if (failing.has(table)) return { data: null, error: { message: `${table} failed` } };
      let data = rows;
      if (window) data = data.slice(window[0], window[1] + 1);
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
      in: (column: string, values: unknown[]) => {
        record("in", [column, values]);
        rows = rows.filter((row) => values.includes(row[column]));
        return api;
      },
      gte: (column: string, value: string) => {
        record("gte", [column, value]);
        rows = rows.filter((row) => String(row[column]) >= value);
        return api;
      },
      lte: (column: string, value: string) => {
        record("lte", [column, value]);
        rows = rows.filter((row) => String(row[column]) <= value);
        return api;
      },
      order: (column: string, options?: unknown) => {
        record("order", [column, options]);
        rows = [...rows].sort((left, right) => String(left[column]).localeCompare(String(right[column])));
        return api;
      },
      range: (start: number, end: number) => (record("range", [start, end]), (window = [start, end]), api),
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

const CLUB = "club-1";
const OTHER = "club-2";
const SEASON = "season-1";
const CHICAGO = "America/Chicago";
const LOS_ANGELES = "America/Los_Angeles";
// 2026-03-15 03:00 UTC: Saturday 14 March, 10 PM in Chicago; 8 PM in Los Angeles.
const NOW = new Date("2026-03-15T03:00:00Z");

const seasons: Row[] = [
  { id: SEASON, club_id: CLUB, active: true },
  { id: "season-old", club_id: CLUB, active: false },
  { id: "season-other", club_id: OTHER, active: true },
];

function game(id: string, date: string, time: string | null, extra: Row = {}): Row {
  return { id, club_id: CLUB, season_id: SEASON, date, time, rose_city_score: null, opponent_score: null, ...extra };
}

describe("games that need a score (ADMIN-RE-05)", () => {
  const matches: Row[] = [
    game("played-early", "2026-03-14", "19:00"), // Chicago: kicked off 7 PM, two hours past at 9 PM
    game("still-going", "2026-03-14", "21:00"), // Chicago: 9 PM kickoff, not two hours past at 10 PM
    game("last-week", "2026-03-07", "TBD"),
    game("scored", "2026-03-07", "10:00", { rose_city_score: 2, opponent_score: 1 }),
    game("half-entered", "2026-03-07", "10:00", { rose_city_score: 0 }),
    game("next-week", "2026-03-21", "10:00"),
    game("old-season", "2026-03-07", "10:00", { season_id: "season-old" }),
    game("other-club", "2026-03-07", "10:00", { club_id: OTHER, season_id: "season-other" }),
  ];

  it("counts the active season's unscored games two hours after kickoff, in club time", async () => {
    const { client, calls } = fakeClient({ seasons, matches, registration_forms: [], registrations: [] });
    const data = await loadAdminHomeData(client, CLUB, CHICAGO, NOW);
    expect(data.gamesNeedingScore).toBe(2);

    const query = calls.find((call) => call.table === "matches")!.ops;
    expect(query).toContainEqual(["eq", ["club_id", CLUB]]);
    expect(query).toContainEqual(["eq", ["season_id", SEASON]]);
    expect(query).toContainEqual(["is", ["rose_city_score", null]]);
    expect(query).toContainEqual(["is", ["opponent_score", null]]);
    expect(query).toContainEqual(["lte", ["date", "2026-03-14"]]);
    expect(query).toContainEqual(["select", ["id,date,time"]]);
  });

  it("reads the same games differently in Los Angeles, where 7 PM kickoff is only an hour ago", async () => {
    const { client } = fakeClient({ seasons, matches, registration_forms: [], registrations: [] });
    expect((await loadAdminHomeData(client, CLUB, LOS_ANGELES, NOW)).gamesNeedingScore).toBe(1);
  });

  it("is zero without an active season and unknown when the season cannot be read", async () => {
    const none = fakeClient({ seasons: [], matches, registration_forms: [], registrations: [] });
    expect((await loadAdminHomeData(none.client, CLUB, CHICAGO, NOW)).gamesNeedingScore).toBe(0);
    expect(none.calls.some((call) => call.table === "matches")).toBe(false);

    const broken = fakeClient({ seasons, matches, registration_forms: [], registrations: [] }, new Set(["seasons"]));
    expect((await loadAdminHomeData(broken.client, CLUB, CHICAGO, NOW)).gamesNeedingScore).toBeNull();
  });

  it("is unknown, not zero, when the games cannot be read", async () => {
    const { client } = fakeClient({ seasons, matches, registration_forms: [], registrations: [] }, new Set(["matches"]));
    expect((await loadAdminHomeData(client, CLUB, CHICAGO, NOW)).gamesNeedingScore).toBeNull();
  });
});

describe("new sign-ups and the fourth job (decision 10)", () => {
  const forms: Row[] = [
    { id: "form-open", club_id: CLUB, status: "open", archived_at: null },
    { id: "form-closed", club_id: CLUB, status: "closed", archived_at: null },
    { id: "form-archived", club_id: CLUB, status: "open", archived_at: "2026-02-01T00:00:00Z" },
    { id: "form-other", club_id: OTHER, status: "open", archived_at: null },
  ];
  const signUp = (id: string, formId: string, submittedAt: string, extra: Row = {}): Row => ({
    id,
    club_id: CLUB,
    form_id: formId,
    status: "paid",
    submitted_at: submittedAt,
    ...extra,
  });

  it("starts the seven days at midnight club time, six days before today", () => {
    // Today in Chicago is 14 March, so the window opens at midnight on 8 March
    // (still standard time: daylight saving starts at 2 AM that day).
    expect(newSignUpsSince(CHICAGO, NOW)).toBe("2026-03-08T06:00:00.000Z");
    expect(newSignUpsSince(LOS_ANGELES, NOW)).toBe("2026-03-08T08:00:00.000Z");
  });

  it("counts paid sign-ups on current forms inside the window only", async () => {
    const registrations = [
      signUp("r1", "form-open", "2026-03-08T06:00:00.000Z"),
      signUp("r2", "form-closed", "2026-03-14T20:00:00.000Z"),
      signUp("r3", "form-open", "2026-03-08T05:59:59.000Z"), // a second before the window
      signUp("r4", "form-open", "2026-03-12T10:00:00.000Z", { status: "refunded" }),
      signUp("r5", "form-open", "2026-03-12T10:00:00.000Z", { status: "pending" }),
      signUp("r6", "form-archived", "2026-03-12T10:00:00.000Z"),
      signUp("r7", "form-other", "2026-03-12T10:00:00.000Z", { club_id: OTHER }),
    ];
    const { client, calls } = fakeClient({ seasons, matches: [], registration_forms: forms, registrations });
    const data = await loadAdminHomeData(client, CLUB, CHICAGO, NOW);
    expect(data.newSignUps).toBe(2);
    expect(data.hasLiveSignUps).toBe(true);

    const query = calls.find((call) => call.table === "registrations")!.ops;
    expect(query).toContainEqual(["select", ["form_id"]]);
    expect(query).toContainEqual(["eq", ["club_id", CLUB]]);
    expect(query).toContainEqual(["eq", ["status", "paid"]]);
    expect(query).toContainEqual(["gte", ["submitted_at", "2026-03-08T06:00:00.000Z"]]);
    expect(query).toContainEqual(["order", ["id", { ascending: true }]]);

    const formQuery = calls.find((call) => call.table === "registration_forms")!.ops;
    expect(formQuery).toContainEqual(["eq", ["club_id", CLUB]]);
    expect(formQuery).toContainEqual(["is", ["archived_at", null]]);
  });

  it("pages through every sign-up with a stable order", async () => {
    const registrations = Array.from({ length: 1_284 }, (_, index) =>
      signUp(`r${String(index).padStart(5, "0")}`, "form-open", "2026-03-13T12:00:00.000Z"),
    );
    const { client, calls } = fakeClient({ seasons, matches: [], registration_forms: forms, registrations });
    const data = await loadAdminHomeData(client, CLUB, CHICAGO, NOW);
    expect(data.newSignUps).toBe(1_284);
    expect(newSignUpsHint(data.newSignUps)).toBe("1,284 new");
    const pages = calls.filter((call) => call.table === "registrations");
    expect(pages.map((call) => call.ops.find(([name]) => name === "range")?.[1])).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it.each([
    ["an open form", [{ id: "f", club_id: CLUB, status: "open", archived_at: null }], [], true],
    ["a closed form with paid sign-ups", [{ id: "f", club_id: CLUB, status: "closed", archived_at: null }], [signUp("r", "f", "2025-01-01T00:00:00Z")], true],
    ["a closed form with only refunds", [{ id: "f", club_id: CLUB, status: "closed", archived_at: null }], [signUp("r", "f", "2025-01-01T00:00:00Z", { status: "refunded" })], true],
    ["a draft with no sign-ups", [{ id: "f", club_id: CLUB, status: "draft", archived_at: null }], [], false],
    ["a closed form with only unpaid attempts", [{ id: "f", club_id: CLUB, status: "closed", archived_at: null }], [signUp("r", "f", "2025-01-01T00:00:00Z", { status: "expired" })], false],
    ["only an archived open form", [{ id: "f", club_id: CLUB, status: "open", archived_at: "2026-01-01T00:00:00Z" }], [], false],
    ["no forms", [], [], false],
  ])("with %s, See registrations is a big job: %s", async (_label, registration_forms, registrations, expected) => {
    const { client } = fakeClient({ seasons, matches: [], registration_forms, registrations });
    expect((await loadAdminHomeData(client, CLUB, CHICAGO, NOW)).hasLiveSignUps).toBe(expected);
  });

  it("keeps the quiet row and drops the hint when forms cannot be read", async () => {
    const { client } = fakeClient({ seasons, matches: [], registration_forms: forms, registrations: [] }, new Set(["registration_forms"]));
    const data = await loadAdminHomeData(client, CLUB, CHICAGO, NOW);
    expect(data).toMatchObject({ newSignUps: null, hasLiveSignUps: false });
  });

  it("drops only the hint when sign-ups cannot be counted", async () => {
    const { client } = fakeClient({ seasons, matches: [], registration_forms: forms, registrations: [] }, new Set(["registrations"]));
    const data = await loadAdminHomeData(client, CLUB, CHICAGO, NOW);
    expect(data).toMatchObject({ newSignUps: null, hasLiveSignUps: true });
  });
});

describe("the greeting's name", () => {
  const club_members: Row[] = [
    { club_id: CLUB, user_id: "me", status: "active", display_name: "Andrea Lopez" },
    { club_id: CLUB, user_id: "blank", status: "active", display_name: "   " },
    { club_id: CLUB, user_id: "gone", status: "removed", display_name: "Former Helper" },
    { club_id: OTHER, user_id: "me", status: "active", display_name: "Someone Else" },
  ];

  it("reads only the signed-in member's own active row in this club", async () => {
    const { client, calls } = fakeClient({ club_members });
    expect(await readOwnDisplayName(client, CLUB, "me")).toBe("Andrea Lopez");
    expect(calls[0].ops).toEqual([
      ["select", ["display_name"]],
      ["eq", ["club_id", CLUB]],
      ["eq", ["user_id", "me"]],
      ["eq", ["status", "active"]],
    ]);
  });

  it("has no name when none is saved, the membership ended, or the read fails", async () => {
    expect(await readOwnDisplayName(fakeClient({ club_members }).client, CLUB, "blank")).toBeNull();
    expect(await readOwnDisplayName(fakeClient({ club_members }).client, CLUB, "gone")).toBeNull();
    expect(await readOwnDisplayName(fakeClient({ club_members }, new Set(["club_members"])).client, CLUB, "me")).toBeNull();
  });
});

describe("hint wording", () => {
  it.each([
    [null, null],
    [0, null],
    [1, "1 game needs a score"],
    [2, "2 games need a score"],
    [12, "12 games need a score"],
    [1_284, "1,284 games need a score"],
  ])("%s games -> %s", (count, expected) => {
    expect(gamesNeedingScoreHint(count)).toBe(expected);
  });

  it.each([
    [null, null],
    [0, null],
    [1, "1 new"],
    [3, "3 new"],
    [12_000, "12,000 new"],
  ])("%s sign-ups -> %s", (count, expected) => {
    expect(newSignUpsHint(count)).toBe(expected);
  });
});
