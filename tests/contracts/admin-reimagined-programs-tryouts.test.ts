import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProgramsTryouts } from "@/lib/admin-programs-tryouts-data";
import type { Onzio } from "@/lib/admin-home-data";
import { programsTryoutsRequestSchema, PROGRAMS_TRYOUTS_MESSAGES } from "@/lib/programs-tryouts-contract";

// ADMIN-RE-12c: "Programs and tryouts" (/admin/programs-and-tryouts). The list
// reads through the signed-in person's own client and scopes every query to
// the club; each row's state comes from lib/sign-up-state.ts; prices and
// "N signed up" come from the form; and every change goes through
// POST /api/admin/programs-and-tryouts, which resolves the club itself and
// calls the RE-12b RPCs.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ROUTE = "app/api/admin/programs-and-tryouts/route.ts";
const PAGE = "app/admin/(protected)/programs-and-tryouts/page.tsx";
const DATA = "lib/admin-programs-tryouts-data.ts";
const VIEW = "components/admin/reimagined/ProgramsTryouts.tsx";
const FORM = "components/admin/reimagined/TryoutForm.tsx";

const CLUB = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Row = Record<string, unknown>;

/** An in-memory stand-in for the user-scoped client; records each table's filters. */
function fakeOnzio(tables: Record<string, Row[]>, failing: ReadonlySet<string> = new Set()) {
  const filters: Record<string, Array<[string, unknown]>> = {};
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let window: [number, number] | null = null;
    const seen = (filters[table] ??= []);
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        seen.push([column, value]);
        rows = rows.filter((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        seen.push([column, values]);
        rows = rows.filter((row) => values.includes(row[column]));
        return api;
      },
      order: () => api,
      limit: () => api,
      range: (start: number, end: number) => ((window = [start, end]), api),
      then: (done: (value: unknown) => unknown, fail?: (reason: unknown) => unknown) => {
        if (failing.has(table)) return Promise.resolve({ data: null, error: { message: `${table} failed` } }).then(done, fail);
        const data = window ? rows.slice(window[0], window[1] + 1) : rows;
        return Promise.resolve({ data, error: null }).then(done, fail);
      },
    };
    return api;
  };
  return { onzio: { from } as unknown as Onzio, filters };
}

const tryout = (overrides: Row): Row => ({
  club_id: CLUB, headline: "Tryout", status: "open", event_date: null, location: "", cost_text: "",
  cta_label: "", registration_href: "", registration_form_id: null, sort_order: 0, hidden: false,
  sign_up_by_contact: false, stays_open_after_date: false, updated_at: "2026-11-10T10:00:00.123456+00:00",
  ...overrides,
});
const program = (overrides: Row): Row => ({
  club_id: CLUB, display_title: "Program", summary: "", status: "active", external_cta_label: "",
  external_cta_href: "", registration_form_id: null, sign_ups_closed: false, sign_up_by_contact: false,
  sort_order: 0, updated_at: "2026-11-10T10:00:00.123456+00:00", ...overrides,
});
const form = (overrides: Row): Row => ({ club_id: CLUB, title: "Form", status: "open", archived_at: null, ...overrides });
const price = (formId: string, amount: number): Row => ({ club_id: CLUB, form_id: formId, amount_cents: amount, active: true });
const signUp = (formId: string, status = "paid"): Row => ({ club_id: CLUB, form_id: formId, status, id: `${formId}-${Math.random()}` });

const BOTH = { programs: true, tryouts: true } as const;

