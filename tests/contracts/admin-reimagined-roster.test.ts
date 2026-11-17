import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getReimaginedPageTitle,
  getVisibleAdminMoreRows,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

// ADMIN-RE-17: Team roster (design: cd-roster-final-cascade). The page keeps
// its route and its writes. Under a reimagined club it shows the players as
// cards under position headings with a jump rail; a club still on the classic
// admin gets the page it has today. This file pins where the two part, that the
// board stays presentation only, and the rules the break-ui check set (phone
// name clamp, no side scroll, reduced motion).

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/roster/page.tsx");
const board = source("components/admin/reimagined/RosterBoard.tsx");
const css = source("components/admin/reimagined/roster.module.css");

function section(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, `Missing: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `Missing: ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("the roster page keeps both admins working (ADMIN-RE-17)", () => {
  const shell = section(page, "export default function RosterPage", "// ── Players tab");

  it("picks the new look from the club's portal and leaves the classic page as it was", () => {
    expect(page).toContain('import { useAdminPortal } from "@/components/admin/AdminPortalProvider"');
    expect(shell).toContain('useAdminPortal().portal === "reimagined"');
    // The classic page's tabs, add button and side panels are all still here.
    expect(shell).toContain('role="tablist"');
    expect(shell).toContain('tab === "players" ? "Add player" : "Add staff"');
    expect(page.match(/<AdminSidePanel/g)).toHaveLength(2);
  });

  it("still writes through the same browser client, with no new write path", () => {
    expect(page).toContain('import { createClient } from "@/lib/admin-client"');
    expect(page).not.toMatch(/supabase-server|service-role|SERVICE_ROLE/);
    expect(board).not.toMatch(/createClient|supabase|fetch\(|service-role/);
  });

  it("gives Staff the same switch, since the design shows players only", () => {
    expect(shell).toContain("RosterSwitch");
    expect(board).toContain('aria-label="Roster sections"');
    expect(board).toContain('role="tab"');
  });
});

describe("the board (ADMIN-RE-17)", () => {
  it("builds its sections from the shared pure helper", () => {
    expect(board).toContain("@/lib/admin-roster-view");
    expect(board).toContain("rosterSections(");
    expect(board).toContain("hiddenSummary(");
  });

  it("offers a jump rail on a laptop and a pinned tab bar on a phone", () => {
    expect(board).toContain('aria-label="Jump to a position"');
    expect(board).toContain("data-rail-zone");
    expect(board).toContain("data-rail-tab");
    expect(css).toMatch(/position:\s*sticky/);
    expect(css).toContain("@media (max-width: 639px)");
  });

  it("clamps a long name to two lines and breaks an unbreakable one", () => {
    const name = section(css, ".name {", "}");
    expect(name).toContain("-webkit-line-clamp: 2");
    expect(name).toMatch(/overflow-wrap:\s*anywhere/);
    expect(name).toContain("overflow: hidden");
    expect(board).toMatch(/title=\{player\.name\}/);
  });

  it("keeps the grid inside the screen and the numbers aligned", () => {
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });

  it("deals the cards in only when motion is allowed", () => {
    expect(css).toContain("@keyframes rosterDeal");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
    expect(board).toContain("prefers-reduced-motion");
  });

  it("has an empty screen with an Add button, and a no-match line for a search", () => {
    expect(board).toContain("No players yet");
    expect(board).toContain("Add a player");
    expect(board).toContain("No players match");
  });

  it("opens a player with a real button a keyboard can reach", () => {
    expect(board).toContain('type="button"');
    expect(board).toContain("aria-pressed");
  });
});

describe("the home menu already leads here (ADMIN-RE-17)", () => {
  const context = {
    role: "owner",
    canMutateContent: true,
    adminPortal: "reimagined",
  } as unknown as AdminRouteAccessContext;

  it("lists Team roster for a reimagined club and titles the page the same", () => {
    const rows = getVisibleAdminMoreRows(context);
    const row = rows.find((candidate) => candidate.id === "team-roster");
    expect(row?.href).toBe("/admin/roster");
    expect(row?.label).toBe("Team roster");
    expect(getReimaginedPageTitle("/admin/roster")).toBe("Team roster");
  });

  it("changes no migration and no tenant select", () => {
    const tenant = source("lib/club-context.ts");
    expect(tenant).not.toMatch(/admin_portal|admin_flags|time_zone/);
  });
});
