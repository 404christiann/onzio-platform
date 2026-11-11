import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { SPONSOR_NAME_LIMIT, SPONSOR_WEBSITE_LIMIT } from "@/lib/sponsor-content";

// ADMIN-RE-15: Sponsors, one list (decision 0007). The database behavior is
// pinned in tests/database/sponsors-one-list.test.ts; this file pins the write
// contract, where each portal's page comes from, the public reads, the
// migration's place in the ledger, and that tenant resolution did not change.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ROW_ID = "3f063f06-3f06-4f06-8f06-3f063f063f06";
const ASSET_ID = "4f064f06-4f06-4f06-8f06-4f064f064f06";

const write = (operation: "insert" | "update" | "upsert", payload: Record<string, unknown> | Record<string, unknown>[]) =>
  adminDataRequestSchema.safeParse({ table: "site_sponsor_logos", operation, columns: "id", payload });

describe("the write contract", () => {
  it("takes what the one-list page sends", () => {
    expect(
      write("insert", [{
        name: "Summit Coffee", logo_url: "https://cdn.example/s.png", sort_order: 6,
        show_on_homepage: true, show_in_footer: false, website_url: "https://summitcoffee.com",
      }]).success,
    ).toBe(true);
    expect(write("update", { show_in_footer: true, website_url: null, sort_order: 0 }).success).toBe(true);
  });

  it("still takes what the classic page, and one loaded before the deploy, sends", () => {
    expect(write("insert", [{ placement: "carousel", name: "Old page", logo_url: "/o.png", sort_order: 2, media_asset_id: ASSET_ID }]).success).toBe(true);
    expect(write("update", { name: "Renamed", logo_url: "/r.png", sort_order: 1 }).success).toBe(true);
    expect(write("update", { show_on_homepage: false }).success).toBe(true);
  });

  it("keeps names to 60 characters, counted as the database counts them, and never blank", () => {
    expect(SPONSOR_NAME_LIMIT).toBe(60);
    expect(write("update", { name: "x".repeat(60) }).success).toBe(true);
    expect(write("update", { name: "😀".repeat(60) }).success).toBe(true);
    expect(write("update", { name: "x".repeat(61) }).success).toBe(false);
    expect(write("update", { name: "   " }).success).toBe(false);
  });

  it("takes only an http(s) website of at most 2,048 characters", () => {
    expect(SPONSOR_WEBSITE_LIMIT).toBe(2_048);
    expect(write("update", { website_url: `https://e.com/${"a".repeat(2_034)}` }).success).toBe(true);
    for (const bad of ["kimshardware.com", "mailto:kim@example.com", "/local", "javascript:alert(1)", `https://e.com/${"a".repeat(2_035)}`]) {
      expect(write("update", { website_url: bad }).success, bad).toBe(false);
    }
  });

  it("refuses unknown columns, tenant identity and an insert without a name or logo", () => {
    expect(write("update", { show_everywhere: true }).success).toBe(false);
    expect(write("update", { club_id: ROW_ID, name: "Mine" }).success).toBe(false);
    expect(write("insert", { logo_url: "/x.png" }).success).toBe(false);
    expect(write("insert", { name: "No logo" }).success).toBe(false);
    expect(write("update", { show_on_homepage: "yes" }).success).toBe(false);
  });
});

