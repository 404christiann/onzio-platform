import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  clubDayLabel,
  loadSignUps,
  parseSignUpPersonId,
  parseSignUpTab,
  relativeSignUpDay,
  SIGN_UP_LIST_LIMIT,
  signUpPersonName,
} from "@/lib/admin-sign-ups-data";
import { signUpAmount, signUpDialNumber, signUpInitials } from "@/lib/admin-sign-ups-format";

// ADMIN-RE-08: "See registrations" (/admin/sign-ups). Reads are tenant-scoped
// and user-scoped, status_token_hash is never selected, counts are paged with a
// stable order, and contact details are read for one person at a time.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const PAGE = "app/admin/(protected)/sign-ups/page.tsx";
const DATA = "lib/admin-sign-ups-data.ts";
const VIEW = "components/admin/reimagined/SignUps.tsx";

type Row = Record<string, unknown>;
type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * An in-memory stand-in for the user-scoped client. It applies the filters,
 * orders, windows and column list the loader asks for (aliases such as
 * `player_name:answers->>player_name` included) and records every call.
 */
function fakeClient(tables: Record<string, Row[]>, failing: ReadonlySet<string> = new Set()) {
  const calls: Call[] = [];
  const project = (row: Row, columns: string) =>
    Object.fromEntries(
      columns.split(",").map((column) => {
        const [alias, path] = column.includes(":") ? column.split(":") : [column, column];
        const json = path.match(/^(\w+)->>(\w+)$/);
        if (json) return [alias, ((row[json[1]] ?? {}) as Row)[json[2]] ?? null];
        return [alias, row[path] ?? null];
      }),
    );
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    let rows = [...(tables[table] ?? [])];
    let columns = "*";
    const orders: Array<[string, boolean]> = [];
    let window: [number, number] | null = null;
    let limit: number | null = null;
    const record = (name: string, args: unknown[]) => call.ops.push([name, args]);
    const result = () => {
      if (failing.has(table)) return { data: null, error: { message: `${table} failed` } };
      let data = [...rows].sort((left, right) => {
        for (const [column, ascending] of orders) {
          const order = String(left[column]).localeCompare(String(right[column]));
          if (order) return ascending ? order : -order;
        }
        return 0;
      });
      if (window) data = data.slice(window[0], window[1] + 1);
      if (limit !== null) data = data.slice(0, limit);
      return { data: data.map((row) => project(row, columns)), error: null };
    };
    const api = {
      select: (value: string) => (record("select", [value]), (columns = value), api),
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
      order: (column: string, options?: { ascending?: boolean }) => {
        record("order", [column, options]);
        orders.push([column, options?.ascending ?? true]);
        return api;
      },
      range: (start: number, end: number) => (record("range", [start, end]), (window = [start, end]), api),
      limit: (count: number) => (record("limit", [count]), (limit = count), api),
      maybeSingle: () => {
        const { data, error } = result();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      then: (resolveValue: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolveValue, reject),
    };
    return api;
  };
  const client = { schema: () => ({ from }) } as unknown as SupabaseClient;
  return { client, calls };
}

const CLUB = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FALL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WINTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OLD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CHICAGO = "America/Chicago";
// Tuesday 10 November 2026, 9 AM in Chicago.
const NOW = new Date("2026-11-10T15:00:00Z");
const TOKEN = "f".repeat(64);

const forms: Row[] = [
  { id: FALL, club_id: CLUB, title: "Fall Youth Program", archived_at: null, created_at: "2026-08-01T00:00:00Z" },
  { id: WINTER, club_id: CLUB, title: "Winter Tryouts", archived_at: null, created_at: "2026-10-01T00:00:00Z" },
  { id: OLD, club_id: CLUB, title: "Spring Camp", archived_at: "2026-06-01T00:00:00Z", created_at: "2026-02-01T00:00:00Z" },
  { id: "other-form", club_id: OTHER, title: "Other club form", archived_at: null, created_at: "2026-09-01T00:00:00Z" },
];

