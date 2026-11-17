import { describe, expect, it, vi } from "vitest";
import { buildRegistrationMix } from "@/lib/admin-dashboard-mix";
import { loadAdminDashboardData } from "@/lib/admin-dashboard-data";

describe("buildRegistrationMix", () => {
  const forms = Array.from({ length: 7 }, (_, index) => ({
    id: `form-${index + 1}`,
    title: `Form ${index + 1}`,
    createdAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
  }));

  it("counts only rows that belong to current forms", () => {
    expect(
      buildRegistrationMix(forms.slice(0, 2), [
        { formId: "form-1" },
        { formId: "form-1" },
        { formId: "archived-form" },
      ]),
    ).toEqual([{ id: "form-1", label: "Form 1", count: 2, percentage: 100 }]);
  });

  it("groups entries after the leading five into Other", () => {
    const registrations = forms.flatMap((form, index) =>
      Array.from({ length: 7 - index }, () => ({ formId: form.id })),
    );
    const result = buildRegistrationMix(forms, registrations);
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ id: "other", label: "Other", count: 3 });
  });

  it("uses stable tie ordering and exact whole percentages totaling 100", () => {
    const result = buildRegistrationMix(forms.slice(0, 3), [
      { formId: "form-1" },
      { formId: "form-2" },
      { formId: "form-3" },
    ]);
    expect(result.map((item) => item.id)).toEqual(["form-1", "form-2", "form-3"]);
    expect(result.map((item) => item.percentage)).toEqual([34, 33, 33]);
    expect(result.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
  });

  it("returns an empty mix when no current form has paid rows", () => {
    expect(buildRegistrationMix(forms, [])).toEqual([]);
  });

  it("returns an empty mix when there are no current forms at all", () => {
    expect(buildRegistrationMix([], [{ formId: "form-1" }])).toEqual([]);
  });

  it("shows a single paid form as exactly 100% with no Other", () => {
    expect(buildRegistrationMix(forms, [{ formId: "form-4" }])).toEqual([
      { id: "form-4", label: "Form 4", count: 1, percentage: 100 },
    ]);
  });

  it("omits forms that have no paid rows instead of listing zero slices", () => {
    const result = buildRegistrationMix(forms, [{ formId: "form-2" }, { formId: "form-2" }]);
    expect(result.map((item) => item.id)).toEqual(["form-2"]);
  });

  it("breaks ties by creation date then id, even when the tie crosses the Other cut", () => {
    const tied = [
      { id: "b", title: "B", createdAt: "2026-01-01" },
      { id: "a", title: "A", createdAt: "2026-01-01" },
      ...forms.slice(0, 5).map((form) => ({ ...form, createdAt: `2026-02-0${form.id.slice(-1)}` })),
    ];
    const registrations = tied.map((form) => ({ formId: form.id }));
    const result = buildRegistrationMix(tied, registrations);
    // seven forms with one paid row each: the five oldest/lowest ids lead.
    expect(result.map((item) => item.id)).toEqual(["a", "b", "form-1", "form-2", "form-3", "other"]);
    expect(result.at(-1)).toMatchObject({ label: "Other", count: 2 });
    expect(buildRegistrationMix([...tied].reverse(), [...registrations].reverse())).toEqual(result);
  });

  it("aggregates every form past the fifth positive-count form into one Other row", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `m-${index}`,
      title: `M ${index}`,
      createdAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
    }));
    const result = buildRegistrationMix(many, many.map((form) => ({ formId: form.id })));
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ id: "other", count: 7 });
    expect(result.reduce((sum, item) => sum + item.count, 0)).toBe(12);
    expect(result.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
  });

  it("keeps long titles intact for the table to truncate visually", () => {
    const title = "Spring Premier Academy Tryout Registration ".repeat(8).trim();
    const result = buildRegistrationMix(
      [{ id: "long", title, createdAt: "2026-01-01" }],
      [{ formId: "long" }],
    );
    expect(result[0].label).toBe(title);
  });

  it("uses exact integer rounding that always totals 100 (no float drift)", () => {
    for (const counts of [
      [29, 71],
      [1, 1, 1, 1, 1, 1, 1],
      [7, 7, 7],
      [57, 29, 14],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [333, 333, 334],
    ]) {
      const set = counts.map((count, index) => ({
        form: { id: `f-${index}`, title: `F ${index}`, createdAt: `2026-01-${String(index + 1).padStart(2, "0")}` },
        count,
      }));
      const result = buildRegistrationMix(
        set.map((entry) => entry.form),
        set.flatMap((entry) => Array.from({ length: entry.count }, () => ({ formId: entry.form.id }))),
      );
      expect(result.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
      for (const item of result) {
        expect(Number.isInteger(item.percentage)).toBe(true);
      }
    }
    const exact = buildRegistrationMix(
      [
        { id: "a", title: "A", createdAt: "2026-01-01" },
        { id: "b", title: "B", createdAt: "2026-01-02" },
      ],
      [...Array.from({ length: 29 }, () => ({ formId: "a" })), ...Array.from({ length: 71 }, () => ({ formId: "b" }))],
    );
    expect(exact.map((item) => item.percentage)).toEqual([71, 29]);
  });
});

