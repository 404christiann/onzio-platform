import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CV United C1 shop scope: crest@1 gained a real /shop route -- a kit/merch
 * showcase page (photos, a kit variant toggle, purchase-details info), not
 * real e-commerce (no cart, no in-app checkout, no inventory). Like
 * editorial@1's Store link (see tests/contracts/editorial-store.test.ts),
 * it's gated on the operator-only onzio.clubs.store_enabled toggle
 * (lib/club-context.ts's ClubContext.storeEnabled): the nav/footer only
 * render the link when it's on, AND the route itself independently 404s
 * when it's off, so a directly-typed /shop URL can't bypass the toggle.
 * crest@1's own nav gating is covered by tests/contracts/crest-nav-links.test.ts;
 * this file covers the route dispatch and the footer.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("crest@1 shop route gating (app/(public)/shop/page.tsx)", () => {
  const source = read("app/(public)/shop/page.tsx");

  it("adds a crest@1 branch after the editorial@1 branch, gated on club.storeEnabled with notFound()", () => {
    const editorialIndex = source.indexOf('"editorial@1"');
    const crestIndex = source.indexOf('"crest@1"');
    expect(editorialIndex).toBeGreaterThan(-1);
    expect(crestIndex).toBeGreaterThan(editorialIndex);

    // Same gating text as editorial@1's branch immediately above it.
    const crestBranch = source.slice(crestIndex);
    expect(crestBranch).toContain("if (!club.storeEnabled) return notFound();");
  });

  it("renders the shared Shop* component stack, wrapped in the crest@1 theme scope", () => {
    const crestIndex = source.indexOf('"crest@1"');
    const crestBranch = source.slice(crestIndex);
    expect(crestBranch).toContain('className="crest-home pt-24 sm:pt-28"');
    expect(crestBranch).toContain("<ShopKitSectionContainer");
    expect(crestBranch).toContain("<ShopPhotoStripContainer");
    expect(crestBranch).toContain("<ShopPurchaseDetailsContainer />");
  });

  it("aliases the shared Shop* components' base color tokens to crest@1's own theme, reusing existing --crest-* values instead of inventing new ones", () => {
    const crestIndex = source.indexOf('"crest@1"');
    const crestBranch = source.slice(crestIndex);
    expect(crestBranch).toContain('"--color-white" as string]: "var(--crest-surface-canvas)"');
    expect(crestBranch).toContain('"--color-black" as string]: "var(--crest-surface-inverse)"');
    expect(crestBranch).toContain('"--color-red" as string]: "var(--crest-action-primary)"');
    expect(crestBranch).toContain(
      '"--color-red-dark" as string]: "var(--crest-action-primary-hover)"',
    );
    expect(crestBranch).toContain('"--color-gray-mid" as string]: "var(--crest-text-muted)"');
  });

  it("leaves the clubhouse@1, academy@1, editorial@1, and legacy Rose City branches byte-identical", () => {
    expect(source).toContain(
      'if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseShopPage />;',
    );
    expect(source).toContain(
      'if (club.presentationTemplateKey === "academy@1") return <AcademyShopPage />;',
    );
    expect(source).toContain("return <EditorialShopPage />;");
    expect(source).toContain(
      '<div className="pt-24 sm:pt-28" style={{ backgroundColor: "var(--color-white)" }}>',
    );
  });
});

describe("crest@1 footer shop link gating (components/Footer.tsx)", () => {
  const source = read("components/Footer.tsx");

  it("gates crest@1's footer Shop link on club.storeEnabled via a dedicated crestFooterLinks helper", () => {
    expect(source).toMatch(/function crestFooterLinks\(storeEnabled: boolean\)/);
    expect(source).toContain("crestFooterLinks(club.storeEnabled)");
    expect(source).toContain('club.presentationTemplateKey === "crest@1"');

    const match = source.match(
      /function crestFooterLinks\(storeEnabled: boolean\) \{([\s\S]*?)\n\}/,
    );
    expect(match).not.toBeNull();
    const block = match![1];
    expect(block).toContain("storeEnabled");
    expect(block).toContain("footerLinks");
    expect(block).toMatch(/filter\(\(link\) => link\.label !== "Shop"\)/);
  });

  it("leaves the shared footerLinks array and cinematic@1/heritage@1's unconditional Shop link untouched", () => {
    const match = source.match(/const footerLinks = \[([\s\S]*?)\n\];/);
    expect(match).not.toBeNull();
    const block = match![1];
    expect(block).toContain('{ label: "Shop", href: "/shop" }');
  });

  it("leaves the academy@1 and clubhouse@1 footer branches untouched", () => {
    expect(source).toContain("const academyFooterLinks = [");
    expect(source).toContain('club.presentationTemplateKey === "clubhouse@1"');
  });
});

describe("crest@1 club-context storeEnabled wiring (verification only, not re-implemented here)", () => {
  it("ClubContext carries storeEnabled: boolean, sourced from onzio.clubs.store_enabled (shared with editorial@1)", () => {
    const source = read("lib/club-context.ts");
    expect(source).toContain("storeEnabled: boolean;");
    expect(source).toContain("store_enabled");
  });
});

describe("crest@1 route registry (packages/presentation/index.ts)", () => {
  const source = read("packages/presentation/index.ts");

  it("registers 'store' additively on crest@1's defaultRoutes and supportedRoutes", () => {
    expect(source).toContain(
      'defaultRoutes: ["home", "club", "roster", "schedule", "store", "contact", "join"],',
    );
    expect(source).toContain(
      'supportedRoutes: ["home", "club", "roster", "schedule", "store", "contact", "join"],',
    );
  });

  it("leaves every other template's defaultRoutes/supportedRoutes untouched", () => {
    expect(source).toContain(
      'defaultRoutes: ["home", "roster", "schedule", "club", "club-logo", "store"],',
    );
    expect(source).toContain('defaultRoutes: ["home", "roster", "schedule", "store"],');
    expect(source).toContain(
      'defaultRoutes: ["home", "roster", "schedule", "club", "programs", "store", "contact"],',
    );
    expect(source).toContain(
      'defaultRoutes: ["home", "club", "roster", "schedule", "tryouts", "store", "contact"],',
    );
  });
});

describe("CV United seed script (scripts/seed-cv-united.ts)", () => {
  const source = read("scripts/seed-cv-united.ts");

  it("explicitly sets store_enabled = true on the clubs insert and upsert clause", () => {
    expect(source).toMatch(/store_enabled,?\s*\n\s*created_at, updated_at, archived_at/);
    expect(source).toContain("store_enabled = excluded.store_enabled,");
  });
});
