import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminQuickActions,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { buildHomepageSaveRequest } from "@/lib/homepage-editor/adapter";
import {
  createHomepageEditorState,
  reduceHomepageEditor,
} from "@/lib/homepage-editor/model";
import { homepageDraft, SAVE_OPERATION } from "../fixtures/homepage-editor";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const ADMIN_SHELL = "components/AdminShell.tsx";
const PROGRAMS_ADMIN = "app/admin/(protected)/programs/page.tsx";
const ABOUT_ADMIN = "app/admin/(protected)/about/page.tsx";
const ANALYTICS_ADMIN = "app/admin/(protected)/analytics/page.tsx";
const SHOP_ADMIN = "app/admin/(protected)/shop/page.tsx";
const SHOP_EDITOR = "components/admin/shop/ShopPageEditor.tsx";
const SHOP_SAVE = "supabase/migrations/20261002203000_shop_page_atomic_save.sql";
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
    it("programs rejects every template without the public Programs route", () => {
      const page = source(PROGRAMS_ADMIN);
      expect(page).toContain('const unsupportedTemplate = club.presentationTemplateKey !== "academy@1";');
      expect(page).toContain('if (unsupportedTemplate) router.replace("/admin");');
      expect(page).toContain("if (unsupportedTemplate) return null;");
    });
    for (const [name, path] of [
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
      // The page switcher is hidden and the logo Save branch remains
      // unreachable for both templates that lack a public Club Logo page.
      expect(page).toContain('{hasClubLogoPage && <button type="button"');
      expect(page).toContain('(next === "logo" && !hasClubLogoPage)');
      expect(page).toContain('prepared.page === "about"\n        ? await supabase.from("about_page_content").upsert([prepared.content])\n        : await supabase.from("club_logo_page_content").upsert([prepared.content])');
      expect(page).not.toContain("{!isAcademy && (");
    });

    it("keeps the closing-CTA pin academy-only — Lions gets a route dropdown", () => {
      const page = source(ABOUT_ADMIN);
      // DCFC-D007 pins academy@1's href in code. editorial@1's seeded
      // closing_cta_href is /club/about, not /schedule, so it must NOT inherit
      // the pin when the club-logo gate widened.
      const save = source("lib/about-editor/save.ts");
      expect(save).toContain('closing_cta_href: input.academy ? "/schedule" : input.about.closing_cta_href.trim()');
      expect(save).not.toContain("closing_cta_href: hasClubLogoPage");
      expect(page).toContain("{isAcademy ? (");
      expect(page).toContain('<NativeSelect\n                          aria-label="Button goes to"');
      expect(page).not.toContain('label="Button Link"');
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

    it("renders the editorial public About component in the interactive page canvas", () => {
      const preview = source("components/admin/about/AboutPageCanvas.tsx");
      expect(preview).toContain(
        'club.presentationTemplateKey === "editorial@1"',
      );
      expect(preview).toContain("<EditorialAboutPage content={props.about} />");
      expect(preview).toContain('import "@/styles/editorial.css";');
      expect(preview).toContain('data-site-template="editorial"');
      expect(preview).toContain('"--club-primary": theme.primary');
      expect(preview).toContain('"--club-secondary": theme.secondary');
      expect(preview).toContain('"--club-accent": theme.accent');
    });

    it("uses the real public components for generic, Clubhouse, and Club Logo", () => {
      const preview = source("components/admin/about/AboutPageCanvas.tsx");
      expect(preview).toContain(
        "<AboutClubPageClient content={props.about} animate={false} />",
      );
      expect(preview).toContain(
        "<ClubLogoPageClient content={props.logo} animate={false} />",
      );
      expect(preview).toContain("<ClubhouseAboutPage content={props.about} sponsors={props.sponsors} />");
      expect(preview).toContain('onClickCapture={(event) => {');
      expect(preview).toContain('onKeyDownCapture={(event) => {');
    });

    it("edits the same row the public editorial page renders", () => {
      // The un-hide is only meaningful because both sides read
      // about_page_content for the tenant: the admin loads and upserts it,
      // and the public editorial route feeds the very same fetch into
      // EditorialAboutPage. A UI-only un-hide would not give the club control.
      const page = source(ABOUT_ADMIN);
      expect(page).toContain("fetchAboutClubContent(clubId)");
      expect(page).toContain('supabase.from("about_page_content").upsert([prepared.content])');
      const publicRoute = source("app/%5Fclubs/[slug]/club/about/page.tsx");
      expect(publicRoute).toContain("fetchAboutClubContent(club.id, onzio)");
      expect(publicRoute).toContain("<EditorialAboutPage content={content.about} />");
      expect(source("lib/queries.ts")).toContain('.from("about_page_content")');
      expect(source("components/editorial/EditorialAboutPage.tsx")).toContain(
        "content: DBAboutPageContent;",
      );
    });
  });

  describe("homepage editor capabilities follow the public renderer", () => {
    it("keeps Academy limited to hero and story editing", () => {
      expect(resolveHomepageCapabilities({
        templateKey: "academy@1",
        slideshowVariant: "none",
        heroVariant: "editable",
      })).toMatchObject({
        editableSections: ["hero", "story"],
        heroEditableFields: [
          "eyebrow", "headline_line_one", "headline_line_two", "intro",
          "primary_cta_label", "primary_cta_href",
          "secondary_cta_label", "secondary_cta_href",
        ],
        photoCaptionEditable: false,
        videoSourceEditable: false,
        sharedTargets: {
          storyText: null,
          shop: { owner: "shop", editorHref: "/admin/shop", surface: "home" },
          programs: { owner: "programs", editorHref: "/admin/programs" },
        },
      });
    });

    it("keeps Editorial limited to hero and photos, with shared story and shop targets", () => {
      expect(resolveHomepageCapabilities({
        templateKey: "editorial@1",
        slideshowVariant: "editorial",
        heroVariant: "editable",
      })).toMatchObject({
        editableSections: ["hero", "photos"],
        heroEditableFields: [
          "headline_line_one", "headline_line_two", "intro",
          "primary_cta_label", "primary_cta_href",
          "secondary_cta_label", "secondary_cta_href",
        ],
        photoCaptionEditable: false,
        videoSourceEditable: false,
        sharedTargets: {
          storyText: { owner: "about", editorHref: "/admin/about" },
          shop: { owner: "shop", editorHref: "/admin/shop", surface: "shop" },
        },
      });
      expect(resolveHomepageCapabilities({
        templateKey: "editorial@1",
        slideshowVariant: "editorial",
        heroVariant: "editable",
      }).editableSections).not.toContain("video");
    });

    it("omits unavailable video from the Editorial save payload", () => {
      const state = createHomepageEditorState({
        content: homepageDraft(),
        revision: "revision-1",
        designRevision: "design-1",
        editableSections: ["hero", "photos"],
      });
      const withIgnoredVideoEdit = reduceHomepageEditor(state, {
        type: "field-changed",
        field: "video.title",
        value: "Should never be sent",
      });
      const edited = reduceHomepageEditor(withIgnoredVideoEdit, {
        type: "field-changed",
        field: "hero.intro",
        value: "Updated Editorial intro",
      });
      const payload = buildHomepageSaveRequest(
        edited,
        {
          templateKey: "editorial@1",
          slideshowVariant: "editorial",
          heroVariant: "editable",
        },
        SAVE_OPERATION,
      );
      expect(Object.keys(payload.sections)).toEqual(["hero"]);
      expect(payload.sections).not.toHaveProperty("video");
      expect(payload.sections.hero).not.toHaveProperty("eyebrow");
    });
  });

  describe("shop admin follows each template's public page", () => {
    it("mounts the page canvas and limits photo row and purchase tools to the generic Shop route", () => {
      const route = source(SHOP_ADMIN);
      const editor = source(SHOP_EDITOR);
      expect(route).toContain("return <ShopPageEditor />;");
      expect(editor).toContain('const showExtras = generic && surface === "shop";');
      expect(editor).toContain('showExtras && <><ToolButton label="Edit photo row"');
      expect(editor).toContain('showExtras && draft.photoRows[currentVariant].length > 0 && <ShopPhotoStrip');
      expect(editor).toContain('showExtras && hasShopPurchaseDetails(publicPurchase(draft.purchase)) && <ShopPurchaseDetailsSection');
    });

    it("enforces the hidden photo row and purchase sections at the database boundary", () => {
      const editor = source(SHOP_EDITOR);
      const save = source(SHOP_SAVE);
      expect(editor).toContain('const generic = !isAcademy && !isClubhouse && !isEditorial;');
      expect(save).toContain("(page_surface='home' or template in ('academy@1','clubhouse@1','editorial@1')) and (photo_rows is not null or purchase is not null)");
      expect(source("components/ClubhouseShopPage.tsx")).not.toContain("ShopPhotoStrip");
      expect(source("components/ClubhouseShopPage.tsx")).not.toContain("ShopPurchaseDetailsSection");
      expect(source("components/editorial/EditorialShopPage.tsx")).not.toContain("ShopPhotoStrip");
      expect(source("components/editorial/EditorialShopPage.tsx")).not.toContain("ShopPurchaseDetailsSection");
    });

    it("keeps all three public kit variants for Editorial and Clubhouse while Academy has Home only", () => {
      const editor = source(SHOP_EDITOR);
      expect(editor).toContain('const isAcademy = template === "academy@1";');
      expect(editor).toContain('const isClubhouse = template === "clubhouse@1";');
      expect(editor).toContain('const isEditorial = template === "editorial@1";');
      expect(editor).toContain('const variants: ShopVariant[] = isAcademy ? ["home"] : sharedWithHomepage ? SHOP_VARIANTS : ["home", "away"];');
      expect(source("components/editorial/EditorialShopPage.tsx")).toContain('const VARIANT_ORDER: ShopKitVariant[] = ["home", "away", "third"];');
      expect(source("components/ClubhouseShopPage.tsx")).toContain('(["home", "third", "away"] as ShopKitVariant[])');
      expect(source(SHOP_SAVE)).toContain("if (page_surface='home' or template='academy@1') and (variants ? 'third' or variants ? 'away')");
    });

    it("offers no independent Homepage shop page for Clubhouse and Editorial", () => {
      const editor = source(SHOP_EDITOR);
      expect(editor).toContain('const sharedWithHomepage = isClubhouse || isEditorial;');
      expect(editor).toContain('const hasHomeFeature = !sharedWithHomepage;');
      expect(editor).toContain('{hasHomeFeature && <button type="button" aria-current={surface === "home" ? "page" : undefined}');
      expect(editor).toContain('Kit changes on this Shop page also update the homepage store teaser.');
      expect(source(SHOP_SAVE)).toContain("if page_surface='home' and template in ('clubhouse@1','editorial@1') then raise exception 'PAGE_UNAVAILABLE'");
    });

    it("constrains the selected page to Shop when the homepage uses Shop data", () => {
      const editor = source(SHOP_EDITOR);
      expect(editor).toContain('const [surfaceChoice, setSurfaceChoice] = useState<ShopSurface>("shop");');
      expect(editor).toContain('const surface: ShopSurface = hasHomeFeature ? surfaceChoice : "shop";');
      expect(editor).toContain('const currentVariant: ShopVariant = surface === "home" || !variants.includes(selectedVariant) ? "home" : selectedVariant;');
      expect(editor).toContain('const [drafts, setDrafts] = useState<Partial<Record<ShopSurface, ShopPageDraft>>>({});');
      expect(editor).toContain('const dirty = shopDraftDirty(draft);');
    });

    it("keeps Academy and generic homepage Shop features separately editable", () => {
      const editor = source(SHOP_EDITOR);
      expect(editor).toContain('const hasHomeFeature = !sharedWithHomepage;');
      expect(editor).toContain('Homepage shop feature {shopDraftDirty(drafts.home) ? "•" : ""}');
      expect(editor).toContain('surface === "shop" ? <AcademyShopPage editorContent={content.home} /> : <AcademyHomeShopFeature editorContent={content.home} />');
      expect(editor).toContain('<ShopKitSectionContainer surface={surface}');
      expect(source("components/AcademyHomeShopFeature.tsx")).toContain('fetchShopKitVariants("home", clubId)');
      expect(source("app/(public)/shop/page.tsx")).toContain('<ShopKitSectionContainer\n        surface="shop"');
    });

    it("matches the public homepage's shared versus independent Shop data", () => {
      expect(source("components/ClubhouseHomePage.tsx")).toContain('fetchShopKitVariants("shop", club.id)');
      expect(source("components/editorial/EditorialHomeStore.tsx")).toContain('fetchShopKitVariants("shop", club.id)');
      expect(source("components/AcademyHomeShopFeature.tsx")).toContain('fetchShopKitVariants("home", clubId)');
      expect(source(SHOP_EDITOR)).toContain('const sharedWithHomepage = isClubhouse || isEditorial;');
    });

    it("keeps the generic homepage's Home kit feature for cinematic, heritage, and unpublished templates", () => {
      const home = source("components/HomePageClient.tsx");
      expect(home).toContain('<ShopKitSection surface="home" fadeImageToWhite />');
      expect(home).toContain('if (club.presentationTemplateKey === "clubhouse@1") {');
      expect(home).toContain('if (club.presentationTemplateKey === "editorial@1") {');
      expect(source(SHOP_EDITOR)).toContain('const generic = !isAcademy && !isClubhouse && !isEditorial;');
      expect(source(SHOP_EDITOR)).toContain('const hasHomeFeature = !sharedWithHomepage;');
    });

    it("shows only public sections and makes an unavailable Editorial Store read-only", () => {
      const editor = source(SHOP_EDITOR);
      const publicRoute = source("app/(public)/shop/page.tsx");
      expect(publicRoute).toContain('if (!club.storeEnabled) return notFound();');
      expect(editor).toContain('const storeUnavailable = isEditorial && !club.storeEnabled;');
      expect(editor).toContain('if (storeUnavailable) {');
      expect(editor).toContain('This Shop page is not currently visible on your website.');
      expect(editor).toContain('const showExtras = generic && surface === "shop";');
      expect(source("components/ClubhouseShopPage.tsx")).toContain('data-shop-editor-target="fixed"');
      expect(source("components/editorial/EditorialShopPage.tsx")).toContain('data-shop-editor-target="fixed"');
      expect(editor).toContain('This copy belongs to the website design and is managed by Onzio.');
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

  describe("contact admin: supported templates keep the fixed hero treatment", () => {
    it("renders a real Contact canvas for academy and editorial without a dead image upload", () => {
      const page = source(CONTACT_ADMIN);
      const canvas = source("components/admin/contact/ContactPageCanvas.tsx");
      expect(page).toContain('club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1"');
      expect(page).toContain("<ContactPageCanvas content={content}");
      expect(canvas).toContain("<AcademyContactPage content={content}");
      expect(canvas).toContain("<EditorialContactPage content={content}");
      expect(page).not.toContain('type="file"');
      expect(page).not.toContain("Upload hero image");
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
      const page = source("components/admin/tryouts/TryoutsPageEditor.tsx");
      expect(page).toContain(`const isAcademy = club.${ACADEMY_GATE};`);
      expect(page).toContain(`const isEditorial = club.${EDITORIAL_GATE};`);
      // !isAcademy && !isEditorial is false for academy@1 exactly where the
      // old !isAcademy was false; default templates stay true.
      expect(page).toContain(
        "const showsProgramAndHeroFields = !isAcademy && !isEditorial;",
      );
      // Program association stays hidden where neither public template
      // renders it. The Academy event photo now has its own public owner.
      expect(count(page, "{showsProgramAndHeroFields &&")).toBe(1);
      expect(page).toContain("const showsHeroImage = isAcademy;");
      expect(page).not.toContain("{!isAcademy && (");
    });

    it("keeps the hero upload pipeline intact for the templates that use it", () => {
      const page = source("components/admin/tryouts/TryoutsPageEditor.tsx");
      expect(page).toContain("FileUpload");
      expect(page).toContain("async function uploadHero");
      expect(page).toContain("{showsHeroImage && <div>");
      expect(source("lib/tryout-admin.ts")).toContain("hero_media_asset_id: draft.heroMediaAssetId");
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
        SHOP_EDITOR,
        SPONSORS_ADMIN,
        CONTACT_ADMIN,
        ROSTER_ADMIN,
        SCHEDULE_ADMIN,
        TRYOUTS_ADMIN,
        STANDINGS_ADMIN,
      ]) {
        const page = source(path);
        expect(page, path).toContain(path === CONTACT_ADMIN
          ? 'club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1"'
          : path === PROGRAMS_ADMIN
            ? 'presentationTemplateKey !== "academy@1"'
            : path === SHOP_EDITOR
              ? 'const isEditorial = template === "editorial@1";'
              : EDITORIAL_GATE);
        if (path === SHOP_EDITOR) expect(page).toContain('const template = club.presentationTemplateKey;');
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
