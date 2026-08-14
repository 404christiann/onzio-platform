import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const ADMIN_SHELL = "components/AdminShell.tsx";
const PROGRAMS_ADMIN = "app/admin/(protected)/programs/page.tsx";
const ABOUT_ADMIN = "app/admin/(protected)/about/page.tsx";
const ANALYTICS_ADMIN = "app/admin/(protected)/analytics/page.tsx";
const HOMEPAGE_ADMIN = "app/admin/(protected)/homepage/page.tsx";
const SHOP_ADMIN = "app/admin/(protected)/shop/page.tsx";
const SPONSORS_ADMIN = "app/admin/(protected)/sponsors/page.tsx";
const CONTACT_ADMIN = "app/admin/(protected)/contact/page.tsx";
const ROSTER_ADMIN = "app/admin/(protected)/roster/page.tsx";
const SCHEDULE_ADMIN = "app/admin/(protected)/schedule/page.tsx";
const TRYOUTS_ADMIN = "app/admin/(protected)/tryouts/page.tsx";

const EDITORIAL_GATE = 'presentationTemplateKey === "editorial@1"';
const ACADEMY_GATE = 'presentationTemplateKey === "academy@1"';

/**
 * Lions FC (editorial@1) hides admin surfaces its public template never
 * renders. Every hide is template-scoped (presentationTemplateKey), never
 * tenant-scoped, and every hide extends an existing academy@1 gate with OR —
 * so Diverse City's (academy@1) admin behavior is bit-for-bit unchanged. The
 * assertions below pin both halves: hidden for editorial@1, intact for
 * academy@1 and the default templates.
 */