type TableResult = { data?: unknown; error?: { message: string } | null; count?: number | null } | "reject";
type QueryState = { table: string; eq: Array<[string, unknown]>; range: [number, number] | null };

// A recording stand-in for the Supabase client. Each table handler receives
// the accumulated query state and returns that query's result.
function fakeClient(handlers: Record<string, (state: QueryState) => TableResult>) {
  const queries: QueryState[] = [];
  const build = (table: string) => {
    const state: QueryState = { table, eq: [], range: null };
    queries.push(state);
    const settle = () => {
      const result = handlers[table]?.(state) ?? { data: [], error: null, count: 0 };
      return result === "reject"
        ? Promise.reject(new Error(`${table} exploded`))
        : Promise.resolve({ data: [], error: null, ...result });
    };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
              settle().then(resolve, reject);
          }
          if (property === "maybeSingle") return () => settle();
          if (property === "eq") {
            return (column: string, value: unknown) => {
              state.eq.push([column, value]);
              return chain;
            };
          }
          if (property === "range") {
            return (start: number, end: number) => {
              state.range = [start, end];
              return chain;
            };
          }
          return () => chain;
        },
      },
    );
    return chain;
  };
  return { client: { schema: () => ({ from: build }) } as never, queries };
}

const FORMS = [
  { id: "form-a", title: "Fall League", status: "open", created_at: "2026-01-01T00:00:00Z", archived_at: null },
  { id: "form-b", title: "Winter Camp", status: "closed", created_at: "2026-01-02T00:00:00Z", archived_at: null },
];

function healthyHandlers(): Record<string, (state: QueryState) => TableResult> {
  return {
    seasons: () => ({ data: { id: "season-1", label: "2026" } }),
    players: () => ({ count: 12 }),
    staff: () => ({ count: 3 }),
    matches: () => ({
      data: [
        { id: "m1", date: "2026-03-20", time: "10:00:00", opponent: "Rivals", home: true, venue: "Main Field" },
        { id: "m0", date: "2026-03-01", time: "10:00:00", opponent: "Past", home: false, venue: "" },
      ],
    }),
    tryouts: () => ({
      data: [
        { id: "t1", event_date: "2026-03-18", headline: "Open Tryout", location: "Gym" },
        { id: "t2", event_date: null, headline: "Undated", location: "" },
      ],
    }),
    registration_forms: () => ({ data: FORMS }),
    registrations: (state) => {
      const rows = [
        ...Array.from({ length: 3 }, () => ({ form_id: "form-a" })),
        { form_id: "form-b" },
        { form_id: "archived-form" },
      ];
      const [start, end] = state.range ?? [0, rows.length - 1];
      return { data: rows.slice(start, end + 1) };
    },
  };
}

