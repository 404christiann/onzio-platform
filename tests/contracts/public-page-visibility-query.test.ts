import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-PAGE-VISIBILITY: the "Visible to visitors" map is read in its own query, never in tenant resolution. On 2026-08-14 production
// lacked a column the tenant lookup selected and every request returned UNKNOWN_TENANT. This read FAILS OPEN: any error, including the
// column not existing yet, gives {} and every page stays shown, so deploying the code before the migration cannot take a site down.
const db = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  schema: vi.fn(),
  createPublicClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ createPublicClient: db.createPublicClient, createClient: db.createClient }));

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const CLUB_ID = "11111111-1111-4111-8111-111111111111";

// `cache` memoizes per request on the server; outside a request it does not, but import fresh per test to be explicit.
async function load() {
  vi.resetModules();
  return (await import("@/lib/public-page-visibility-query")).fetchPublicPageVisibility;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.maybeSingle.mockReset();
  db.eq.mockReturnValue({ maybeSingle: db.maybeSingle });
  db.select.mockReturnValue({ eq: db.eq });
  db.from.mockReturnValue({ select: db.select });
  db.schema.mockReturnValue({ from: db.from });
  db.createClient.mockReset();
  db.createClient.mockResolvedValue({ schema: db.schema });
});

describe("fetchPublicPageVisibility", () => {
  it("returns the parsed map for the club", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: { stadium: false, "chick-fil-a": true } }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({ stadium: false, "chick-fil-a": true });
  });

  it("asks only for the one column, by club id, in the onzio schema, with the request's own (cookie) client, never the anon-only one", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: {} }, error: null });
    const fetchPublicPageVisibility = await load();
    await fetchPublicPageVisibility(CLUB_ID);
    expect(db.createClient).toHaveBeenCalledTimes(1);
    expect(db.createPublicClient).not.toHaveBeenCalled();
    expect(db.schema).toHaveBeenCalledWith("onzio");
    expect(db.from).toHaveBeenCalledWith("clubs");
    expect(db.select).toHaveBeenCalledWith("public_page_visibility");
    expect(db.eq).toHaveBeenCalledTimes(1);
    expect(db.eq).toHaveBeenCalledWith("id", CLUB_ID);
  });

  it("returns {} for an empty map", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: {} }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("fails open when the column does not exist yet (the migration has not reached this database)", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: { code: "42703", message: "column clubs.public_page_visibility does not exist" } });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("fails open on any other query error, even one that still returns a row", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: { stadium: false } }, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("fails open when the query throws or rejects", async () => {
    db.maybeSingle.mockRejectedValue(new Error("network down"));
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("fails open when the client cannot even be created", async () => {
    db.createClient.mockRejectedValue(new Error("missing NEXT_PUBLIC_SUPABASE_URL"));
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("returns {} when there is no row for the club", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it.each([
    ["null", null],
    ["an array", [true]],
    ["a string", "stadium"],
    ["a number", 1],
    ["a boolean", false],
  ])("returns {} when the stored value is %s", async (_label, value) => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: value }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({});
  });

  it("reads the Tickets-menu keys like any other page", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: { tickets: false, "season-membership": false, "know-before-you-go": false } }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({ tickets: false, "season-membership": false });
  });

  it("keeps only known keys with boolean values and shows everything else", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: { stadium: "no", "chick-fil-a": false, "foothill-transit": 0, parking: false } }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({ "chick-fil-a": false });
  });
});

describe("a club that is not live yet", () => {
  it("still reads the owner's saved switches through the signed-in client, so their preview hides what they hid", async () => {
    db.maybeSingle.mockResolvedValue({ data: { public_page_visibility: { stadium: false } }, error: null });
    const fetchPublicPageVisibility = await load();
    await expect(fetchPublicPageVisibility(CLUB_ID)).resolves.toEqual({ stadium: false });
    expect(db.createClient).toHaveBeenCalledTimes(1);
    expect(db.createPublicClient).not.toHaveBeenCalled();
  });
});

describe("tenant resolution stays out of it", () => {
  it("lib/club-context.ts never mentions the column or the field", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/public_page_visibility|publicPageVisibility|public-page-visibility/);
  });

  it("the typed ClubContext has no visibility field", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/PublicPageVisibility/);
  });

  const walk = (dir: string): string[] =>
    readdirSync(resolve(root, dir)).flatMap(name => {
      const path = join(dir, name);
      return statSync(resolve(root, path)).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it("no component imports the server query module", () => {
    const offenders = walk("components").filter(file => /public-page-visibility-query/.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it("no client component, and nothing under components/sites, imports it either", () => {
    const clients = [...walk("app"), ...walk("lib")].filter(file => /^\s*["']use client["']/.test(source(file)));
    expect(clients.filter(file => /public-page-visibility-query/.test(source(file)))).toEqual([]);
    expect(walk("components/sites").filter(file => /public-page-visibility/.test(source(file)))).toEqual([]);
  });

  it("only the cinematic@2 layout branch, the admin layout and the seven cinematic pages call the query", () => {
    const callers = [...walk("app"), ...walk("lib")].filter(file => /public-page-visibility-query/.test(source(file))).sort();
    expect(callers).toEqual([
      "app/%5Fclubs/[slug]/contact/page.tsx",
      "app/%5Fclubs/[slug]/layout.tsx",
      "app/%5Fclubs/[slug]/stadium/chick-fil-a/page.tsx",
      "app/%5Fclubs/[slug]/stadium/foothill-transit/page.tsx",
      "app/%5Fclubs/[slug]/stadium/page.tsx",
      "app/%5Fclubs/[slug]/stadium/parking/page.tsx",
      "app/%5Fclubs/[slug]/tickets/page.tsx",
      "app/%5Fclubs/[slug]/tickets/season-membership/page.tsx",
      "app/admin/layout.tsx",
    ].sort());
    expect(callers.filter(file => file.startsWith("lib/"))).toEqual([]);
  });

  it("the public layout reads the map only inside the cinematic@2 branch, and mounts the provider around its children", () => {
    const layout = source("app/%5Fclubs/[slug]/layout.tsx");
    const cinematic = layout.slice(layout.indexOf('if (club.presentationTemplateKey === "cinematic@2")'), layout.indexOf("codeSiteFor(club)"));
    expect(cinematic).toContain("fetchPublicPageVisibility(club.id)");
    expect(cinematic).toContain("<PublicPageVisibilityProvider visibility={pageVisibility}>");
    expect(layout.match(/fetchPublicPageVisibility\(/g)).toHaveLength(1);
    expect(layout).not.toMatch(/revalidate|unstable_cache|force-static|generateStaticParams/);
  });

  it("the admin layout provides the map inside the club context so the switch can read it", () => {
    const layout = source("app/admin/layout.tsx");
    expect(layout).toContain("fetchPublicPageVisibility(club.id)");
    expect(layout.indexOf("<ClubContextProvider")).toBeLessThan(layout.indexOf("<PublicPageVisibilityProvider"));
    expect(layout.indexOf("<PublicPageVisibilityProvider")).toBeLessThan(layout.lastIndexOf("{children}"));
  });
});
