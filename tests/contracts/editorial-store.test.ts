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

  it("reads the shop surface on the homepage too, which is why the admin hides the home surface", () => {
    // Lions' homepage teaser reads the SAME rows as /shop. The separate "home"
    // surface dataset is therefore unreachable for editorial@1, so the Shop
    // admin hides that surface tab entirely. If this ever starts fetching
    // "home", the admin hide must be reverted alongside it.
    const source = stripComments(read("components/editorial/EditorialHomeStore.tsx"));
    expect(source).toContain('fetchShopKitVariants("shop", club.id)');
    expect(source).not.toContain('fetchShopKitVariants("home"');
    // academy@1's equivalent teaser does read the home surface, so DCFC's
    // Home Page tab stays live.
    const academy = stripComments(read("components/AcademyHomeShopFeature.tsx"));
    expect(academy).toContain('fetchShopKitVariants("home", clubId)');
  });

  it("carries every non-blank photo for a variant, not just the first one", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain(
      "const photos = (variantContent.photos ?? []).filter(",
    );
    expect(source).toContain("return [{ variant, section, photos }];");
    // The old single-photo contract silently discarded photos[1..n].
    expect(source).not.toContain("photo: photos[0] ?? null");
    expect(source).not.toContain("selectedProduct.photo.url");
  });

  it("renders the approved heading, jersey tabs, single product, and photo fallback", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain('className="store-collection-label"');
    expect(source).toContain("Official {collectionName} collection");
    expect(source).toContain('identity?.shortName?.replace(/\\s+FC$/i, "").trim() || "Club"');
    expect(source).toContain("Make it yours!");
    expect(source).toContain(
      "Pick your colors, then finish sizing and checkout with our official",
    );
    expect(source).toContain('className="store-kit-tabs"');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("aria-selected={selectedProduct.variant === product.variant}");
    expect(source).toContain("setSelectedVariant(product.variant)");
    expect(source).toContain('className="store-product"');
    expect(source).toContain('className="store-product-visual"');
    expect(source).toContain('className="store-product-details"');
    expect(source).toContain("products.map(");
    expect(source).toContain("store-product-image-empty");
  });

  it("keeps the selected product and vendor handoff driven by admin-authored content", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain('useState<ShopKitVariant>("home")');
    expect(source).toContain(
      "products.find((product) => product.variant === selectedVariant) ?? products[0]",
    );
    expect(source).toContain("selectedProduct.section.title");
    expect(source).toContain("selectedProduct.section.description");
    expect(source).toContain("selectedProduct.section.cta_link");
    expect(source).toContain('className="store-vendor-button"');
    expect(source).toContain("Shop with our vendor");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).not.toMatch(/\$[0-9]|Select size|Add to Cart|store-service-strip|store-product-grid|store-product-card|→|↗/i);
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
    expect(css).toContain("STORE (Lions E6) — approved vendor handoff");
    expect(css).toContain('[data-site-template="editorial"] .store-heading {');
    expect(css).toContain('[data-site-template="editorial"] .store-kit-tab[aria-selected="true"] {');
    expect(css).toContain('[data-site-template="editorial"] .store-product {');
    expect(css).toContain('[data-site-template="editorial"] .store-vendor-button {');
    expect(css).toContain("@media (max-width: 1120px)");
    expect(css).toContain(
      "--store-product-stage: clamp(560px, 72svh, 760px);",
    );
    expect(css).toMatch(
      /\.store-product-visual \{[^}]*min-height: var\(--store-product-stage\);/,
    );
    expect(css).toMatch(
      /\.store-product-image \{[^}]*height: var\(--store-product-stage\);/,
    );
  });
});

