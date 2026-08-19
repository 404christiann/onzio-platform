import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/Nav.tsx"),
  "utf8",
);

// crest@1's registered routes (packages/presentation/index.ts
// templateRegistry["crest@1"].defaultRoutes) are
// ["home", "club", "roster", "schedule", "store", "contact", "join"].
// Before the original contract, crest@1 fell through to the shared default
// `navLinks`, which rendered a dead Shop link and dropped Contact/Join (the
// registration entry point) from the nav entirely.
//
// CV United C1 shop scope: crest@1 gained a real kit/merch showcase page at
// /shop, gated on the operator-only onzio.clubs.store_enabled toggle (same
// mechanism editorial@1's EditorialHeader uses for its Store link) --
// crestNavLinks became a function of storeEnabled instead of a static array.
describe("crest@1 navigation links", () => {
  it("defines a dedicated crest@1 link set, gated on presentationTemplateKey and storeEnabled", () => {
    expect(source).toContain('club.presentationTemplateKey === "crest@1"');
    expect(source).toContain("crestNavLinks(club.storeEnabled)");
    expect(source).toMatch(
      /function crestNavLinks\(storeEnabled: boolean\): NavLink\[\] \{/,
    );
  });

  it("always exposes Home, Roster, About, Schedule, Contact, Join for crest@1, with Shop pushed conditionally", () => {
    const match = source.match(
      /function crestNavLinks\(storeEnabled: boolean\): NavLink\[\] \{([\s\S]*?)\n\}/,
    );
    expect(match).not.toBeNull();
    const block = match![1];

    const hrefs = [...block.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      "/",
      "/roster",
      "/club/about",
      "/schedule",
      "/shop",
      "/contact",
      "/join",
    ]);

    const labels = [...block.matchAll(/label:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual([
      "Home",
      "Roster",
      "About",
      "Schedule",
      "Shop",
      "Contact",
      "Join",
    ]);

    // Shop must be conditional on storeEnabled, not unconditional like the
    // other five links.
    expect(block).toMatch(
      /if \(storeEnabled\) \{\s*\n\s*links\.push\(\{ label: "Shop", href: "\/shop" \}\);\s*\n\s*\}/,
    );
  });

  it("leaves the academy@1 and clubhouse@1 link sets untouched", () => {
    // academy@1: still built from academyNavLinks(programs), still keeps its
    // own Store/Contact entries -- unchanged by the crest@1 branch.
    expect(source).toContain("function academyNavLinks(programs: ProgramContent[]): NavLink[] {");
    expect(source).toContain('{ label: "Store", href: "/shop" }');
    expect(source).toContain('{ label: "Contact", href: "/contact" }');

    // clubhouse@1: still its own early-return branch using lionsNavLinks,
    // unaffected by the activeNavLinks ternary the crest@1 branch was added
    // to (clubhouse@1 returns before that line is ever reached).
    expect(source).toContain('club.presentationTemplateKey === "clubhouse@1"');
    expect(source).toContain("const lionsNavLinks: NavLink[] = [");
  });

  it("leaves the shared default navLinks (cinematic@1/heritage@1 fallback) untouched", () => {
    const match = source.match(/const navLinks: NavLink\[\] = \[([\s\S]*?)\n\];/);
    expect(match).not.toBeNull();
    const block = match![1];
    expect(block).toContain('{ label: "Home", href: "/" }');
    expect(block).toContain('{ label: "Roster", href: "/roster" }');
    expect(block).toContain('{ label: "Shop", href: "/shop" }');
    expect(block).toContain("Club");
  });
});
