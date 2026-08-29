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
      "Quick Actions",
      "Active Players",
      "Active Staff",
      "Season Matches",
      "Paid Registrations",
      "Registration Forms",
      "Upcoming Fixtures & Events",
      "Registration Mix",
    ]) {
      expect(page).toContain(heading);
    }
    expect(page).not.toContain("Recent Activity");
    expect(page).not.toContain("Activity Chart");
  });

  it("derives actions from the same strict route capability manifest", () => {
    expect(page).toContain("getVisibleAdminQuickActions");
    expect(page).toContain("isBillingAdminEmail");
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
});
