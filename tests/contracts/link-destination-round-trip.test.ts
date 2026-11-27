import { describe, expect, it } from "vitest";
import { ADMIN_LINK_FIELDS, adminDataRequestSchema, normalizeAdminLinkFields } from "@/lib/admin-data-contract";
import { cinematicContactContentSchema, starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import { cinematicHomepageSaveSchema } from "@/lib/cinematic-homepage-content";
import { newsArticleContentSchema } from "@/lib/cinematic-news";
import { cinematicPartnersContentSchema, starterCinematicPartnersContent } from "@/lib/cinematic-partners-content";
import { shopEditionSchema } from "@/lib/cinematic-shop-content";
import { emptyTicketPageContent, knowBeforeYouGoSchema, seasonMembershipSchema } from "@/lib/cinematic-ticket-pages-content";
import { homepageHeroSchema } from "@/lib/homepage-editor/contract";
import { PROFILE_LINK, SITE_PAGE_LINK, normalizeLinkDestination, type LinkDestinationOptions } from "@/lib/link-destination";
import { programPageSaveRequestSchema } from "@/lib/program-page-editor/contract";
import { shopPurchaseSchema, shopSectionSchema } from "@/lib/shop-editor/contract";
import { normalizeSponsorWebsite } from "@/lib/sponsor-content";
import { emptyTicketsContent, ticketsContentSchema } from "@/lib/tickets-content";
import { tryoutsPageEventSchema } from "@/lib/tryouts-page-editor/contract";
import { validateChangedSocialLink } from "@/components/admin/club-settings/branding-draft";
import { GOLDEN_SAVED_LINKS } from "@/tests/fixtures/link-destinations";

/**
 * Round trip for every link field in the inventory: an existing (normalized)
 * value loaded into the editor and saved without editing reaches the database
 * byte-identical. Each case runs the value through the schema that field's save
 * path parses with; the SQL helper's half is in tests/database/link-destination-parity.test.ts.
 */
const goldenFor = (options: LinkDestinationOptions = {}) =>
  GOLDEN_SAVED_LINKS.map(([input]) => input).filter((value) => normalizeLinkDestination(value, options) !== null);

const contact = (href: string) => cinematicContactContentSchema.parse({ ...starterCinematicContactContent(), informationHref: href }).informationHref;
const season = (href: string) => {
  const content = emptyTicketPageContent("season-membership");
  return seasonMembershipSchema.parse({ ...content, button: { ...content.button, href } }).button.href;
};
const kbyg = (href: string) => {
  const content = emptyTicketPageContent("know-before-you-go");
  const parsed = knowBeforeYouGoSchema.parse({ ...content, match: { ...content.match, watchHref: href }, donor: { ...content.donor, buttonHref: href } });
  expect(parsed.match.watchHref).toBe(parsed.donor.buttonHref);
  return parsed.donor.buttonHref;
};
const partners = (href: string) => {
  const content = starterCinematicPartnersContent();
  return cinematicPartnersContentSchema.parse({ ...content, pages: { ...content.pages, opportunities: { ...content.pages.opportunities, ctaHref: href } } }).pages.opportunities.ctaHref;
};
const news = (href: string) => newsArticleContentSchema.parse({
  category: newsArticleContentSchema.def.in.shape.category.options[0], cardHeading: "Card", title: "Title", subtitle: "", coverAlt: "",
  paragraphs: ["Body"], actionLabel: "Open", actionHref: href,
}).actionHref;
const tickets = (href: string) => ticketsContentSchema.parse({ ...emptyTicketsContent(), purchaseUrl: href }).purchaseUrl;
const destinations = cinematicHomepageSaveSchema.shape.navigation.shape.destinations.unwrap().shape;
const data = (table: string, column: string) => (href: string) => {
  const request = { table, operation: "update", payload: { [column]: href } };
  expect(adminDataRequestSchema.safeParse(request).success, `${table}.${column} ${href}`).toBe(true);
  return normalizeAdminLinkFields(table, { [column]: href })[column] as string;
};

const FIELDS: ReadonlyArray<readonly [field: string, options: LinkDestinationOptions, save: (href: string) => string | null | undefined]> = [
  ["Contact informationHref", {}, contact],
  ["Season Membership button.href", {}, season],
  ["Know Before You Go watchHref and donor.buttonHref", {}, kbyg],
  ["Partners opportunities ctaHref", {}, partners],
  ["News actionHref", {}, news],
  ["Tickets purchaseUrl", {}, tickets],
  ["Homepage tryouts form", {}, (href) => destinations.tryouts.parse(href)],
  ["Homepage media credentials form", {}, (href) => destinations.mediaCredentials.parse(href)],
  ["Homepage national anthem form", {}, (href) => destinations.nationalAnthem.parse(href)],
  ["Homepage match buttonHref", SITE_PAGE_LINK, (href) => cinematicHomepageSaveSchema.shape.match.shape.buttonHref.parse(href)],
  ["Hero primary_cta_href", SITE_PAGE_LINK, (href) => homepageHeroSchema.shape.primary_cta_href.parse(href)],
  ["Hero secondary_cta_href", SITE_PAGE_LINK, (href) => homepageHeroSchema.shape.secondary_cta_href.parse(href)],
  ["Shop kit cta_link", {}, (href) => shopSectionSchema.shape.cta_link.parse(href)],
  ["Shop purchase cta_link", {}, (href) => shopPurchaseSchema.shape.cta_link.parse(href)],
  ["Jersey edition link", {}, (href) => shopEditionSchema.shape.link.parse(href)],
  ["Program external_cta_href (route)", {}, (href) => programPageSaveRequestSchema.shape.program.shape.external_cta_href.parse(href)],
  ["Tryout registration_href (route)", {}, (href) => tryoutsPageEventSchema.shape.registration_href.parse(href)],
  ["Sponsor website (editor)", {}, (href) => { const result = normalizeSponsorWebsite(href); return result.ok ? result.value : null; }],
  ["Social link (editor)", PROFILE_LINK, (href) => (validateChangedSocialLink(href, "") === undefined ? normalizeLinkDestination(href, PROFILE_LINK) : null)],
  ...Object.entries(ADMIN_LINK_FIELDS).flatMap(([table, columns]) => Object.entries(columns ?? {}).map(([column, options]) =>
    [`Data route ${table}.${column}`, options, data(table, column)] as const)),
];

describe("existing link values re-save byte-identical", () => {
  it.each(FIELDS)("%s", (_field, options, save) => {
    const values = goldenFor(options);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(save(value), value).toBe(value);
  });

  it("covers every field in the inventory", () => {
    expect(FIELDS.map(([field]) => field)).toHaveLength(24);
  });
});