let sequence = 0;
function registration(extra: Row = {}): Row {
  sequence += 1;
  const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  return {
    id,
    club_id: CLUB,
    form_id: FALL,
    status: "paid",
    participant_type: "minor",
    registrant_email: "ana.reyes@example.com",
    amount_cents: 12000,
    amount_refunded_cents: 0,
    submitted_at: "2026-11-09T18:00:00Z",
    paid_at: "2026-11-09T18:01:00Z",
    refunded_at: null,
    status_token_hash: TOKEN,
    answers: {
      player_name: "Sofia Reyes",
      guardian_name: "Ana Reyes",
      guardian_phone: "(503) 555-0142",
      guardian_email: "ana.reyes@example.com",
      emergency_contact_name: "Luis Reyes",
    },
    ...extra,
  };
}

const sofia = registration();
const adult = registration({
  form_id: WINTER,
  participant_type: "adult",
  amount_cents: 4000,
  submitted_at: "2026-11-08T18:00:00Z",
  registrant_email: "jo@example.com",
  answers: { registrant_name: "Jo", registrant_phone: "+44 (0)20 7946 0958", registrant_email: "jo.answer@example.com" },
});
const refunded = registration({
  status: "refunded",
  amount_refunded_cents: 12000,
  submitted_at: "2026-10-01T18:00:00Z",
  paid_at: "2026-10-01T18:01:00Z",
  refunded_at: "2026-10-03T18:00:00Z",
  answers: { player_name: "Đặng Thị Ngọc Hân", guardian_name: "Hân's mother" },
});
const archivedForm = registration({ form_id: OLD, submitted_at: "2026-11-09T12:00:00Z", answers: { player_name: "王秀英" } });
const pending = registration({ status: "pending", answers: { player_name: "Not paid yet" } });
const expired = registration({ status: "expired", answers: { player_name: "Gave up" } });
const otherClub = registration({ club_id: OTHER, form_id: "other-form", answers: { player_name: "Someone else" } });

const registrations = [sofia, adult, refunded, archivedForm, pending, expired, otherClub];