describe("editorial store kit photo slideshow", () => {
  const componentPath = "components/editorial/EditorialShopKitSlideshow.tsx";

  it("keeps the single-photo case a plain static image with no slideshow markup", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    // Exactly one photo -> the same <ResilientImage fill priority> as before.
    expect(source).toMatch(
      /\) : selectedProduct\.photos\[0\] \? \(\s*\n\s*<ResilientImage\s*\n\s*src=\{selectedProduct\.photos\[0\]\.url\}/,
    );
    expect(source).toContain("alt={selectedProduct.section.title}");
    expect(source).toContain('sizes="(max-width: 1120px) 100vw, 62vw"');
    expect(source).toContain('imageDeliveryProps("shop-photo")');
    // Zero photos still falls back to the dashed placeholder.
    expect(source).toContain(
      '<span className="store-product-image-empty" aria-hidden="true" />',
    );
  });

  it("renders the slideshow only when a variant has more than one photo", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    expect(source).toContain(
      'import EditorialShopKitSlideshow from "@/components/editorial/EditorialShopKitSlideshow";',
    );
    expect(source).toMatch(/\{selectedProduct\.photos\.length > 1 \? \(/);
    expect(source).toContain("<EditorialShopKitSlideshow");
    expect(source).toContain("photos={selectedProduct.photos}");
  });

  it("resets to the first photo and restarts autoplay when the kit tab changes", () => {
    const source = stripComments(read("components/editorial/EditorialShopPage.tsx"));
    // Remounting on the variant key is what drops the previous variant's
    // slide index and starts a fresh interval.
    expect(source).toMatch(
      /<EditorialShopKitSlideshow\s*\n\s*key=\{selectedProduct\.variant\}/,
    );
  });

  it("mirrors the matchday gallery's timing, cross-fade, counter, arrows, and dashes", () => {
    const source = read(componentPath);
    expect(source).toContain('"use client"');
    expect(source).toContain("SHOP_SLIDE_DURATION = 4000");
    expect(source).toContain("window.setInterval");
    expect(source).toMatch(
      /if \(\s*photos\.length < 2 \|\|\s*paused \|\|\s*window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\s*\)\s*\{\s*\n\s*return;/,
    );
    expect(source).toContain("onMouseEnter={() => setPaused(true)}");
    expect(source).toContain("onMouseLeave={() => setPaused(false)}");
    expect(source).toContain("onFocusCapture={() => setPaused(true)}");
    expect(source).toContain("onBlurCapture={() => setPaused(false)}");
    expect(source).toContain('aria-label="Previous kit photo"');
    expect(source).toContain('aria-label="Next kit photo"');
    expect(source).toContain("selectSlide(index)");
    expect(source).toContain('String(safeCurrent + 1).padStart(2, "0")');
    expect(source).toContain('String(photos.length).padStart(2, "0")');
    expect(source).toContain("{photos.map((photo, index) => (");
    expect(source).not.toMatch(/photos\s*\.(sort|reverse)\(/);
    expect(source).toContain("if (photos.length === 0) return null;");
  });

  it("uses its own store-scoped class names, never the homepage matchday ones", () => {
    const source = read(componentPath);
    expect(source).toContain('className="store-product-slideshow"');
    expect(source).toContain('className="store-product-slides"');
    expect(source).toContain('className="store-product-slide"');
    expect(source).toContain('className="store-product-slideshow-controls"');
    expect(source).toContain('className="store-product-slideshow-arrows"');
    expect(source).toContain('className="store-product-slideshow-count"');
    expect(source).toContain('className="store-product-slideshow-progress"');
    expect(source).not.toMatch(/className="matchday-/);
  });

  it("adds scoped slideshow CSS that stays inside the existing product stage", () => {
    const css = read("styles/editorial.css");
    expect(css).toMatch(
      /\[data-site-template="editorial"\] \.store-product-slideshow,\s*\n\[data-site-template="editorial"\] \.store-product-slides,\s*\n\[data-site-template="editorial"\] \.store-product-slide \{\s*\n\s*position: absolute;\s*\n\s*inset: 0;/,
    );
    expect(css).toMatch(
      /\.store-product-slide \{\s*\n\s*opacity: 0;\s*\n\s*transition: opacity 0\.9s ease;/,
    );
    expect(css).toContain(
      '[data-site-template="editorial"] .store-product-slide[data-active="true"] {',
    );
    expect(css).toContain(
      '[data-site-template="editorial"] .store-product-slideshow-controls {',
    );
    expect(css).toContain(
      '[data-site-template="editorial"] .store-product-slideshow-progress button[data-active="true"] {',
    );
    // The store slideshow must not borrow the full-bleed matchday sizing, and
    // the matchday rules must not gain a store selector.
    expect(css).not.toMatch(/\.store-product-slide[a-z-]*[^{}]*\{[^}]*82svh/);
    // No selector anywhere pairs a matchday class with a store class, in
    // either direction, so neither slideshow can restyle the other.
    for (const [, selector] of stripComments(css).matchAll(/([^{}]+)\{/g)) {
      expect(
        selector.includes(".matchday-") &&
          selector.includes(".store-product-slide"),
      ).toBe(false);
    }
  });

  it("keeps the admin preview honest by rendering the same slideshow component", () => {
    const source = stripComments(read("components/admin/ScaledShopKitPreview.tsx"));
    expect(source).toContain(
      'import EditorialShopKitSlideshow from "@/components/editorial/EditorialShopKitSlideshow";',
    );
    expect(source).toContain(
      "const visiblePhotos = photos.filter((item) => item.url.trim().length > 0);",
    );
    expect(source).toMatch(/\{visiblePhotos\.length > 1 \? \(/);
    expect(source).toContain("<EditorialShopKitSlideshow");
    expect(source).toContain("photos={visiblePhotos}");
    expect(source).toMatch(
      /\) : visiblePhotos\[0\] \? \(\s*\n\s*<ResilientImage\s*\n\s*src=\{visiblePhotos\[0\]\.url\}/,
    );
    expect(source).toContain(
      '<span className="store-product-image-empty" aria-hidden="true" />',
    );
    // Still gated on editorial@1's shop surface only.
    expect(source).toContain(
      'club.presentationTemplateKey === "editorial@1" && section.surface === "shop"',
    );
  });

  it("never touches academy@1's shop rendering", () => {
    const academy = read("components/AcademyShopPage.tsx");
    expect(academy).not.toMatch(/EditorialShopKitSlideshow|store-product-slide/);
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
