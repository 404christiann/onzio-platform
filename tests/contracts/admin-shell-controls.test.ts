import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = read("components/AdminShell.tsx");
const search = read("components/admin/AdminRouteSearch.tsx");

describe("protected admin shell controls", () => {
  it("contains only the approved header controls", () => {
    expect(shell).toContain("<AdminRouteSearch");
    expect(shell).toContain("<AdminThemeToggle");
    expect(shell).toContain("<AdminAccountMenu");
    expect(shell).not.toMatch(/Notification|BellIcon|Bell\b/);
  });

  it("builds search input only from already-visible routes", () => {
    expect(shell).toContain("getVisibleAdminRoutes(accessContext)");
    expect(shell).toContain("routes.map((route)");
    expect(shell).toContain("<AdminRouteSearch routes={searchRoutes}");
    expect(search).not.toContain("ADMIN_ROUTE_MANIFEST");
    expect(search).not.toContain("presentationTemplateKey");
    expect(search).not.toContain("ownerOnly");
  });

  it("supports keyboard search navigation and result announcements", () => {
    expect(search).toContain('event.key === "ArrowDown"');
    expect(search).toContain('event.key === "ArrowUp"');
    expect(search).toContain('event.key === "Enter"');
    expect(search).toContain('event.key === "Escape"');
    expect(search).toContain('aria-live="polite"');
    expect(search).toContain('role="combobox"');
    expect(search).toContain('role="listbox"');
  });

  it("keeps club branding primary and Onzio attribution quiet", () => {
    expect(shell).toContain("clubLogoUrl");
    expect(shell).toContain("{club.name}");
    expect(shell).toContain("Powered by");
    expect(shell).toContain("ONZIO");
    expect(shell).not.toContain("club.primaryColor");
    expect(shell).not.toContain("club.secondaryColor");
  });

  it("keeps grace editable and suspension read-only in its messaging", () => {
    expect(shell).toContain("Content editing remains available during the grace period.");
    expect(shell).toContain("Content changes are paused while billing is suspended.");
  });
});