describe("loadAdminDashboardData sections (CL26 contract)", () => {
  const run = async (handlers: Record<string, (state: QueryState) => TableResult>) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T18:00:00Z"));
    try {
      const { client, queries } = fakeClient(handlers);
      const data = await loadAdminDashboardData(client, "club-1", "America/Chicago");
      return { data, queries };
    } finally {
      vi.useRealTimers();
    }
  };

  it("returns real tenant-scoped values and scopes every query to the club", async () => {
    const { data, queries } = await run(healthyHandlers());
    expect(data.players).toEqual({ status: "ready", data: 12 });
    expect(data.staff).toEqual({ status: "ready", data: 3 });
    expect(data.seasonMatches).toEqual({ status: "ready", data: 2 });
    expect(data.paidRegistrations).toEqual({ status: "ready", data: 4 });
    expect(data.activeSeasonLabel).toBe("2026");
    expect(queries.map((query) => query.table).sort()).toEqual(
      ["matches", "players", "registration_forms", "registrations", "seasons", "staff", "tryouts"].sort(),
    );
    for (const query of queries) expect(query.eq).toContainEqual(["club_id", "club-1"]);
    expect(queries.find((query) => query.table === "registrations")?.eq).toContainEqual(["status", "paid"]);
    expect(data.registrationMix).toEqual({
      status: "ready",
      data: [
        { id: "form-a", label: "Fall League", count: 3, percentage: 75 },
        { id: "form-b", label: "Winter Camp", count: 1, percentage: 25 },
      ],
    });
  });

  it("combines only current/future fixtures with dated tryouts in date order", async () => {
    const { data } = await run(healthyHandlers());
    expect(data.events.status).toBe("ready");
    if (data.events.status !== "ready") return;
    expect(data.events.data.map((event) => event.id)).toEqual(["tryout-t1", "fixture-m1"]);
  });

  it("returns genuine zeroes for empty tenants, never errors", async () => {
    const { data } = await run({
      seasons: () => ({ data: null }),
      players: () => ({ count: 0 }),
      staff: () => ({ count: 0 }),
      registration_forms: () => ({ data: [] }),
      registrations: () => ({ data: [] }),
      tryouts: () => ({ data: [] }),
    });
    expect(data.players).toEqual({ status: "ready", data: 0 });
    expect(data.seasonMatches).toEqual({ status: "ready", data: 0 });
    expect(data.paidRegistrations).toEqual({ status: "ready", data: 0 });
    expect(data.forms).toEqual({ status: "ready", data: [] });
    expect(data.events).toEqual({ status: "ready", data: [] });
    expect(data.registrationMix).toEqual({ status: "ready", data: [] });
    expect(data.activeSeasonLabel).toBeNull();
  });

  it("marks a failed count query unavailable instead of a false zero", async () => {
    const { data } = await run({
      ...healthyHandlers(),
      players: () => ({ count: null, error: { message: "boom" } }),
      staff: () => "reject",
    });
    expect(data.players.status).toBe("error");
    expect(data.staff.status).toBe("error");
    expect(data.seasonMatches.status).toBe("ready");
    expect(data.paidRegistrations.status).toBe("ready");
  });

  it("treats a missing count without an error as unavailable, not zero", async () => {
    const { data } = await run({ ...healthyHandlers(), players: () => ({ count: null }) });
    expect(data.players.status).toBe("error");
  });

  it("fails the mix, forms and paid KPI together when forms cannot load (current forms are unknown)", async () => {
    const { data } = await run({
      ...healthyHandlers(),
      registration_forms: () => ({ data: null, error: { message: "boom" } }),
    });
    expect(data.forms.status).toBe("error");
    expect(data.registrationMix.status).toBe("error");
    expect(data.paidRegistrations.status).toBe("error");
    expect(data.players.status).toBe("ready");
  });

  it("excludes paid rows on archived forms from the KPI, and the KPI equals the mix paid total", async () => {
    const { data } = await run(healthyHandlers());
    // healthy data has 5 paid rows: 3 + 1 on current forms and 1 on an archived form.
    expect(data.paidRegistrations).toEqual({ status: "ready", data: 4 });
    expect(data.registrationMix.status).toBe("ready");
    if (data.registrationMix.status !== "ready" || data.paidRegistrations.status !== "ready") return;
    expect(data.registrationMix.data.reduce((sum, item) => sum + item.count, 0)).toBe(data.paidRegistrations.data);
  });

  it("fails the mix and the paid KPI when paid rows cannot load, but keeps forms", async () => {
    const { data } = await run({
      ...healthyHandlers(),
      registrations: () => ({ data: null, error: { message: "boom" } }),
    });
    expect(data.registrationMix.status).toBe("error");
    expect(data.paidRegistrations.status).toBe("error");
    expect(data.forms.status).toBe("ready");
    expect(data.players.status).toBe("ready");
  });

  it("fails season-dependent sections when the active season lookup fails", async () => {
    const { data } = await run({ ...healthyHandlers(), seasons: () => "reject" });
    expect(data.seasonMatches.status).toBe("error");
    expect(data.events.status).toBe("error");
    expect(data.activeSeasonLabel).toBeNull();
    expect(data.registrationMix.status).toBe("ready");
  });

  it("fails events when either matches or tryouts cannot load", async () => {
    const matchesDown = await run({ ...healthyHandlers(), matches: () => ({ data: null, error: { message: "x" } }) });
    expect(matchesDown.data.seasonMatches.status).toBe("error");
    expect(matchesDown.data.events.status).toBe("error");
    const tryoutsDown = await run({ ...healthyHandlers(), tryouts: () => ({ data: null, error: { message: "x" } }) });
    expect(tryoutsDown.data.seasonMatches.status).toBe("ready");
    expect(tryoutsDown.data.events.status).toBe("error");
  });

  it("paginates paid rows so the default row limit cannot truncate the mix", async () => {
    const total = 1203;
    const { data, queries } = await run({
      ...healthyHandlers(),
      registrations: (state) => {
        const [start, end] = state.range ?? [0, 0];
        const rows = Array.from({ length: total }, (_, index) => ({
          form_id: index < 900 ? "form-a" : "form-b",
        }));
        return { data: rows.slice(start, end + 1) };
      },
    });
    expect(queries.filter((query) => query.table === "registrations").map((query) => query.range)).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
    expect(data.paidRegistrations).toEqual({ status: "ready", data: total });
    expect(data.registrationMix.status === "ready" && data.registrationMix.data.map((item) => item.count)).toEqual([900, 303]);
  });

  it("fails the whole mix if a later page errors rather than showing partial counts", async () => {
    const { data } = await run({
      ...healthyHandlers(),
      registrations: (state) =>
        state.range?.[0] === 0
          ? { data: Array.from({ length: 500 }, () => ({ form_id: "form-a" })) }
          : { data: null, error: { message: "page 2" } },
    });
    expect(data.registrationMix.status).toBe("error");
    expect(data.paidRegistrations.status).toBe("error");
  });
});

