import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lions E6: editorial@1's public store page (/shop) and the operator-only
 * onzio.clubs.store_enabled toggle it's gated on.
 *
 * Same house convention as tests/contracts/editorial-home.test.ts: no JSX
 * transform in vitest.config.ts (no other contract test in this repo
 * renders a .tsx component either), so this file is entirely source-scan /
 * string-assertion based rather than rendering components.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

describe("shop page dispatch wiring", () => {
  it("adds an editorial@1 branch above clubhouse@1/academy@1, gated on club.storeEnabled with notFound()", () => {
    const source = read("app/(public)/shop/page.tsx");
    const clubhouseIndex = source.indexOf('"clubhouse@1"');
    const academyIndex = source.indexOf('"academy@1"');
    const editorialIndex = source.indexOf('"editorial@1"');

    expect(clubhouseIndex).toBeGreaterThan(-1);
    expect(academyIndex).toBeGreaterThan(clubhouseIndex);
    expect(editorialIndex).toBeGreaterThan(academyIndex);

    expect(source).toContain('import { notFound } from "next/navigation";');
    expect(source).toContain(
      'import EditorialShopPage from "@/components/editorial/EditorialShopPage";',
    );
    expect(source).toContain("if (!club.storeEnabled) return notFound();");
    expect(source).toContain("return <EditorialShopPage />;");
  });

  it("leaves the clubhouse@1, academy@1, and legacy Rose City branches byte-identical", () => {
    const source = read("app/(public)/shop/page.tsx");

    expect(source).toContain(
      'if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseShopPage />;',
    );
    expect(source).toContain(
      'if (club.presentationTemplateKey === "academy@1") return <AcademyShopPage />;',
    );

    // Legacy Rose City fallback JSX, unchanged.
    expect(source).toContain('<div className="pt-24 sm:pt-28" style={{ backgroundColor: "var(--color-white)" }}>');
    expect(source).toContain("<ShopKitSectionContainer");
    expect(source).toContain("<ShopPhotoStripContainer");
    expect(source).toContain("<ShopPurchaseDetailsContainer />");
  });
});

describe("editorial store page", () => {
  it("self-fetches every configured kit variant via fetchShopKitVariants(\"shop\", clubId)", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain('"use client"');
    expect(source).toContain("useClubId()");
    expect(source).toContain('fetchShopKitVariants("shop", clubId)');
    expect(source).toContain('VARIANT_ORDER: ShopKitVariant[] = ["home", "away", "third"]');
    expect(source).toContain("setContent(variants)");
    expect(source).toContain("content?.[variant]");
  });

  it("reuses lib/shop-kit.ts's normalizers instead of reimplementing them", () => {
    const source = read("components/editorial/EditorialShopPage.tsx");
    expect(source).toContain(
      'import {\n  normalizeKitBulletPoints,\n  normalizeKitStoreNote,\n} from "@/lib/shop-kit";',
    );
    expect(source).toContain("normalizeKitBulletPoints(section.bullet_points)");
    expect(source).toContain("normalizeKitStoreNote(section.store_note)");
  });

  it("renders the approved campaign, three-variant catalog, and photo fallback", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain('className="store-campaign"');
    expect(source).toContain('className="store-featured-product"');
    expect(source).toContain('className="store-product-grid"');
    expect(source).toContain('className="store-product-card"');
    expect(source).toContain("products.map(");
    expect(source).toContain("store-product-image-empty");
  });

  it("keeps product links and the service strip driven by admin-authored content", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain("section.cta_link");
    expect(source).toContain("section.cta_label");
    expect(source).toContain('className="store-service-strip"');
    expect(source).toContain("featured.bulletPoints[0]");
    expect(source).toContain("featured.storeNote");
    expect(source).not.toMatch(/\$[0-9]|checkout|Select size/i);
  });

  it("has a loading state, following AcademyShopPage.tsx's pattern", () => {
    const source = read("components/editorial/EditorialShopPage.tsx");
    expect(source).toContain("const [loading, setLoading] = useState(true);");
    expect(source).toMatch(/if \(loading\) \{/);
  });

  it("styles from editorial's own CSS custom properties, never AcademyShopPage.tsx's hardcoded navy/red hex values", () => {
    const source = read("components/editorial/EditorialShopPage.tsx");
    expect(source).not.toMatch(/#1E3653|#FF1616|#F9FAFD|#B9E3F6/);
    expect(source).not.toMatch(/className="[^"]*\b(bg-|text-|font-display|font-nav)/);
  });

  it("appends its rules to styles/editorial.css, scoped under [data-site-template=\"editorial\"]", () => {
    const css = read("styles/editorial.css");
    expect(css).toContain("STORE (Lions E6)");
    expect(css).toContain('[data-site-template="editorial"] .store-campaign {');
    expect(css).toContain('[data-site-template="editorial"] .store-product-card {');
    expect(css).toContain('[data-site-template="editorial"] .store-service-strip {');
  });
});

describe("club-context and header wiring from E3 (verification only, not re-implemented here)", () => {
  it("ClubContext carries storeEnabled: boolean, sourced from onzio.clubs.store_enabled", () => {
    const source = read("lib/club-context.ts");
    expect(source).toContain("storeEnabled: boolean;");
    expect(source).toContain("store_enabled");
  });

  it("EditorialHeader omits the Store nav item when storeEnabled is false", () => {
    const source = read("components/editorial/EditorialHeader.tsx");
    expect(source).toContain("storeEnabled");
    expect(source).toMatch(/if \(storeEnabled\)/);
  });
});

describe("store_enabled backfill safety", () => {
  it("E1's migration unconditionally backfills every existing club to store_enabled = true", () => {
    const migration = read(
      "supabase/migrations/20260812120200_club_store_enabled.sql",
    );
    expect(migration).toContain(
      "alter table onzio.clubs\n  add column store_enabled boolean not null default false;",
    );
    // The unconditional backfill (no WHERE clause) is what proves no
    // pre-existing club silently loses its store when this column lands.
    expect(migration).toMatch(/^update onzio\.clubs set store_enabled = true;$/m);
  });
});

describe("operator script: scripts/set-club-store-enabled.ts", () => {
  it("is dry-run by default and requires --execute to write", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain("execute: flags.has(\"--execute\")");
    expect(source).toContain("if (!execute) {");
    expect(source).toMatch(/Dry run only[\s\S]*no write performed/);
  });

  it("guards non-loopback targets with a --confirm-project=<ref> refusal, mirroring set-diverse-city-live-price.ts", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain("LOOPBACK_HOSTS");
    expect(source).toContain("isLoopback");
    expect(source).toContain("--confirm-project=");
    expect(source).toMatch(/Refusing non-local write without --confirm-project=/);
  });

  it("parses club slug plus --enable/--disable and refuses when both or neither are given", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain('flags.has("--enable")');
    expect(source).toContain('flags.has("--disable")');
    expect(source).toContain("Pass exactly one of --enable or --disable");
  });

  it("updates onzio.clubs.store_enabled via the service-role client and reconciles the write", () => {
    const source = read("scripts/set-club-store-enabled.ts");
    expect(source).toContain(".schema(\"onzio\")");
    expect(source).toContain('.update({ store_enabled: enabled })');
    expect(source).toContain("Reconciliation failed: store_enabled did not persist as expected");
  });

  it("is never imported or referenced from any app/ route file (standalone CLI tool only)", () => {
    const appFiles = listFilesRecursively(resolve(process.cwd(), "app")).filter(
      (path) => /\.(tsx?|jsx?)$/.test(path),
    );
    for (const file of appFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/set-club-store-enabled/);
    }
  });
});