describe("editorial@1 admin surface hides", () => {
  describe("nav: Programs, About, Analytics dropped for editorial@1 only", () => {
    it("filters exactly the three dead hrefs behind the editorial template check", () => {
      const shell = source(ADMIN_SHELL);
      expect(shell).toContain(
        `const isEditorialTemplate = club.${EDITORIAL_GATE};`,
      );
      expect(shell).toContain(
        'const EDITORIAL_HIDDEN_HREFS = ["/admin/programs", "/admin/about", "/admin/analytics"];',
      );
      expect(shell).toContain(
        "(!isEditorialTemplate || !EDITORIAL_HIDDEN_HREFS.includes(item.href))",
      );
    });

    it("adds no academy@1 nav filtering — DCFC's nav is untouched", () => {
      const shell = source(ADMIN_SHELL);
      // The nav filter must reference only the editorial template; academy@1
      // never had nav items removed and must not gain a filter here.
      expect(shell).not.toContain(`isAcademy`);
      expect(count(shell, EDITORIAL_GATE)).toBe(1);
    });
  });

  describe("route guards: direct URL access redirects editorial@1 to /admin", () => {
    for (const [name, path] of [
      ["programs", PROGRAMS_ADMIN],
      ["about", ABOUT_ADMIN],
      ["analytics", ANALYTICS_ADMIN],
    ] as const) {
      it(`${name} page redirects editorial@1 and renders null while doing so`, () => {
        const page = source(path);
        expect(page).toContain(
          `const isEditorialTemplate = club.${EDITORIAL_GATE};`,
        );
        expect(page).toContain(
          'if (isEditorialTemplate) router.replace("/admin");',
        );
        expect(page).toContain("if (isEditorialTemplate) return null;");
      });

      it(`${name} page guard is template-scoped and leaves academy@1 alone`, () => {
        const page = source(path);
        // The guard keys off editorial@1 only — academy@1 (and every other
        // template) must still reach the page exactly as before.
        expect(page).not.toContain(`if (isAcademy) router.replace`);
        expect(page).not.toContain('=== "academy@1") router.replace');
      });
    }
  });

  describe("homepage admin: Behind the Rose hidden for editorial@1", () => {
    it("filters 'behind' out of the tab order itself, not just the rendered tabs", () => {
      const page = source(HOMEPAGE_ADMIN);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain(
        'ADMIN_TAB_ORDER.filter((tab) => tab !== "behind")',
      );
      // Slide-direction indexing must use the filtered order so active-tab
      // state can never desync from the rendered tabs.
      expect(page).toContain(
        "tabOrder.indexOf(next) > tabOrder.indexOf(current)",
      );
      expect(page).not.toContain("ADMIN_TAB_ORDER.indexOf(next)");
    });

    it("skips behind-the-rose validation, save, and preview for editorial@1", () => {
      const page = source(HOMEPAGE_ADMIN);
      expect(page).toContain(
        "const hidesBehindTheRoseSection = hidesLegacyHomepageSections || isEditorial;",
      );
      expect(page).toContain("!hidesBehindTheRoseSection &&");
      expect(page).toContain("if (!hidesBehindTheRoseSection) {");
      expect(page).toContain("{!isEditorial && behindFields.visible && (");
      expect(page).toContain('(!isEditorial || tab.id !== "behind")');
    });

    it("keeps academy@1's legacy-section gate and the behind upsert intact", () => {
      const page = source(HOMEPAGE_ADMIN);
      // academy@1's own gate is unchanged and stays academy-only…
      expect(page).toContain(`club.${ACADEMY_GATE}`);
      expect(page).toContain(
        '(!hidesLegacyHomepageSections ||\n                    (tab.id !== "slideshow" && tab.id !== "behind"))',
      );
      // …and the hide is not a deletion: default templates still upsert.
      expect(page).toContain('.from("behind_the_rose_section")');
      expect(page).toContain('.from("homepage_slideshow_settings")');
    });
  });

  describe("shop admin: Photo Row and Purchase tabs hidden for editorial@1", () => {
    it("filters both tabs out of the tab order used for slide direction", () => {
      const page = source(SHOP_ADMIN);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain(
        '(tab) => tab !== "photoStrip" && tab !== "purchase",',
      );
      expect(page).toContain(
        "tabOrder.indexOf(next) > tabOrder.indexOf(current)",
      );
      expect(page).not.toContain("ADMIN_TAB_ORDER.indexOf(next)");
    });

    it("hides the rendered tabs and the photo-row editor for editorial@1", () => {
      const page = source(SHOP_ADMIN);
      expect(page).toContain(
        '(selectedSurface === "shop" &&\n                      !hidesClubhouseShopSections &&\n                      !isEditorial)',
      );
      expect(page).toContain(
        '{selectedSurface === "shop" &&\n              activeTab !== "purchase" &&\n              !hidesClubhouseShopSections &&\n              !isEditorial && (',
      );
    });

    it("leaves the kit-variant machinery untouched — Lions keeps home/away/third", () => {
      const page = source(SHOP_ADMIN);
      // kitVariants is still gated only by the academy@1 clubhouse-sections
      // flag; editorial@1 must keep all three variants.
      expect(page).toContain(
        'const kitVariants = hidesClubhouseShopSections\n    ? KIT_VARIANTS.filter((variant) => variant.id === "home")\n    : KIT_VARIANTS;',
      );
      // And academy@1's own gate is unchanged.
      expect(page).toContain(`club.${ACADEMY_GATE}`);
    });
  });

  describe("sponsors admin: footer placement hidden for editorial@1", () => {
    it("extends the academy gate with OR — academy@1 branch unchanged", () => {
      const page = source(SPONSORS_ADMIN);
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain(
        "const hidesSponsorFooterTab = isAcademy || isEditorial;",
      );
      expect(page).toContain("{!hidesSponsorFooterTab && (");
      // The carousel placement itself stays for every template.
      expect(page).toContain('{ id: "carousel" as const, label: "Carousel" }');
    });
  });

  describe("contact admin: hero-image field hidden for editorial@1", () => {
    it("extends the academy gate with OR — academy@1 branch unchanged", () => {
      const page = source(CONTACT_ADMIN);
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain(
        "const hidesHeroImageField = isAcademy || isEditorial;",
      );
      expect(page).toContain("{!hidesHeroImageField && (");
    });
  });

  describe("roster admin: inline season-stat panel hidden for editorial@1", () => {
    it("keeps the gate template-scoped and academy@1 included as before", () => {
      const page = source(ROSTER_ADMIN);
      expect(page).toContain(
        `const hidesInlineSeasonStats =\n    club.${ACADEMY_GATE} ||\n    club.${EDITORIAL_GATE};`,
      );
    });
  });

  describe("schedule admin: match sponsor fields hidden for editorial@1", () => {
    it("extends the academy gate with OR in both components", () => {
      const page = source(SCHEDULE_ADMIN);
      // SchedulePage and MatchForm each declare the combined gate.
      expect(
        count(page, "const hidesMatchSponsorFields = isAcademy || isEditorial;"),
      ).toBe(2);
      expect(count(page, `const isAcademy = club.${ACADEMY_GATE};`)).toBe(2);
    });

    it("gates the sponsor copy-forward, list display, and form fields", () => {
      const page = source(SCHEDULE_ADMIN);
      expect(page).toContain(
        "hidesMatchSponsorFields ? {} : carrySponsorFromLatestMatch(list, seasonId)",
      );
      expect(page).toContain("{!hidesMatchSponsorFields && m.sponsor_logo_url && (");
      expect(page).toContain("{!hidesMatchSponsorFields && (");
      // No call site may bypass the gated helper.
      expect(page).not.toContain(
        "...carrySponsorFromLatestMatch(matches, selectedSeasonId)",
      );
    });

    it("keeps sponsor persistence intact — a template switch restores the data", () => {
      const page = source(SCHEDULE_ADMIN);
      expect(page).toContain("sponsor_name: editForm.sponsor_name");
      expect(page).toContain("sponsor_logo_url: editForm.sponsor_logo_url");
      expect(page).toContain("sponsor_link: editForm.sponsor_link");
      expect(page).toContain("SponsorLogoUpload");
    });
  });

  describe("tryouts admin: program association and hero image hidden for editorial@1", () => {
    it("uses the inverted gate consistently — academy@1 evaluates as before", () => {
      const page = source(TRYOUTS_ADMIN);
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      // !isAcademy && !isEditorial is false for academy@1 exactly where the
      // old !isAcademy was false; default templates stay true.
      expect(page).toContain(
        "const showsProgramAndHeroFields = !isAcademy && !isEditorial;",
      );
      // Both hidden blocks (program association, hero image) use the gate,
      // and no stray !isAcademy-only render gate remains.
      expect(count(page, "{showsProgramAndHeroFields && (")).toBe(2);
      expect(page).not.toContain("{!isAcademy && (");
    });

    it("keeps the hero upload pipeline intact for the templates that use it", () => {
      const page = source(TRYOUTS_ADMIN);
      expect(page).toContain("heroInput");
      expect(page).toContain("hero_media_asset_id");
    });
  });

  describe("no gate is tenant-scoped", () => {
    it("hides key off presentationTemplateKey, never a club id or slug", () => {
      for (const path of [
        ADMIN_SHELL,
        PROGRAMS_ADMIN,
        ABOUT_ADMIN,
        ANALYTICS_ADMIN,
        HOMEPAGE_ADMIN,
        SHOP_ADMIN,
        SPONSORS_ADMIN,
        CONTACT_ADMIN,
        ROSTER_ADMIN,
        SCHEDULE_ADMIN,
        TRYOUTS_ADMIN,
      ]) {
        const page = source(path);
        expect(page, path).toContain(EDITORIAL_GATE);
        expect(page, path).not.toMatch(/club\.(id|slug)\s*===\s*["']/);
        expect(page, path).not.toMatch(/clubId\s*===\s*["']/);
      }
    });
  });
});