describe("sign-ups reads (ADMIN-RE-08)", () => {
  it("lists paid and refunded people from every form, newest first, with the form and the day", async () => {
    const { client } = fakeClient({ registration_forms: forms, registrations });
    const data = await loadSignUps(client, CLUB, CHICAGO, { now: NOW });
    expect(data.status).toBe("ready");
    if (data.status !== "ready") return;
    expect(data.rows.map((row) => [row.name, row.formTitle, row.status, row.amountCents, row.when])).toEqual([
      ["Sofia Reyes", "Fall Youth Program", "paid", 12000, "Yesterday"],
      ["王秀英", "Spring Camp", "paid", 12000, "Yesterday"],
      ["Jo", "Winter Tryouts", "paid", 4000, "2 days ago"],
      ["Đặng Thị Ngọc Hân", "Fall Youth Program", "refunded", 12000, "Oct 1"],
    ]);
    expect(data.counts).toEqual({ all: 4, paid: 3, refunded: 1 });
    expect(data.detail).toBeNull();
  });

  it("filters the tabs and keeps their counts", async () => {
    const { client } = fakeClient({ registration_forms: forms, registrations });
    const paid = await loadSignUps(client, CLUB, CHICAGO, { tab: "paid", now: NOW });
    const refunds = await loadSignUps(client, CLUB, CHICAGO, { tab: "refunded", now: NOW });
    if (paid.status !== "ready" || refunds.status !== "ready") throw new Error("not ready");
    expect(paid.rows.map((row) => row.status)).toEqual(["paid", "paid", "paid"]);
    expect(refunds.rows.map((row) => row.name)).toEqual(["Đặng Thị Ngọc Hân"]);
    expect(refunds.counts).toEqual(paid.counts);
  });

  it("scopes every read to the club and never selects status_token_hash or whole rows", async () => {
    const { client, calls } = fakeClient({ registration_forms: forms, registrations });
    const data = await loadSignUps(client, CLUB, CHICAGO, { personId: sofia.id as string, now: NOW });
    expect(calls.length).toBeGreaterThan(3);
    for (const call of calls) {
      expect(call.ops).toContainEqual(["eq", ["club_id", CLUB]]);
      const select = call.ops.find(([name]) => name === "select")?.[1][0] as string;
      expect(select).not.toContain("status_token_hash");
      expect(select).not.toBe("*");
      expect(select.split(",")).not.toContain("answers");
    }
    expect(JSON.stringify(data)).not.toContain(TOKEN);
    expect(JSON.stringify(data)).not.toContain("Someone else");
  });

  it("reads contact details only for the open person, never for the list", async () => {
    const closed = fakeClient({ registration_forms: forms, registrations });
    await loadSignUps(closed.client, CLUB, CHICAGO, { now: NOW });
    const selects = closed.calls.flatMap((call) => call.ops.filter(([name]) => name === "select").map(([, args]) => String(args[0])));
    for (const select of selects) {
      expect(select).not.toMatch(/guardian|registrant_phone|registrant_email|emergency/);
    }

    const open = fakeClient({ registration_forms: forms, registrations });
    const data = await loadSignUps(open.client, CLUB, CHICAGO, { personId: sofia.id as string, now: NOW });
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.detail).toMatchObject({
      id: sofia.id,
      name: "Sofia Reyes",
      contactLabel: "Parent or guardian",
      contactName: "Ana Reyes",
      contactPhone: "(503) 555-0142",
      contactEmail: "ana.reyes@example.com",
      amountCents: 12000,
      paidOn: "Nov 9",
    });
    // The emergency contact and other answers are not part of the panel.
    expect(JSON.stringify(data)).not.toContain("Luis Reyes");
  });

  it("shows an adult's own details, and refunds with their day", async () => {
    const { client } = fakeClient({ registration_forms: forms, registrations });
    const grown = await loadSignUps(client, CLUB, CHICAGO, { personId: adult.id as string, now: NOW });
    const refund = await loadSignUps(client, CLUB, CHICAGO, { personId: refunded.id as string, now: NOW });
    if (grown.status !== "ready" || refund.status !== "ready") throw new Error("not ready");
    expect(grown.detail).toMatchObject({
      contactLabel: "Contact",
      contactName: "Jo",
      contactPhone: "+44 (0)20 7946 0958",
      contactEmail: "jo.answer@example.com",
    });
    expect(refund.detail).toMatchObject({ status: "refunded", refundedCents: 12000, paidOn: "Oct 1", refundedOn: "Oct 3" });
  });

  it("finds no details for another club's sign-up, an unpaid one, or a malformed id", async () => {
    const { client } = fakeClient({ registration_forms: forms, registrations });
    for (const person of [otherClub, pending]) {
      const data = await loadSignUps(client, CLUB, CHICAGO, { personId: person.id as string, now: NOW });
      expect(data.status === "ready" && data.detail).toBeNull();
    }
    expect(parseSignUpPersonId("not-a-uuid")).toBeNull();
    expect(parseSignUpPersonId(["a"])).toBeNull();
    expect(parseSignUpPersonId(sofia.id)).toBe(sofia.id);
    expect(parseSignUpTab("refunded")).toBe("refunded");
    expect(parseSignUpTab("pending")).toBe("all");
    expect(parseSignUpTab(undefined)).toBe("all");
  });

  it("pages the counts with a stable order: 1,284 sign-ups in windows of 500", async () => {
    const many = Array.from({ length: 1284 }, (_, index) =>
      registration({ status: index === 0 ? "refunded" : "paid", submitted_at: "2026-11-09T18:00:00Z" }),
    );
    const { client, calls } = fakeClient({ registration_forms: forms, registrations: many });
    const data = await loadSignUps(client, CLUB, CHICAGO, { now: NOW });
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.counts).toEqual({ all: 1284, paid: 1283, refunded: 1 });
    const tally = calls.filter(
      (call) => call.table === "registrations" && call.ops.some(([name, args]) => name === "select" && args[0] === "form_id,status"),
    );
    expect(tally.map((call) => call.ops.find(([name]) => name === "range")?.[1])).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
    for (const call of tally) expect(call.ops).toContainEqual(["order", ["id", { ascending: true }]]);
    expect(data.rows).toHaveLength(SIGN_UP_LIST_LIMIT);
    expect(data.newThisWeek).toBe(1283);
  });

  it("reuses the home's count for N new this week: paid, current forms, last seven days in club time", async () => {
    const { client, calls } = fakeClient({ registration_forms: forms, registrations });
    const data = await loadSignUps(client, CLUB, CHICAGO, { now: NOW });
    if (data.status !== "ready") throw new Error("not ready");
    // Sofia and Jo; the refund, the archived form's sign-up and the unpaid ones are not new.
    expect(data.newThisWeek).toBe(2);
    const week = calls.find((call) => call.ops.some(([name]) => name === "gte"))!;
    expect(week.ops).toContainEqual(["eq", ["status", "paid"]]);
    expect(week.ops).toContainEqual(["gte", ["submitted_at", "2026-11-04T06:00:00.000Z"]]);
  });

  it("offers each form with sign-ups for Download list, archived ones marked", async () => {
    const { client } = fakeClient({ registration_forms: forms, registrations });
    const data = await loadSignUps(client, CLUB, CHICAGO, { now: NOW });
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.forms).toEqual([
      { id: WINTER, title: "Winter Tryouts", archived: false, signUps: 1 },
      { id: FALL, title: "Fall Youth Program", archived: false, signUps: 2 },
      { id: OLD, title: "Spring Camp", archived: true, signUps: 1 },
    ]);
  });

  it("is empty with no sign-ups, and an error rather than a wrong list when a read fails", async () => {
    const empty = fakeClient({ registration_forms: [], registrations: [] });
    expect(await loadSignUps(empty.client, CLUB, CHICAGO, { now: NOW })).toMatchObject({
      status: "ready",
      newThisWeek: 0,
      counts: { all: 0, paid: 0, refunded: 0 },
      rows: [],
      forms: [],
    });
    for (const table of ["registration_forms", "registrations"]) {
      const broken = fakeClient({ registration_forms: forms, registrations }, new Set([table]));
      expect(await loadSignUps(broken.client, CLUB, CHICAGO, { now: NOW })).toEqual({ status: "error" });
    }
  });
});

