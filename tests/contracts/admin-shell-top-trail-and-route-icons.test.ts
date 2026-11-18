import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_ICONS } from "@/components/admin/adminRouteIcons";
import { shellTopTrail } from "@/components/admin/shellTopTrail";

// RC-ADMIN-01b. The settled design is ONE page header with the breadcrumb: a page that
// renders a PageFrame owns the trail, so the shell top bar shows none.
describe("shell top bar trail", () => {
  const trail = ["Website", "Pages", "Stadium"];

  it("shows no trail when a PageFrame is registered, with or without a breadcrumb", () => {
    expect(shellTopTrail(trail, true)).toBe("none");
    expect(shellTopTrail(null, true)).toBe("none");
  });

  it("keeps today's top-bar breadcrumb, or the route label, on pages without a frame", () => {
    expect(shellTopTrail(trail, false)).toBe("breadcrumb");
    expect(shellTopTrail(null, false)).toBe("label");
  });

  const source = readFileSync(resolve(process.cwd(), "components/AdminShell.tsx"), "utf8");

  it("renders no trail element in the framed case and keeps the slot mounted", () => {
    expect(source).toContain("shellTopTrail(breadcrumb, pageHasFrame)");
    expect(source).toContain('topTrail === "none" ? null');
    expect(source).not.toContain("data-admin-top-trail");
    expect(source).toContain('<div className="hidden min-w-0 xl:block">');
    // The unframed breadcrumb and label are the ones that shipped before this package.
    expect(source).toContain('<nav aria-label="Breadcrumb">');
    expect(source).toContain('{currentRoute?.label ?? "Admin"}');
  });
});

describe("hub and sidebar route icons", () => {
  it("gives Chick-fil-A, Sponsors and Partners three distinct icons, none shared with another route", () => {
    const three = ["chick-fil-a", "sponsors", "partners"] as const;
    expect(new Set(three.map((key) => ROUTE_ICONS[key])).size).toBe(3);
    for (const key of three) {
      const sharedWith = Object.entries(ROUTE_ICONS)
        .filter(([other, icon]) => other !== key && icon === ROUTE_ICONS[key])
        .map(([other]) => other);
      expect(sharedWith, `${key} shares its icon with ${sharedWith.join(", ")}`).toEqual([]);
    }
  });
});
