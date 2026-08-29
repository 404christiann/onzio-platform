import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminQuickActions,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

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
const STANDINGS_ADMIN = "app/admin/(protected)/standings/page.tsx";
const DASHBOARD_ADMIN = "app/admin/(protected)/page.tsx";
const ROUTE_MANIFEST = "lib/admin-route-manifest.ts";

const EDITORIAL_GATE = 'presentationTemplateKey === "editorial@1"';
const ACADEMY_GATE = 'presentationTemplateKey === "academy@1"';
const CLUBHOUSE_GATE = 'presentationTemplateKey === "clubhouse@1"';

/**
 * Lions FC (editorial@1) hides admin surfaces its public template never
 * renders. Every hide is template-scoped (presentationTemplateKey), never
 * tenant-scoped, and every hide extends an existing academy@1 gate with OR —
 * so Diverse City's (academy@1) admin behavior is bit-for-bit unchanged. The
 * assertions below pin both halves: hidden for editorial@1, intact for
 * academy@1 and the default templates.
 */
describe("editorial@1 admin surface hides", () => {
  describe("nav: Programs, Analytics, Match Stats, Season Stats dropped for editorial@1 only", () => {
    it("filters exactly the four dead hrefs behind the editorial template check", () => {
      const context: AdminRouteAccessContext = {
        role: "owner",
        presentationTemplateKey: "editorial@1",
        isBillingAuthorized: true,
        canMutateContent: true,
      };
      const hidden = ADMIN_ROUTE_MANIFEST.map((route) => route.id).filter(
        (id) => !getVisibleAdminRoutes(context).some((route) => route.id === id),
      );
      expect(hidden).toEqual(["programs", "match-stats", "season-stats", "analytics"]);
    });

    it("keeps /admin/about in the nav — editorial@1 really does have an About page", () => {
      // components/editorial/EditorialHeader.tsx (the header Lions actually
      // mounts) and EditorialFooter.tsx both link /club/about, and
      // app/%5Fclubs/[slug]/club/about/page.tsx renders EditorialAboutPage for
      // the template. Nav.tsx's lionsNavLinks omits About but is dead code for
      // editorial@1 — Lions never mounts Nav.tsx — and an earlier revision
      // hid this nav item after checking that wrong component.
      const visible = getVisibleAdminRoutes({
        role: "owner",
        presentationTemplateKey: "editorial@1",
        isBillingAuthorized: true,
        canMutateContent: true,
      });
      expect(visible.map((route) => route.href)).toContain("/admin/about");
      expect(source("components/editorial/EditorialHeader.tsx")).toContain(
        '{ label: "About", href: "/club/about" }',
      );
      expect(source("components/editorial/EditorialFooter.tsx")).toContain(
        '<Link href="/club/about">',
      );
      expect(source("app/%5Fclubs/[slug]/club/about/page.tsx")).toContain(
        "return <EditorialAboutPage content={content.about} />;",
      );
    });

    it("adds no academy@1 nav filtering — DCFC's nav is untouched", () => {
      const visible = getVisibleAdminRoutes({
        role: "owner",
        presentationTemplateKey: "academy@1",
        isBillingAuthorized: true,
        canMutateContent: true,
      });
      expect(visible.map((route) => route.id)).toEqual(
        ADMIN_ROUTE_MANIFEST.map((route) => route.id),
      );
    });
  });

  describe("route guards: direct URL access redirects editorial@1 to /admin", () => {
    for (const [name, path] of [
      ["programs", PROGRAMS_ADMIN],
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

  describe("about admin: page reachable for editorial@1, Club Logo tab hidden", () => {
    it("has no route guard — editorial@1 reaches /admin/about like every template", () => {
      const page = source(ABOUT_ADMIN);
      expect(page).not.toContain('router.replace("/admin")');
      expect(page).not.toContain("if (isEditorialTemplate) return null;");
      expect(page).not.toContain("useRouter");
    });

    it("extends the academy club-logo gate with the tryouts !isAcademy && !isEditorial shape", () => {
      const page = source(ABOUT_ADMIN);
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain(
        "const hasClubLogoPage = !isAcademy && !isEditorial;",
      );
      // The tab switcher, the blurb, and the write path all read the combined
      // gate; no stray !isAcademy-only club-logo gate survives.
      expect(page).toContain("{hasClubLogoPage && (");
      expect(page).toContain("{hasClubLogoPage\n            ?");
      expect(page).toContain(
        'hasClubLogoPage\n          ? supabase.from("club_logo_page_content").upsert([logoPayload])\n          : Promise.resolve({ error: null }),',
      );
      expect(page).not.toContain("{!isAcademy && (");
      expect(page).not.toContain("isAcademy\n          ? Promise.resolve");
    });

    it("keeps the closing-CTA pin academy-only — Lions keeps its editable Button Link", () => {
      const page = source(ABOUT_ADMIN);
      // DCFC-D007 pins academy@1's href in code. editorial@1's seeded
      // closing_cta_href is /club/about, not /schedule, so it must NOT inherit
      // the pin when the club-logo gate widened.
      expect(page).toContain(
        "closing_cta_href: isAcademy\n          ? ACADEMY_ABOUT_CLOSING_CTA_HREF\n          : aboutDraft.closing_cta_href.trim() || \"/schedule\",",
      );
      expect(page).not.toContain("closing_cta_href: hasClubLogoPage");
      expect(page).toContain("{isAcademy ? (");
    });

    it("hides Club Logo for exactly the templates whose registry lists no club-logo route", () => {
      const registry = source("packages/presentation/index.ts");
      // academy@1 and editorial@1 both omit "club-logo"; cinematic@1 keeps it,
      // which is why the gate names templates instead of excluding all
      // non-academy ones.
      expect(registry).toContain(
        'defaultRoutes: ["home", "club", "roster", "schedule", "tryouts", "store", "contact"],\n    supportedRoutes: ["home", "club", "roster", "schedule", "tryouts", "store", "contact"],',
      );
      expect(registry).toContain(
        'defaultRoutes: ["home", "roster", "schedule", "club", "club-logo", "store"],',
      );
      // And nothing on the editorial site links /club/logo.
      expect(source("components/editorial/EditorialHeader.tsx")).not.toContain(
        "/club/logo",
      );
      expect(source("components/editorial/EditorialFooter.tsx")).not.toContain(
        "/club/logo",
      );
    });

    it("previews the editorial About page for editorial@1 instead of the default one", () => {
      const preview = source("components/admin/ScaledAboutPreview.tsx");
      expect(preview).toContain(
        'const isEditorialAbout =\n    club.presentationTemplateKey === "editorial@1" && props.variant === "about";',
      );
      expect(preview).toContain("<EditorialAboutPage content={props.content} />");
      // editorial.css is scoped under the template wrapper and is otherwise
      // only imported by EditorialShell, which the admin never mounts — same
      // wiring ScaledTryoutsPreview/ScaledShopKitPreview needed.
      expect(preview).toContain('import "@/styles/editorial.css";');
      expect(preview).toContain('data-site-template="editorial"');
      expect(preview).toContain('"--club-primary": theme.primary');
      expect(preview).toContain('"--club-secondary": theme.secondary');
      expect(preview).toContain('"--club-accent": theme.accent');
    });

    it("leaves every other template's About and Club Logo preview untouched", () => {
      const preview = source("components/admin/ScaledAboutPreview.tsx");
      // academy@1/DCFC and the rest still fall through to the same two
      // components as before; the logo variant gained no editorial branch.
      expect(preview).toContain(
        "<AboutClubPageClient content={props.content} animate={false} />",
      );
      expect(preview).toContain(
        "<ClubLogoPageClient content={props.content} animate={false} />",
      );
      // Import line (twice: binding + module path) plus the single JSX use.
      expect(count(preview, "ClubLogoPageClient")).toBe(3);
      expect(preview).not.toMatch(/isEditorial\w*\s*&&[\s\S]{0,80}ClubLogoPageClient/);
    });

    it("edits the same row the public editorial page renders", () => {
      // The un-hide is only meaningful because both sides read
      // about_page_content for the tenant: the admin loads and upserts it,
      // and the public editorial route feeds the very same fetch into
      // EditorialAboutPage. A UI-only un-hide would not give the club control.
      const page = source(ABOUT_ADMIN);
      expect(page).toContain("fetchAboutClubContent(clubId)");
      expect(page).toContain('supabase.from("about_page_content").upsert([aboutPayload])');
      const publicRoute = source("app/%5Fclubs/[slug]/club/about/page.tsx");
      expect(publicRoute).toContain("fetchAboutClubContent(club.id, onzio)");
      expect(publicRoute).toContain("<EditorialAboutPage content={content.about} />");
      expect(source("lib/queries.ts")).toContain('.from("about_page_content")');
      expect(source("components/editorial/EditorialAboutPage.tsx")).toContain(
        "content: DBAboutPageContent;",
      );
    });
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
      // The rail's "behind" item resolves `hidden` from
      // hidesBehindTheRoseSection (== hidesLegacyHomepageSections ||
      // isEditorial), so it never enters the rail or the DOM for editorial@1
      // — this replaced the old pill-array `.filter()` predicate, but the
      // same combined boolean still gates it.
      expect(page).toContain(
        ': tab === "behind"\n          ? hidesBehindTheRoseSection\n          : false,',
      );
    });

    it("keeps academy@1's legacy-section gate and the behind upsert intact", () => {
      const page = source(HOMEPAGE_ADMIN);
      // academy@1's own gate is unchanged and stays academy-only…
      expect(page).toContain(`club.${ACADEMY_GATE}`);
      // The rail's "slideshow" item resolves `hidden` straight from
      // hidesLegacyHomepageSections, so academy@1 never renders it — the
      // successor to the old pill-array `.filter()` predicate.
      expect(page).toContain(
        'tab === "slideshow"\n        ? hidesLegacyHomepageSections',
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

  describe("shop admin: Home Page surface hidden for clubhouse@1 and editorial@1", () => {
    it("filters the home surface out of the option list itself, not just the rendered tabs", () => {
      const page = source(SHOP_ADMIN);
      // The gate is an explicit two-template denylist. Both templates give
      // their homepage a bespoke teaser that reads the "shop" surface, so the
      // "home" rows are unreachable content for each of them.
      expect(page).toContain(
        `const hidesHomeShopSurface =\n    club.${CLUBHOUSE_GATE} || isEditorial;`,
      );
      expect(page).toContain(
        'const surfaceOptions = hidesHomeShopSurface\n    ? SURFACE_OPTIONS.filter((surface) => surface.id !== "home")\n    : SURFACE_OPTIONS;',
      );
      // The selector renders from the filtered list, so no literal "Home Page"
      // button can survive the filter.
      expect(page).toContain("{surfaceOptions.map((surface) => {");
      expect(page).not.toContain('{ id: "home" as const, label: "Home Page" }');
      // A one-option switcher is dead UI and is hidden entirely, matching the
      // kit-variant switcher's `kitVariants.length > 1` pattern.
      expect(page).toContain("{surfaceOptions.length > 1 && (");
    });

    it("derives selectedSurface so no state can point either template at the hidden surface", () => {
      const page = source(SHOP_ADMIN);
      // The raw state still defaults to "home" (academy@1 depends on that), but
      // the value every downstream branch reads is derived from the filtered
      // option list, so both hidden templates resolve to "shop" on mount and
      // forever — the derivation is gate-agnostic, so widening the gate to
      // clubhouse@1 needed no change here.
      expect(page).toContain(
        'const [surfaceChoice, setSelectedSurface] = useState<ShopKitSurface>("home");',
      );
      expect(page).toContain(
        "const selectedSurface: ShopKitSurface = surfaceOptions.some(\n    (surface) => surface.id === surfaceChoice,\n  )\n    ? surfaceChoice\n    : (surfaceOptions[0]?.id ?? \"shop\");",
      );
      // No raw state escapes into the surface-dependent logic.
      expect(count(page, "surfaceChoice")).toBe(3);
    });

    it("leaves academy@1's Home Page surface completely intact", () => {
      const page = source(SHOP_ADMIN);
      // Both options remain in the module-level list, and academy@1 appears
      // nowhere in the surface gate — it keeps the tab and its "home" default.
      expect(page).toContain(
        'const SURFACE_OPTIONS: Array<{ id: ShopKitSurface; label: string }> = [\n  { id: "home", label: "Home Page" },\n  { id: "shop", label: "Shop Page" },\n];',
      );
      // The surface hide must not borrow the clubhouse-sections flag: that is
      // an academy@1 check, so reusing it would inadvertently strip the tab
      // from every non-academy template — including cinematic@1, heritage@1
      // and unpublished clubs, whose homepages do render the "home" surface.
      expect(page).not.toContain(
        "const surfaceOptions = hidesClubhouseShopSections",
      );
      // The home-surface write path is still reachable for academy@1.
      expect(page).toContain(
        "shopKitSectionId(selectedSurface, activeKitVariant)",
      );
    });

    it("hides the surface for exactly the two templates whose homepage reads 'shop'", () => {
      // The hide is only correct because these two templates render their own
      // store teaser off the same rows as the /shop page.
      expect(source("components/ClubhouseHomePage.tsx")).toContain(
        'fetchShopKitVariants("shop", club.id)',
      );
      expect(source("components/editorial/EditorialHomeStore.tsx")).toContain(
        'fetchShopKitVariants("shop", club.id)',
      );
      // ...while academy@1 genuinely reads the "home" surface it edits.
      expect(source("components/AcademyHomeShopFeature.tsx")).toContain(
        'fetchShopKitVariants("home", clubId)',
      );
    });

    it("keeps the tab for the templates that fall through to the shared home-surface section", () => {
      // HomePageClient special-cases editorial@1 and clubhouse@1 and returns
      // early; every other template (academy@1 aside) falls through to the
      // shared <ShopKitSection surface="home" /> branch. cinematic@1,
      // heritage@1 and clubs with no published presentation (null key) all land
      // there, so their Home Page tab must stay editable — which is why the
      // gate names two templates instead of excluding all non-academy ones.
      const home = source("components/HomePageClient.tsx");
      expect(home).toContain('<ShopKitSection surface="home" fadeImageToWhite />');
      expect(home).toContain(
        'if (club.presentationTemplateKey === "clubhouse@1") {',
      );
      expect(home).toContain(
        'if (club.presentationTemplateKey === "editorial@1") {',
      );
    });

    it("leaves the editorial@1-only Photo Row and Purchase hides untouched", () => {
      const page = source(SHOP_ADMIN);
      // Rose City's ClubhouseShopPage does render both, so those tabs must stay
      // gated on isEditorial alone and must not pick up the new surface flag.
      expect(page).toContain(
        "const tabOrder = isEditorial\n    ? ADMIN_TAB_ORDER.filter(\n        (tab) => tab !== \"photoStrip\" && tab !== \"purchase\",",
      );
      expect(page).not.toContain("tabOrder = hidesHomeShopSurface");
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
      // The pill switcher was replaced by an AdminSectionRail whose footer
      // row carries the same gate via the rail's `hidden` flag — dropping it
      // out of the rail and the DOM entirely, not just disabling it.
      expect(page).toContain(
        'hidden: item === "footer" ? hidesSponsorFooterTab : false',
      );
      // The carousel placement itself stays for every template.
      expect(page).toContain(
        'carousel: `Carousel — up to ${MAX_CAROUSEL_SPONSORS}`',
      );
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

  describe("standings admin: Rose City sample preview hidden for editorial@1", () => {
    it("extends the academy gate with AND-NOT — academy@1 branch unchanged", () => {
      const page = source(STANDINGS_ADMIN);
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      expect(page).toContain("fallbackToSample: !isAcademy && !isEditorial,");
    });

    it("shows the empty-state copy instead of a blank panel when the fallback is off", () => {
      const page = source(STANDINGS_ADMIN);
      // LeagueStandingsTable renders null on zero rows, so editorial@1 would
      // otherwise get an empty bordered box rather than guidance.
      expect(page).toContain("{previewRows.length === 0 ? (");
      expect(page).toContain(
        "Add a team above to see a preview of your standings table.",
      );
      expect(count(page, "Add a team above to see a preview")).toBe(1);
    });

    it("keeps the sample fallback for templates whose club is Rose City", () => {
      const page = source(STANDINGS_ADMIN);
      // clubhouse@1 must still take a populated table branch — the exclusion
      // is per-template, not a removal of the sample-fallback feature.
      expect(page).not.toContain("fallbackToSample: false");
      expect(page).toContain("<LeagueStandingsTable settings={settings} rows={previewRows} />");
      expect(page).toContain(
        "<AcademyLeagueStandingsTable settings={settings} rows={previewRows} />",
      );
    });
  });

  describe("dashboard quick actions follow the approved shared capability manifest", () => {
    it("keeps the exact four owner actions for every template", () => {
      for (const presentationTemplateKey of ["editorial@1", "academy@1"] as const) {
        expect(
          getVisibleAdminQuickActions({
            role: "owner",
            presentationTemplateKey,
            isBillingAuthorized: true,
            canMutateContent: true,
          }).map((action) => action.id),
        ).toEqual(["registrations", "manage-roster", "manage-schedule", "payments"]);
      }
      expect(source(DASHBOARD_ADMIN)).toContain("getVisibleAdminQuickActions");
    });

    it("never reintroduces dead template-specific substitutions", () => {
      const page = source(DASHBOARD_ADMIN);
      expect(page).not.toContain("Enter Match Stats");
      expect(page).not.toContain("Manage Tryouts");
      expect(page).not.toContain("Manage Seasons");
    });
  });

  describe("no gate is tenant-scoped", () => {
    it("hides key off presentationTemplateKey, never a club id or slug", () => {
      for (const path of [
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
        STANDINGS_ADMIN,
      ]) {
        const page = source(path);
        expect(page, path).toContain(EDITORIAL_GATE);
        expect(page, path).not.toMatch(/club\.(id|slug)\s*===\s*["']/);
        expect(page, path).not.toMatch(/clubId\s*===\s*["']/);
      }
      const manifest = source(ROUTE_MANIFEST);
      expect(manifest).toContain('const EDITORIAL_TEMPLATE = "editorial@1"');
      expect(manifest).not.toMatch(/club\.(id|slug)\s*===\s*["']/);
      expect(source(ADMIN_SHELL)).not.toMatch(/club\.(id|slug)\s*===\s*["']/);
      expect(source(DASHBOARD_ADMIN)).not.toMatch(/club\.(id|slug)\s*===\s*["']/);
    });
  });
});