describe("sign-ups wording (ADMIN-RE-08)", () => {
  it("names the player on a child's form and the registrant on an adult's", () => {
    expect(signUpPersonName({ participant_type: "minor", player_name: "Sofia", registrant_name: null })).toBe("Sofia");
    expect(signUpPersonName({ participant_type: "adult", player_name: null, registrant_name: " Jo " })).toBe("Jo");
    expect(signUpPersonName({ participant_type: "minor", player_name: "", registrant_name: "Fallback" })).toBe("Fallback");
    expect(signUpPersonName({ participant_type: "minor", player_name: null, registrant_name: null })).toBe("Name not given");
  });

  it("says the day in club time: Today, Yesterday, N days ago, then the date", () => {
    expect(relativeSignUpDay("2026-11-10T14:00:00Z", CHICAGO, NOW)).toBe("Today");
    // 11:30 PM on the 9th in Chicago is already the 10th in UTC.
    expect(relativeSignUpDay("2026-11-10T05:30:00Z", CHICAGO, NOW)).toBe("Yesterday");
    expect(relativeSignUpDay("2026-11-04T18:00:00Z", CHICAGO, NOW)).toBe("6 days ago");
    expect(relativeSignUpDay("2026-11-03T18:00:00Z", CHICAGO, NOW)).toBe("Nov 3");
    expect(clubDayLabel("2025-12-31T18:00:00Z", CHICAGO, NOW)).toBe("December 31, 2025");
  });

  it("formats money and initials for the worst-case names", () => {
    expect(signUpAmount(12000)).toBe("$120");
    expect(signUpAmount(125000)).toBe("$1,250");
    expect(signUpAmount(0)).toBe("$0");
    expect(signUpAmount(4050)).toBe("$40.50");
    expect(signUpInitials("Christopher Alexander Montgomery III")).toBe("CI");
    expect(signUpInitials("Jo")).toBe("J");
    expect(signUpInitials("Đặng Thị Ngọc Hân")).toBe("ĐH");
    expect(signUpInitials("王秀英")).toBe("王");
    expect(signUpInitials("  ")).toBe("?");
    expect(signUpDialNumber("+44 (0)20 7946 0958 ext. 12345")).toBe("+4402079460958");
    expect(signUpDialNumber("(503) 555-0142")).toBe("5035550142");
    expect(signUpDialNumber("503.555.0142 x12")).toBe("5035550142");
  });
});