describe("the pages", () => {
  it("gives a reimagined club the one-list page and a classic club its own page, at the same address", () => {
    const page = source("app/admin/(protected)/sponsors/page.tsx");
    expect(page).toContain('portal === "reimagined" ? <Sponsors /> : <ClassicSponsorsPage />');
    expect(page).toContain("diffSponsorLogos(");
    expect(page).toContain("maxLength={SPONSOR_NAME_LIMIT}");
    expect(page).not.toMatch(/\.eq\("placement"/);
  });

  it("shows the Footer switch only where the club's website footer shows sponsors, from the site definition", () => {
    const screen = source("components/admin/reimagined/Sponsors.tsx");
    expect(screen).toContain("codeSiteAdminFor(club)?.sponsors.showFooterPlacement !== false");
    expect(screen).not.toMatch(/presentationTemplateKey|academy@1|codeSiteFor\(/);
    expect(codeSiteAdminFor({ slug: "diverse-city", presentationTemplateKey: "academy@1" } as never)?.sponsors.showFooterPlacement).toBe(false);
  });

  it("writes through the admin data route, with the places' limits and the hold-aware saved words", () => {
    const screen = source("components/admin/reimagined/Sponsors.tsx");
    expect(screen).toContain('from "@/lib/admin-client"');
    expect(screen).toContain("savedLabel(websiteState(club))");
    expect(screen).toContain("MAX_CAROUSEL_SPONSORS");
    expect(screen).toContain("MAX_FOOTER_SPONSORS");
    expect(screen).toContain("This logo may look blurry. Ask them for a bigger one.");
    expect(screen).not.toMatch(/service[_-]?role/i);
  });

  it("reads each public place from its switch, and links a sponsor only when it has a website", () => {
    const queries = source("lib/queries.ts");
    const fn = queries.slice(queries.indexOf("export async function fetchSiteSponsorLogos"), queries.indexOf("export async function fetchSponsorList"));
    expect(fn).toContain(".eq(SPONSOR_PLACEMENT_SWITCH[placement], true)");
    expect(fn).not.toContain('.eq("placement"');
    for (const file of ["components/SponsorCarousel.tsx", "components/Footer.tsx", "components/sites/diverse-city/AcademySponsorsPage.tsx"]) {
      expect(source(file), file).toContain("href={");
      expect(source(file), file).toContain("<SponsorLink");
    }
    const link = source("components/SponsorLink.tsx");
    expect(link).toContain('rel="noopener noreferrer sponsored"');
    expect(link).toContain("/^https?:\\/\\//i");
  });
});

describe("the migration", () => {
  const FILE = "20261110150000_sponsors_one_list.sql";

  it("sorts after every migration on main and after the Rose City 2027 branch's last one", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names).toContain(FILE);
    expect(FILE.slice(0, 14) > "20261110090000").toBe(true);
    expect(FILE.slice(0, 14) > "20261109210000").toBe(true);
    // Later packages' migrations sort after it (ADMIN-RE-11c).
    expect(names.filter((name) => name > FILE)).toEqual(["20261110160000_season_totals_add_up.sql"]);
  });

  it("does what the plan says, and keeps the old column for code deployed before it", () => {
    const sql = source(`supabase/migrations/${FILE}`);
    expect(sql).toContain("add column show_on_homepage boolean not null default false");
    expect(sql).toContain("add column show_in_footer boolean not null default false");
    expect(sql).toContain("add column website_url text");
    expect(sql).toContain("partition by l.club_id, l.media_asset_id");
    // Christian's check (2026-11-10): rows without a file record are not merged by link.
    expect(sql).toContain("where l.media_asset_id is not null");
    expect(sql).not.toMatch(/partition by [^)]*logo_url/);
    expect(sql).toContain("site_sponsor_logos_name_length");
    expect(sql).toContain("check (char_length(name) <= 60)");
    expect(sql).toContain("alter column placement drop not null");
    expect(sql).not.toMatch(/drop column|truncate/i);
    // The only table it drops is its own temporary order table.
    expect(sql.match(/drop table [a-z0-9_.]+/gi)).toEqual(["drop table re15_sponsor_order"]);
    expect(sql).toContain("create temporary table re15_sponsor_order");
    // Its one helper touches only the new row: no definer rights, empty search path, no grants.
    expect(sql).not.toMatch(/security definer/i);
    expect(sql.match(/security invoker\s+set search_path = ''/g)?.length).toBe(1);
    expect(sql.match(/revoke execute on function onzio_private\./g)?.length).toBe(1);
    expect(sql).not.toMatch(/grant /i);
  });

  it("does not add to the tenant-resolution select (the 2026-08-14 outage)", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/sponsor|show_on_homepage|website_url/);
    let changed: string[] = [];
    try {
      changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: process.cwd(), encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return;
    }
    expect(changed).not.toContain("lib/club-context.ts");
  });
});
