import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/AdminShell.tsx"),
  "utf8",
);

const WEBSITE_HREFS =
  'hrefs: ["/admin/homepage", "/admin/programs", "/admin/tryouts", "/admin/shop", "/admin/about", "/admin/sponsors", "/admin/contact"]';
const COMPETITION_HREFS =
  'hrefs: ["/admin/seasons", "/admin/roster", "/admin/schedule", "/admin/stats", "/admin/season-stats", "/admin/standings"]';
const CLUB_SETTINGS_HREFS = 'hrefs: ["/admin/branding", "/admin/members"]';

describe("admin sidebar grouped navigation", () => {
  it("declares exactly the three approved collapsible groups", () => {
    expect(source).toContain('label: "Website"');
    expect(source).toContain('label: "Competition"');
    expect(source).toContain('label: "Club Settings"');
    expect(source.match(/type: "group",/g)).toHaveLength(3);
  });

  it("keeps exact child membership and ordering per group", () => {
    expect(source).toContain(WEBSITE_HREFS);
    expect(source).toContain(COMPETITION_HREFS);
    expect(source).toContain(CLUB_SETTINGS_HREFS);
  });

  it("orders Dashboard, Website, Competition, Analytics, Club Settings, Payments", () => {
    const positions = [
      source.indexOf('{ type: "link", href: "/admin" }'),
      source.indexOf(WEBSITE_HREFS),
      source.indexOf(COMPETITION_HREFS),
      source.indexOf('{ type: "link", href: "/admin/analytics" }'),
      source.indexOf(CLUB_SETTINGS_HREFS),
      source.indexOf('{ type: "link", href: "/admin/payments" }'),
    ];
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("keeps Payments a standalone link outside every group", () => {
    expect(source).toContain('{ type: "link", href: "/admin/payments" }');
    const hrefsBlocks = source.match(/hrefs: \[[^\]]*\]/g) ?? [];
    expect(hrefsBlocks).toHaveLength(3);
    for (const block of hrefsBlocks) {
      expect(block).not.toContain("/admin/payments");
    }
  });

  it("preserves the authorization and entitlement filters", () => {
    expect(source).toContain('!item.ownerOnly || club.role === "owner"');
    expect(source).toContain('item.href !== "/admin/payments" || isBillingAdmin');
    expect(source).toMatch(
      /label: "Team access",\s*\n\s*href: "\/admin\/members",\s*\n\s*ownerOnly: true/,
    );
    expect(source).toContain('feature: "programs"');
    expect(source).toContain('feature: "contact"');
    expect(source).toContain('feature: "tryouts"');
  });

  it("hides a group whose visible children were all filtered out", () => {
    expect(source).toContain("if (children.length === 0) return null;");
  });

  it("renders real per-destination emblems, never bullets or dots", () => {
    expect(source).toContain("{item.icon}");
    expect(source).toContain("{group.icon}");
    expect(source).not.toContain("list-disc");
    expect(source).not.toContain("•");
  });

  // The requirement is unchanged — the active nav item is marked by an
  // accent-coloured icon plus a foreground-coloured label, with no filled
  // bar/pill treatment. Only the token carrying that accent moved: the admin
  // portal's brand accent is now `--brand` (#0eb547) rather than the borrowed
  // `--destructive` red, which is reserved for destructive/error states.
  it("keeps the active treatment icon-accent and label-white without a filled bar", () => {
    expect(source).toContain(
      'isActive(item.href) ? "text-brand" : "text-muted-foreground/60"',
    );
    expect(source).toContain("data-[active=true]:text-foreground");
    expect(source).toContain("data-[active=true]:bg-transparent");
    expect(source).not.toContain("border-l-destructive");
    expect(source).not.toContain("bg-destructive/15");
  });

  it("uses accessible native-button accordion headers", () => {
    expect(source).toContain('render={<button type="button" />}');
    expect(source).toContain("aria-expanded={isOpen}");
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain('role="region"');
    expect(source).toContain("aria-labelledby={headerId}");
    expect(source).toContain("hidden={!isOpen}");
    expect(source).toContain("`admin-nav-group-${group.key}`");
  });

  it("allows only one open group and resolves it from the active route", () => {
    expect(source.match(/setOpenGroupKey|openGroupKey/g)?.length).toBeGreaterThan(2);
    expect(source).toContain("(previous) => (previous === key ? null : key)");
    expect(source).toContain("setOpenGroupKey(groupKeyForPathname(pathname));");
    expect(source).toContain(
      "groupKeyForPathname(pathname)",
    );
    expect(source).toContain("if (options?.closesGroups) setOpenGroupKey(null);");
  });

  it("adds no desktop sidebar-collapse control", () => {
    expect(source).not.toContain("SidebarTrigger");
    expect(source).not.toContain("PanelLeftIcon");
  });

  it("keeps the mobile drawer contract intact", () => {
    expect(source).toContain("setSidebarOpen(false)");
    expect(source).toContain('aria-controls="admin-sidebar"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
  });
});