describe("sign-ups page contract (ADMIN-RE-08)", () => {
  it("reads server-side through the signed-in person's own client, after the session and club checks", () => {
    const page = source(PAGE);
    expect(page).toContain('import { createClient } from "@/lib/supabase-server"');
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("getClubContext(");
    expect(page).toContain("loadSignUps(supabase, club.id, portal.timeZone");
    expect(page).not.toMatch(/service[-_]?role|createServiceClient|SUPABASE_SERVICE/i);
    expect(page).not.toContain('"use client"');
  });

  it("sends a club still on the classic admin to its old page", () => {
    expect(source(PAGE)).toContain('if (portal.portal !== "reimagined") redirect("/admin/registrations")');
  });

  it("scopes every read to the club, never names status_token_hash, and pages counts by id", () => {
    const data = source(DATA);
    expect(data).not.toContain("status_token_hash");
    expect(data).not.toMatch(/select\(\s*["']\*["']/);
    const reads = data.split(/\.from\(/).slice(1);
    expect(reads.length).toBeGreaterThanOrEqual(3);
    for (const read of reads) expect(read.slice(0, 400)).toContain('.eq("club_id", clubId)');
    expect(data).toMatch(/\.order\("id", \{ ascending: true \}\)\s*\.range\(/);
    expect(data).toContain('import { countNewSignUps, newSignUpsSince, type Onzio } from "@/lib/admin-home-data"');
    expect(data).not.toMatch(/service[-_]?role|createServiceClient/i);
  });

  it("never logs, in the loader, the page or the view", () => {
    for (const path of [PAGE, DATA, VIEW]) expect(source(path)).not.toMatch(/console\.|logger\.|captureException/);
  });

  it("matches the design's words and reuses the shell, the sliding panel and the per-form export", () => {
    const view = source(VIEW);
    for (const words of [
      "new this week",
      "Newest first, from all your registration forms",
      "No sign-ups yet",
      "Parent or guardian",
      "Card, through Stripe",
      "Download list",
      "Which form?",
      "Sign-up forms",
    ]) {
      expect(view + source(DATA)).toContain(words);
    }
    expect(view).toContain('from "@/components/ui/sliding-panel"');
    expect(view).toContain("<TopBarActions>");
    expect(view).toContain("/api/admin/registrations/export?formId=");
    expect(view).toContain('href="/admin/registrations"');
    expect(view).toMatch(/IconMail|IconPhone|IconUser/);
    expect(view).not.toMatch(/from "lucide-react"|react-icons|heroicons/);
  });
});
