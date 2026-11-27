import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_LINK_FIELDS } from "@/lib/admin-data-contract";

/**
 * Every admin-editable link destination is validated and normalized by
 * lib/link-destination.ts, on the client, at the save route and (through
 * onzio_private.normalize_link_destination) in the database. These checks fail
 * when a link field saves without going through it.
 */
const ROOT = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(resolve(ROOT, path)).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}
const APP_SOURCES = ["app", "components", "lib"].flatMap(sourceFiles);

/** Each save path's link field, and the line that sends it through the shared rule. */
const SAVE_PATHS: ReadonlyArray<readonly [field: string, file: string, needle: string]> = [
  ["Contact informationHref", "lib/cinematic-contact-content.ts", 'refineLinkDestination(context, ["informationHref"]'],
  ["Ticket page button / watch / donor links", "lib/cinematic-ticket-pages-content.ts", "const link = linkDestinationSchema("],
  ["Partners opportunities ctaHref", "lib/cinematic-partners-content.ts", 'refineLinkDestination(context, ["pages", "opportunities", "ctaHref"]'],
  ["News actionHref", "lib/cinematic-news.ts", 'refineLinkDestination(context, ["actionHref"]'],
  ["Tickets purchaseUrl", "lib/tickets-content.ts", "purchaseUrl: linkDestinationSchema("],
  ["Homepage form destinations", "lib/cinematic-homepage-content.ts", "const externalDestination = linkDestinationSchema("],
  ["Homepage match button", "lib/cinematic-homepage-content.ts", "buttonHref: sitePage"],
  ["Hero button links", "lib/homepage-editor/contract.ts", "const href = linkDestinationSchema({ ...SITE_PAGE_LINK"],
  ["Shop kit and purchase links", "lib/shop-editor/contract.ts", "const buyLink = linkDestinationSchema("],
  ["Jersey edition links", "lib/cinematic-shop-content.ts", "const purchaseLink = linkDestinationSchema("],
  ["Program button link (route)", "lib/program-page-editor/contract.ts", "external_cta_href: linkDestinationSchema("],
  ["Tryout registration link (route)", "lib/tryouts-page-editor/contract.ts", "registration_href: linkDestinationSchema("],
  ["Data route link columns", "app/api/admin/data/route.ts", "normalizeAdminLinkFields(input.table,"],
  ["Sponsor website (editor)", "lib/sponsor-content.ts", "const value = normalizeLinkDestination(input);"],
  ["Social links (editor)", "components/admin/club-settings/branding-draft.ts", "normalizeLinkDestination(value, PROFILE_LINK)"],
  ["Match sponsor link (classic editor)", "app/admin/(protected)/schedule/page.tsx", "linkDestinationProblem(form.sponsor_link"],
  ["Match sponsor link (Rose City editor)", "components/admin/schedule/rose-city/rose-city-schedule-model.ts", "linkDestinationProblem(form.sponsor_link"],
  ["Program button link (editor)", "lib/program-admin.ts", "linkDestinationProblem(ctaHref)"],
  ["Tryout registration link (editor)", "lib/tryout-admin.ts", "linkDestinationProblem(href)"],
];

/** Public pages that output a stored link render only `renderableLink`'s value. */
const RENDERERS: ReadonlyArray<readonly [file: string, needle: string]> = [
  ["components/cinematic/CinematicTickets.tsx", "renderableLink(content.purchaseUrl)"],
  ["components/cinematic/CinematicStadium.tsx", "renderableLink(ticketing.purchaseUrl)"],
  ["components/cinematic/CinematicChickFilA.tsx", "renderableLink(purchase.purchaseUrl)"],
  ["components/cinematic/CinematicShop.tsx", "renderableLink(href)"],
  ["components/cinematic/CinematicHome.tsx", "renderableLink(revamp?.match.buttonHref, SITE_PAGE_LINK)"],
  ["components/cinematic/CinematicHero.tsx", "renderableLink(content.primary_cta_href, SITE_PAGE_LINK)"],
  ["components/cinematic/CinematicAbout.tsx", "renderableLink(content.closing_cta_href, SITE_PAGE_LINK)"],
  ["components/ShopKitSection.tsx", "renderableLink(section.cta_link)"],
  ["components/ShopPurchaseDetailsSection.tsx", "renderableLink(content.cta_link)"],
  ["components/sites/diverse-city/AcademyShopPage.tsx", "renderableLink(section.cta_link)"],
  ["components/SponsorLink.tsx", "renderableLink(href)"],
  ["components/NextMatchCard.tsx", "renderableLink(nextFixture?.sponsorLink)"],
  ["components/Hero.tsx", "renderableLink(heroContent.primary_cta_href, SITE_PAGE_LINK)"],
  ["components/sites/diverse-city/Hero.tsx", "renderableLink(heroContent.primary_cta_href, SITE_PAGE_LINK)"],
  ["app/%5Fclubs/[slug]/r/[sponsor]/route.ts", "renderableLink(data?.website_url)"],
  ["app/%5Fclubs/[slug]/tryouts/page.tsx", "renderableLink(destination)"],
  ["app/%5Fclubs/[slug]/stadium/media-credentials/page.tsx", "renderableLink(destination)"],
  ["app/%5Fclubs/[slug]/community/national-anthem/page.tsx", "renderableLink(destination)"],
  ["lib/queries.ts", "renderableLink(link.href, PROFILE_LINK)"],
  ["lib/queries.ts", "href: renderableLink(row.href, PROFILE_LINK)"],
  ["lib/queries.ts", "renderableLink(row.external_cta_href)"],
  ["lib/queries.ts", "renderableLink(row.registration_href)"],
];