describe("loadAdminDashboardData uses the club's today (ADMIN-RE-03)", () => {
  // A chainable stand-in for the Supabase client: every builder call returns the
  // chain, awaiting it gives an empty result, and gte() calls are recorded.
  function recordingClient() {
    const gteCalls: Array<[string, unknown]> = [];
    const empty = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return (resolve: (value: unknown) => void) => resolve(empty);
          if (property === "maybeSingle" || property === "single") {
            return () => Promise.resolve({ data: null, error: null });
          }
          if (property === "gte") {
            return (column: string, value: unknown) => {
              gteCalls.push([column, value]);
              return chain;
            };
          }
          return () => chain;
        },
      },
    );
    return { client: { schema: () => chain }, gteCalls };
  }

  it.each([
    // 2026-03-15 06:30 UTC: already the 15th in Chicago, still the 14th in Los Angeles.
    ["America/Chicago", "2026-03-15"],
    ["America/Los_Angeles", "2026-03-14"],
  ])("in %s, upcoming events start from %s", async (timeZone, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T06:30:00Z"));
    try {
      const { client, gteCalls } = recordingClient();
      await loadAdminDashboardData(client as never, "club-id", timeZone);
      expect(gteCalls).toContainEqual(["event_date", expected]);
    } finally {
      vi.useRealTimers();
    }
  });
});