describe("loadProgramsTryouts", () => {
  const spring = form({ id: ID(1), title: "Spring tryouts 2027" });
  const camp = form({ id: ID(2), title: "Summer Camp 2027" });
  const futsal = form({ id: ID(3), title: "Winter Futsal" });
  const draft = form({ id: ID(4), title: "Not ready", status: "draft" });
  const archived = form({ id: ID(5), title: "Old", status: "closed", archived_at: "2026-01-01T00:00:00Z" });
  const tables = {
    tryouts: [
      tryout({ id: ID(11), headline: "Fall tryouts", event_date: "2026-10-04", location: "Lincoln Park", registration_form_id: ID(1), sort_order: 0 }),
      tryout({ id: ID(12), headline: "Spring tryouts", event_date: "2027-03-07", location: "Riverside Fields", cta_label: "Sign up", registration_href: "https://example.test", sort_order: 1 }),
      tryout({ id: ID(13), headline: "No date yet", sort_order: 2 }),
      tryout({ id: ID(14), headline: "Secret", hidden: true, sort_order: 3 }),
      tryout({ id: ID(19), club_id: OTHER, headline: "Another club's" }),
    ],
    programs: [
      program({ id: ID(21), display_title: "Summer Camp", summary: "Summer days", registration_form_id: ID(2), sort_order: 0 }),
      program({ id: ID(22), display_title: "Goalkeeper Clinic", registration_form_id: ID(4), sort_order: 1 }),
      program({ id: ID(23), display_title: "Adult Pickup", status: "hidden", sort_order: 2 }),
      program({ id: ID(24), display_title: "Academy", sign_ups_closed: true, sign_up_by_contact: true, sort_order: 3 }),
    ],
    registration_forms: [spring, camp, futsal, draft, archived],
    registration_price_options: [price(ID(1), 4000), price(ID(1), 2500), price(ID(2), 18000), price(ID(3), 9000)],
    club_stripe_connect: [{ club_id: CLUB, environment: "test", charges_enabled: false }],
    contact_profile: [{ club_id: CLUB, public_email: "club@example.test" }],
    registrations: [signUp(ID(1)), signUp(ID(1)), signUp(ID(1), "refunded"), signUp(ID(2)), signUp(ID(2), "pending")],
  };

  it("reads only this club, with tryouts by date and programs in the website's order", async () => {
    const { onzio, filters } = fakeOnzio(tables);
    const data = await loadProgramsTryouts(onzio, CLUB, "2026-11-10", BOTH, "test");
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.tryouts.map((item) => item.name)).toEqual(["Fall tryouts", "Spring tryouts", "No date yet", "Secret"]);
    expect(data.programs.map((item) => item.name)).toEqual(["Summer Camp", "Goalkeeper Clinic", "Adult Pickup", "Academy"]);
    for (const table of ["tryouts", "programs", "registration_forms", "registration_price_options", "club_stripe_connect", "contact_profile", "registrations"]) {
      expect(filters[table]).toContainEqual(["club_id", CLUB]);
    }
    expect(data.hasContactEmail).toBe(true);
  });

  it("works out each row's state, price and sign-ups from its way and date", async () => {
    const { onzio } = fakeOnzio(tables);
    const data = await loadProgramsTryouts(onzio, CLUB, "2026-11-10", BOTH, "test");
    if (data.status !== "ready") throw new Error("not ready");
    const [fall, spring2, noDate, secret] = data.tryouts;
    expect(fall).toMatchObject({ state: "closed", way: "form", closedLine: "Closed after Sun, Oct 4", price: "From $25", signedUp: 3, line: "Sun, Oct 4 · Lincoln Park" });
    expect(spring2).toMatchObject({ state: "taking", way: "link", price: null, signedUp: null, closedLine: null });
    expect(noDate).toMatchObject({ state: "not-yet", way: "none", line: "" });
    expect(secret).toMatchObject({ state: "hidden" });
    const [camp2, keeper, pickup, academy] = data.programs;
    expect(camp2).toMatchObject({ state: "taking", price: "$180", signedUp: 1 });
    // A draft form isn't a sign-up way yet, and the row says so.
    expect(keeper).toMatchObject({ state: "not-yet", formNotOpen: true, signedUp: 0 });
    expect(pickup).toMatchObject({ state: "hidden", hidden: true });
    expect(academy).toMatchObject({ state: "closed", closedByOwner: true, way: "contact" });
  });

  it("lists the forms with their price, who uses them and whether payments must be connected first", async () => {
    const { onzio } = fakeOnzio(tables);
    const data = await loadProgramsTryouts(onzio, CLUB, "2026-11-10", BOTH, "test");
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.forms.map((option) => option.title)).not.toContain("Old");
    expect(data.forms.find((option) => option.id === ID(1))).toMatchObject({
      price: "From $25", open: true, needsPayments: true, usedBy: { kind: "tryout", id: ID(11), name: "Fall tryouts" },
    });
    expect(data.forms.find((option) => option.id === ID(2))).toMatchObject({ usedBy: { kind: "program", name: "Summer Camp" } });
    expect(data.forms.find((option) => option.id === ID(3))).toMatchObject({ usedBy: null, needsPayments: true, price: "$90" });
    expect(data.forms.find((option) => option.id === ID(4))).toMatchObject({ open: false, needsPayments: false, price: null });
  });

  it("doesn't dim paid forms once payments are connected for this environment", async () => {
    const { onzio } = fakeOnzio({ ...tables, club_stripe_connect: [{ club_id: CLUB, environment: "test", charges_enabled: true }] });
    const data = await loadProgramsTryouts(onzio, CLUB, "2026-11-10", BOTH, "test");
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.forms.every((option) => !option.needsPayments)).toBe(true);
  });

  it("shows only the section a club's website has (decision 0005)", async () => {
    const { onzio, filters } = fakeOnzio(tables);
    const data = await loadProgramsTryouts(onzio, CLUB, "2026-11-10", { programs: false, tryouts: true }, "test");
    if (data.status !== "ready") throw new Error("not ready");
    expect(data.programs).toEqual([]);
    expect(data.tryouts).toHaveLength(4);
    // Programs are still read, so a form a program uses still says "Used by".
    expect(filters.programs).toContainEqual(["club_id", CLUB]);
  });

  it("fails as a whole when a read fails", async () => {
    const { onzio } = fakeOnzio(tables, new Set(["tryouts"]));
    expect(await loadProgramsTryouts(onzio, CLUB, "2026-11-10", BOTH, "test")).toEqual({ status: "error" });
  });
});