/**
 * Link-named zod keys that are plain strings on purpose: drafts whose content
 * schema refines them with `refineLinkDestination`, and About's closing button,
 * which the route checks against an exact list of the club's pages.
 */
const PLAIN_STRING_LINK_KEYS: ReadonlyArray<readonly [file: string, key: string, why: string]> = [
  ["lib/cinematic-contact-content.ts", "informationHref", "draft; content schema refines it"],
  ["lib/cinematic-news.ts", "actionHref", "refined in the same schema"],
  ["lib/tickets-content.ts", "purchaseUrl", "draft schema; save schema uses linkDestinationSchema"],
  ["lib/about-editor/contract.ts", "closing_cta_href", "exact page allow-list (isAboutContentDestination)"],
];

const RETIRED_VALIDATORS = [
  "isSafeContactInformationHref", "isSafeNewsHref", "isTicketPurchaseUrl", "isSafeCinematicDestination",
  "normalizePublicHref", "isAllowedPublicHref", "normalizeKitBuyLink", "safePageOrExternalUrl", "safePurchaseUrl",
];

/** Database save functions and the latest migration that defines them; each must call the helper. */
const SQL_SAVE_FUNCTIONS = [
  "onzio_private.check_cinematic_contact_content", "onzio_private.check_ticket_page_link", "onzio_private.check_cinematic_partners_pages",
  "onzio_private.check_cinematic_news_content", "onzio_private.check_tickets_content", "onzio_private.check_cinematic_homepage",
  "onzio.save_homepage", "onzio_private.validate_shop_section", "onzio.save_shop_page", "onzio_private.validate_cinematic_shop_content",
  "onzio.save_program_page", "onzio.save_tryouts_page", "onzio_private.is_sign_up_link",
];

describe("link destinations go through lib/link-destination.ts", () => {
  it("has one normalizer: the retired one-off validators are gone", () => {
    expect(existsSync(resolve(ROOT, "lib/public-link.ts"))).toBe(false);
    for (const file of APP_SOURCES) {
      const text = read(file);
      for (const name of RETIRED_VALIDATORS) expect(text.includes(name), `${file} uses ${name}`).toBe(false);
    }
  });

  it.each(SAVE_PATHS)("%s saves through the shared rule (%s)", (_field, file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it.each(RENDERERS)("%s renders only normalized links", (file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it("defines no new link-named zod field as a plain string", () => {
    const allowed = new Set(PLAIN_STRING_LINK_KEYS.map(([file, key]) => `${file}#${key}`));
    const found: string[] = [];
    for (const file of APP_SOURCES.filter((path) => path !== "lib/link-destination.ts")) {
      for (const match of read(file).matchAll(/\b((?:[A-Za-z_]*(?:[hH]ref|_link|[a-z]Link|purchaseUrl|website_url))|link|href)\s*:\s*z\.(?!object)/g)) {
        if (!allowed.has(`${file}#${match[1]}`)) found.push(`${file}#${match[1]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("normalizes every link column the data route writes, social links as https profiles", () => {
    expect(Object.keys(ADMIN_LINK_FIELDS).sort()).toEqual(["matches", "programs", "site_social_links", "site_sponsor_logos", "tryouts"]);
    expect(ADMIN_LINK_FIELDS.site_social_links).toEqual({ href: { allow: ["https"] } });
    const route = read("app/api/admin/data/route.ts");
    const normalizedAt = route.indexOf("normalizeAdminLinkFields(input.table,");
    expect(normalizedAt).toBeGreaterThan(-1);
    for (const write of [".insert(payload", ".update(payload", ".upsert(payload"]) expect(route.indexOf(write)).toBeGreaterThan(normalizedAt);
  });

  it("checks every link in the latest database definition of each save function", () => {
    const migrations = readdirSync(resolve(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
    for (const name of SQL_SAVE_FUNCTIONS) {
      const header = new RegExp(`create or replace function ${name.replace(".", "\\.")}\\(`, "i");
      const latest = migrations.filter((file) => header.test(read(`supabase/migrations/${file}`))).at(-1);
      expect(latest, name).toBeDefined();
      const sql = read(`supabase/migrations/${latest}`);
      const bodies = sql.split(/(?=create or replace function )/i).filter((block) => header.test(block));
      for (const body of bodies) expect(body, `${relative(ROOT, latest!)} ${name}`).toContain("onzio_private.normalize_link_destination(");
    }
  });
});
