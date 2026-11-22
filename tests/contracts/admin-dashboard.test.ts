import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/page.tsx");
const loader = source("lib/admin-dashboard-data.ts");
const mix = source("lib/admin-dashboard-mix.ts");

describe("protected admin dashboard", () => {
  it("renders only the approved dashboard modules", () => {
    for (const heading of [
      "Quick actions",
      "Active players",
      "Active staff",
      "Matches this season",
      'label="Paid registrations"',
      "Registration forms",
      "Coming up",
      "Paid registrations by form",
    ]) {
      expect(page).toContain(heading);
    }
    expect(page).not.toContain("Recent Activity");
    expect(page).not.toContain("Activity Chart");
  });

  it("hides every registration surface when the club hides the Registrations route", () => {
    expect(page).toContain(
      'const showRegistrations = !isAdminRouteHiddenForClub(club.slug, "registrations");',
    );
    // The loading skeleton renders before the club is known and shows no data,
    // so only the real dashboard body is checked.
    const body = page.slice(
      page.indexOf("async function AdminDashboardContent"),
      page.indexOf("async function ReimaginedHomeContent"),
    );
    const gated = [
      /\{showRegistrations \? <MetricCard label="Paid registrations"/,
      /\{showRegistrations \? \(\s*<DashboardPanel title="Registration forms"/,
      /\{showRegistrations \? \(\s*<DashboardPanel title="Paid registrations by form"/,
    ];
    for (const pattern of gated) expect(body).toMatch(pattern);
    // No ungated second copy of any registration surface.
    for (const marker of [
      '<MetricCard label="Paid registrations"',
      '<DashboardPanel title="Registration forms"',
      '<DashboardPanel title="Paid registrations by form"',
    ]) {
      expect(body.split(marker)).toHaveLength(2);
    }
  });

  it("derives actions from the same strict route capability manifest", () => {
    expect(page).toContain("getVisibleAdminQuickActions");
    // Payments visibility must use the same predicate every other billing
    // surface uses (active owner — requireBillingRouteAuthorization and the
    // payments page's own redirect), not the BILLING_ADMIN_EMAIL(S) env
    // allowlist, which no other surface consults.
    expect(page).toContain('club.role === "owner" && club.lifecycle !== "archived"');
    expect(page).not.toContain("isBillingAdminEmail");
    expect(page).toContain("canMutateContent");
  });

  it("keeps dashboard reads server-side, user-scoped, tenant-scoped, and free of PII", () => {
    expect(page).not.toContain('"use client"');
    expect(page).toContain("createClient()");
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("getClubContext({");
    expect(loader).toContain('.schema("onzio")');
    expect(loader).toContain('.eq("club_id", clubId)');
    expect(loader).not.toContain("createServiceRoleClient");
    expect(loader).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loader).not.toMatch(/registrant_email|answers|status_token_hash/);
  });

  it("paginates paid-only mix rows and scopes them to current forms", () => {
    expect(loader).toContain('select("form_id")');
    expect(loader).toContain('.eq("status", "paid")');
    // Stable ordering is required for .range() pagination to be correct.
    expect(loader).toContain('.order("id", { ascending: true })');
    expect(loader).toContain(".range(start, start + pageSize - 1)");
    expect(loader).toContain('.is("archived_at", null)');
    expect(mix).toContain("sorted.slice(0, 5)");
    expect(mix).toContain('id: "other"');
  });

  it("shows truthful section errors instead of converting failures into zeroes", () => {
    expect(loader).toContain('status: "error"');
    expect(page).toContain("SectionError");
    expect(page).toContain("Unavailable");
    expect(page).not.toContain("sample");
  });

  it("provides a semantic alternative to the doughnut visualization", () => {
    expect(page).toContain("<table");
    expect(page).toContain("<caption");
    expect(page).toContain('scope="col"');
    expect(page).toContain('scope="row"');
    expect(page).toContain("AdminRegistrationMixChart");
  });

  it("omits the Quick Actions section instead of substituting a message when none are authorized", () => {
    expect(page).toContain("quickActions.length ? (");
    expect(page).not.toContain("Quick actions are unavailable");
  });

  it("treats a null count as unavailable and keeps Registration Mix rounding integer-only", () => {
    expect(loader).toContain("result.value.count === null");
    expect(loader).not.toContain("count ?? 0");
    expect(mix).toContain("(item.count * 100) % total");
    expect(mix).not.toContain("(item.count / total) * 100");
  });

  it("keeps long mix and form titles truncated with the full title available", () => {
    expect(page).toContain('className="truncate" title={item.label}');
    expect(page).toContain("title={form.title}");
  });

  it("limits the classic dashboard to the contract panels with real links and no placeholder data", () => {
    expect(page).toContain('actionHref="/admin/registrations"');
    expect(page).toContain('actionHref="/admin/schedule"');
    expect(page).not.toMatch(/Lorem|Placeholder|Math\.random/);
    const start = page.indexOf("<DashboardIntro clubName");
    const end = page.indexOf("// ADMIN-RE-05: the reimagined home");
    const classic = page.slice(start, end);
    expect((classic.match(/<DashboardPanel title=/g) ?? []).length).toBe(3);
  });

  // UI-POLISH-DASHBOARD: the next game or event leads, numbers are formatted,
  // and the dashboard keeps one radius, hairlines and no shadows.
  it("leads with the next game and keeps the polished visual rules", () => {
    const start = page.indexOf("const PANEL =");
    const end = page.indexOf("// ADMIN-RE-05: the reimagined home");
    const classic = page.slice(start, end) + page.slice(page.indexOf("function MetricCard"));
    const content = page.slice(page.indexOf("async function AdminDashboardContent"), end);
    expect(content.indexOf("<NextUp")).toBeLessThan(content.indexOf('aria-label="Season numbers"'));
    expect(content.indexOf('aria-label="Season numbers"')).toBeLessThan(content.indexOf("quick-actions-heading"));
    expect(classic).toContain("data.events.data.slice(1)");
    expect(page).toContain('toLocaleString("en-US")');
    expect(classic).toContain("tabular-nums");
    expect(classic).not.toMatch(/shadow-|rounded-(xl|2xl|3xl)|bg-gradient|What would you like to do/);
    expect(page).not.toContain("AdminGuided.module.css");
  });
});