describe("the request contract", () => {
  const tryoutSettings = {
    headline: "Spring tryouts", event_date: "2027-03-07", location: "", cost_text: "", cta_label: "",
    registration_href: "", registration_form_id: null, sign_up_by_contact: false, closed: false, hidden: false,
    stays_open_after_date: false,
  };

  it("accepts each action and refuses unknown keys, unsafe links, blank names and too-long text", () => {
    const ok = (value: unknown) => programsTryoutsRequestSchema.safeParse(value).success;
    expect(ok({ action: "save-tryout", operationId: ID(1), id: null, expectedUpdatedAt: null, tryout: tryoutSettings })).toBe(true);
    expect(ok({ action: "save-tryout", operationId: ID(1), id: ID(2), expectedUpdatedAt: null, tryout: tryoutSettings })).toBe(false);
    expect(ok({ action: "save-tryout", operationId: ID(1), id: null, expectedUpdatedAt: null, tryout: { ...tryoutSettings, headline: "  " } })).toBe(false);
    expect(ok({ action: "save-tryout", operationId: ID(1), id: null, expectedUpdatedAt: null, tryout: { ...tryoutSettings, headline: "x".repeat(81) } })).toBe(false);
    expect(ok({ action: "save-tryout", operationId: ID(1), id: null, expectedUpdatedAt: null, tryout: { ...tryoutSettings, registration_href: "javascript:alert(1)" } })).toBe(false);
    expect(ok({ action: "save-tryout", operationId: ID(1), id: null, expectedUpdatedAt: null, tryout: { ...tryoutSettings, club_id: CLUB } })).toBe(false);
    expect(ok({ action: "copy", operationId: ID(1), kind: "tryout", id: ID(2) })).toBe(true);
    expect(ok({ action: "move-program", operationId: ID(1), id: ID(2), direction: "sideways" })).toBe(false);
    expect(ok({ action: "delete-tryout", operationId: ID(1), id: ID(2), expectedUpdatedAt: "2026-11-10T10:00:00Z" })).toBe(true);
  });

  it("has plain words for every refusal the database can give", () => {
    const sql = source("supabase/migrations/20261110180000_programs_tryouts_sign_up_state.sql");
    for (const code of new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((match) => match[1]))) {
      expect(PROGRAMS_TRYOUTS_MESSAGES[code], code).toBeTruthy();
    }
  });
});

describe("server and tenant rules", () => {
  it("resolves the club and session on the server, checks the site has the section, and only calls the RE-12b RPCs", () => {
    const route = source(ROUTE);
    expect(route).toContain("requireFreshClubSession(supabase)");
    expect(route).toContain('getClubContext({ hostname: request.headers.get("host") ?? "", userId })');
    expect(route).toContain("authorizeMutation(");
    expect(route).toContain("codeSiteAdminFor(club)");
    expect(route).toContain('failure("SECTION_UNAVAILABLE", 404)');
    expect(route).toContain("site.programs.allowCreation");
    expect(route).toContain('request.headers.get("sec-fetch-site") === "cross-site"');
    for (const rpc of ["save_tryout", "save_program_sign_up", "copy_program", "copy_tryout", "delete_tryout", "save_program_directory"]) {
      expect(route).toContain(`"${rpc}"`);
    }
    expect(route).toContain("p_club_id: club.id");
    expect(route).not.toMatch(/createServiceRoleClient|supabase-service-role/);
  });

  it("sends a classic club to the old pages and reads through the user's own client", () => {
    const page = source(PAGE);
    expect(page).toContain('if (portal.portal !== "reimagined") redirect(');
    expect(page).toContain("createClient()");
    expect(page).not.toMatch(/createServiceRoleClient|supabase-service-role/);
    expect(source(DATA)).not.toMatch(/registrant_email|answers|status_token_hash/);
  });

  it("uses the glossary words and keeps a change one tap with Undo", () => {
    const view = source(VIEW);
    for (const words of ["Taking sign-ups", "Not taking sign-ups yet", "Hidden from your website", "How should families sign up?",
      "Sign-up form", "A link to another site", "They contact you", "Which form?", "Make a new form", "Connect payments first",
      "Make a copy", "Reopen", "Undo", "signed up"]) {
      expect(view).toContain(words);
    }
    expect(source(FORM)).toContain("It closes by itself after");
  });
});
