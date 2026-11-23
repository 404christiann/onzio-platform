import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ENTRY_IDS, INJURY_PLAYER_IDS, PARTNER_IDS, PARTNER_LOGO_IDS, injuryFixture, injuryMediaFixture, injuryRosterFixture, injuryUrl,
  partnerLogoUrl, partnersFixture, partnersFixtureLogoUrls,
} from "../fixtures/visitor-click-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, editTarget, resolveEditTarget } from "@/lib/admin-edit-targets";
import { PARTNERSHIP_ROUTE, type CinematicPartnersContent, type PartnerPage } from "@/lib/cinematic-partners-content";
import type { CinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { pageSample, partnerDialogId, pageDialogId, singlePartnerContent } from "@/components/admin/partners/partners-sections";
import { partnerItemStamps, partnerStampsByCard, partnerTarget, partnersOwnsTarget, partnersPageStamps, partnersPageStampsByCard, partnerPageTarget } from "@/components/admin/partners/partners-edit-targets";
import { entryDialogId, reportFor, type InjuryBlock } from "@/components/admin/injury-report/injury-sections";
import { INJURY_TARGETS, injuryBlockStamps, injuryBlockStampsByCard, injuryEntryStamps, injuryEntryTarget, injuryOwnsTarget, injuryStampsByCard } from "@/components/admin/injury-report/injury-edit-targets";

/**
 * UI-PREVIEW-CLICK-LIST-1: the Partners and Injury Report card stamps, run against the real public markup (CinematicPartners,
 * CinematicInjuryReport) rendered the way each card renders it: a page card with the first partners, a partner card with
 * singlePartnerContent, a page-part card with reportFor(...) and an injury card with the entry alone and showFormer on. Each
 * stamp must land on exactly the node that shows its field's draft text or image, Roster-owned text carries none, and no stamped
 * node is, or is inside, a node the card's CSS hides.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
import CinematicPartners from "@/components/cinematic/CinematicPartners";
import CinematicInjuryReport from "@/components/cinematic/CinematicInjuryReport";

beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });

const nodesFor = (root: StaticElement, id: string) => [...root.descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
const only = (root: StaticElement, id: string) => {
  const nodes = nodesFor(root, id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
};
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();
const stampedIds = (root: StaticElement) => [...root.descendants()].flatMap(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? []);
const unstamped = (root: StaticElement, selector: string) => {
  const nodes = root.querySelectorAll(selector);
  expect(nodes.length, selector).toBeGreaterThan(0);
  for (const node of nodes) expect(node.getAttribute(EDIT_TARGET_ATTRIBUTE), selector).toBeNull();
};
/** The declared fields of one registry section that have no stamped node in any of the given cards, as `section.field` / `section.row.field`. */
function missingIn(editor: keyof typeof EDIT_TARGET_REGISTRY, section: string, roots: StaticElement[]) {
  const present = new Set(roots.flatMap(stampedIds));
  const spec = EDIT_TARGET_REGISTRY[editor].sections[section];
  return [
    ...(spec.fields ?? []).filter(field => !present.has(`${editor}.${section}.${field}`)).map(field => `${section}.${field}`),
    ...(spec.rowFields ?? []).filter(field => ![...present].some(id => id.startsWith(`${editor}.${section}.row:`) && id.endsWith(`.${field}`))).map(field => `${section}.row.${field}`),
  ];
}

/** What a card's CSS module hides (`.x.x :global(.sel) { display: none }`), by card class, as selectors the strict static DOM can match. */
function hiddenBy(path: string) {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), hidden: Record<string, string[]> = {};
  for (const rule of css.matchAll(/([^{}]+)\{\s*display: none;\s*\}/g)) {
    for (const selector of rule[1].split(",")) {
      const match = selector.trim().match(/^\.(\w+)\.\1 (.+)$/);
      if (match) (hidden[match[1]] ??= []).push(match[2].replace(/:global\(([^)]*)\)/g, "$1").trim());
    }
  }
  return hidden;
}
function expectNoneHidden(root: StaticElement, selectors: string[]) {
  const stamped = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
  expect(stamped.length).toBeGreaterThan(0);
  for (const node of stamped) for (const selector of selectors) expect(node.closest(selector), `${node.getAttribute(EDIT_TARGET_ATTRIBUTE)} is inside ${selector}`).toBeNull();
}

/* ---------------------------------------------------------------- Partners */
const logoUrls = partnersFixtureLogoUrls();
/** A page card exactly as the editor renders it: the real page with the first partners. */
function pageRoot(content: CinematicPartnersContent, page: PartnerPage) {
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", null, createElement(CinematicPartners, { page, content: pageSample(content), logoUrls }))));
  applyEditTargetStamps(root as unknown as ParentNode, partnersPageStampsByCard().get(pageDialogId(page))!);
  return root;
}
/** A partner card exactly as the editor renders it: that one partner under the single-card CSS. `stampsFor` is the partner whose stamps are applied. */
function partnerRoot(content: CinematicPartnersContent, partnerId: string, stampsFor: string = partnerId) {
  const partner = content.partners.find(row => row.id === partnerId)!;
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "single" }, createElement(CinematicPartners, { page: "partners", content: singlePartnerContent(content, partner), logoUrls }))));
  applyEditTargetStamps(root as unknown as ParentNode, partnerStampsByCard(content.partners).get(partnerDialogId(stampsFor))!);
  return root;
}
const partners = partnersFixture();
const [P1, P2, P3] = PARTNER_IDS;
const pt = (id: string, field: "name" | "role" | "logo" | "tone") => `partners.partner.row:${id}.${field}`;

describe("Partners page cards: stamps on the real public markup", () => {
  it.each(["partners", "opportunities"] as const)("%s: heading, subtitle, intro, the bottom bar's prompt and its button, each on its own node", page => {
    const copy = partners.pages[page], root = pageRoot(partners, page);
    const id = (field: "title" | "subtitle" | "intro" | "ctaPrompt" | "ctaLabel") => `partners.${page}.${field}`;
    expect(only(root, id("title")).tagName).toBe("h1");
    expect(text(only(root, id("title")))).toBe(copy.title);
    expect(only(root, id("subtitle")).tagName).toBe("p");
    expect(text(only(root, id("subtitle")))).toBe(copy.subtitle);
    expect(only(root, id("intro")).getAttribute("class")).toBe("partner-intro");
    expect(text(only(root, id("intro")))).toBe(copy.intro);
    expect(only(root, id("ctaPrompt")).tagName).toBe("p");
    expect(text(only(root, id("ctaPrompt")))).toBe(copy.ctaPrompt);
    expect(only(root, id("ctaLabel")).tagName).toBe("a");
    expect(text(only(root, id("ctaLabel")))).toBe(copy.ctaLabel);
    expect(only(root, id("ctaLabel")).getAttribute("href")).toBe(page === "partners" ? PARTNERSHIP_ROUTE : partners.pages.opportunities.ctaHref);
    expect(stampedIds(root)).toHaveLength(5);
  });

  it("the partners drawn inside a page card belong to their own cards: none of their nodes carries an id", () => {
    const root = pageRoot(partners, "partners");
    expect(root.querySelectorAll(".partner-card")).toHaveLength(3);
    unstamped(root, ".partner-card, .partner-card img, .partner-card p, .partner-pending span");
    expect(stampedIds(root).every(id => id.startsWith("partners.partners."))).toBe(true);
  });

  it("an empty draft draws no subtitle, intro or bottom bar, so those have no stamp and the heading keeps its own", () => {
    const bare: CinematicPartnersContent = { pages: { partners: { title: "", subtitle: "", intro: "", ctaPrompt: "", ctaLabel: "" }, opportunities: { title: "", subtitle: "", intro: "", ctaPrompt: "", ctaLabel: "", ctaHref: "" } }, partners: [] };
    expect(stampedIds(pageRoot(bare, "partners"))).toEqual(["partners.partners.title"]);
    const noButton = structuredClone(partners);
    noButton.pages.opportunities.ctaHref = "";
    expect(nodesFor(pageRoot(noButton, "opportunities"), "partners.opportunities.ctaLabel")).toHaveLength(0);
  });
});

describe("Partner cards: stamps on the real public markup", () => {
  it("a partner with a logo: the logo's picture is the logo field; its role is the role; no name node (the name is only the picture's description)", () => {
    const root = partnerRoot(partners, P1);
    expect(only(root, pt(P1, "logo")).tagName).toBe("img");
    expect(only(root, pt(P1, "logo")).getAttribute("src")).toBe(partnerLogoUrl(PARTNER_LOGO_IDS[0]));
    expect(only(root, pt(P1, "logo")).getAttribute("alt")).toBe("Alpha Bank");
    expect(only(root, pt(P1, "role")).tagName).toBe("p");
    expect(text(only(root, pt(P1, "role")))).toBe("Official bank");
    expect(nodesFor(root, pt(P1, "name"))).toHaveLength(0);
    expect(stampedIds(root).sort()).toEqual([pt(P1, "logo"), pt(P1, "role")].sort());
  });

  it("a partner with no logo: the name shows as text and is the name field; there is no logo node to stamp", () => {
    const root = partnerRoot(partners, P2);
    expect(only(root, pt(P2, "name")).tagName).toBe("span");
    expect(text(only(root, pt(P2, "name")))).toBe("Beta Brewing");
    expect(text(only(root, pt(P2, "role")))).toBe("Official beer");
    expect(nodesFor(root, pt(P2, "logo"))).toHaveLength(0);
    unstamped(root, ".partner-pending small, .partner-logo, .partner-card");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("a partner with no role has no role stamp", () => {
    const bare = structuredClone(partners);
    bare.partners[0].role = "";
    expect(nodesFor(partnerRoot(bare, P1), pt(P1, "role"))).toHaveLength(0);
  });

  it("every id on a card is its own partner's uuid, and the colour treatment has no node (its control is stamped)", () => {
    for (const id of PARTNER_IDS) {
      const ids = stampedIds(partnerRoot(partners, id));
      expect(ids.length).toBeGreaterThan(0);
      for (const target of ids) expect(target.startsWith(`partners.partner.row:${id}.`), target).toBe(true);
      expect(ids.some(target => target.endsWith(".tone"))).toBe(false);
    }
  });

  it("reordered partners keep their ids: each card's nodes show their own partner's text, whatever its position", () => {
    const moved = structuredClone(partners);
    moved.partners.reverse();
    expect(moved.partners.map(row => row.id)).toEqual([P3, P2, P1]);
    expect(text(only(partnerRoot(moved, P3), pt(P3, "role")))).toBe("Official kit");
    expect(only(partnerRoot(moved, P3), pt(P3, "logo")).getAttribute("src")).toBe(partnerLogoUrl(PARTNER_LOGO_IDS[1]));
    expect(text(only(partnerRoot(moved, P1), pt(P1, "role")))).toBe("Official bank");
    expect(text(only(partnerRoot(moved, P2), pt(P2, "name")))).toBe("Beta Brewing");
    // The stamps the editor builds follow the uuids, not the positions.
    const byCard = partnerStampsByCard(moved.partners);
    expect([...byCard.keys()]).toEqual([`partner:${P3}`, `partner:${P2}`, `partner:${P1}`]);
    for (const [card, stamps] of byCard) {
      const uuid = card.slice("partner:".length);
      const ids = stamps.map(stamp => stamp.target(null as never, 0));
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(id?.startsWith(`partners.partner.row:${uuid}.`), `${card} ${id}`).toBe(true);
    }
  });

  it("an added partner is stamped by its own uuid and a removed one leaves no stamp", () => {
    const more = structuredClone(partners);
    const extra = "aaaaaaaa-0000-4000-8000-000000000009";
    more.partners.push({ id: extra, name: "Delta Dental", role: "Official dentist", logoAssetId: null, tone: "original" });
    expect(text(only(partnerRoot(more, extra), pt(extra, "name")))).toBe("Delta Dental");
    expect([...partnerStampsByCard(more.partners).keys()]).toHaveLength(4);
    const fewer = structuredClone(partners);
    fewer.partners.length = 1;
    expect([...partnerStampsByCard(fewer.partners).keys()]).toEqual([`partner:${P1}`]);
  });

  it("a stale stamp set never reaches a partner the card is not showing: another partner's stamps on this card land nowhere it has no node", () => {
    // P1 has a logo and P2 has none: P2's stamps on P1's card stamp the logo and role under P2's ids, and the card for P1 is not what P2 opens.
    const root = partnerRoot(partners, P1, P2);
    expect(stampedIds(root).every(id => id.startsWith(`partners.partner.row:${P2}.`))).toBe(true);
    const owned = stampedIds(root).map(id => resolveEditTarget(id)!);
    for (const target of owned) expect(partnersOwnsTarget(partnerDialogId(P1), target)).toBe(false);
  });

  it("with a filled draft exactly these declared fields have no node: the page's link and a partner's colour treatment", () => {
    const missing = [
      ...missingIn("partners", "partners", [pageRoot(partners, "partners")]),
      ...missingIn("partners", "opportunities", [pageRoot(partners, "opportunities")]),
      ...missingIn("partners", "partner", PARTNER_IDS.map(id => partnerRoot(partners, id))),
    ];
    expect(missing).toEqual(["opportunities.ctaHref", "partner.row.tone"]);
  });

  it("with a bare draft exactly these declared fields have no node on the page", () => {
    const bare: CinematicPartnersContent = { pages: { partners: { title: "", subtitle: "", intro: "", ctaPrompt: "", ctaLabel: "" }, opportunities: { title: "", subtitle: "", intro: "", ctaPrompt: "", ctaLabel: "", ctaHref: "" } }, partners: [{ id: P1, name: "", role: "", logoAssetId: null, tone: "original" }] };
    expect([
      ...missingIn("partners", "partners", [pageRoot(bare, "partners")]),
      ...missingIn("partners", "opportunities", [pageRoot(bare, "opportunities")]),
      ...missingIn("partners", "partner", [partnerRoot(bare, P1)]),
    ]).toEqual([
      "partners.subtitle", "partners.intro", "partners.ctaPrompt", "partners.ctaLabel",
      "opportunities.subtitle", "opportunities.intro", "opportunities.ctaPrompt", "opportunities.ctaLabel", "opportunities.ctaHref",
      "partner.row.role", "partner.row.logo", "partner.row.tone",
    ]);
  });

  it("the single-partner card's CSS hides the page's heading and bottom bar: no stamped node is, or is inside, one", () => {
    const hidden = hiddenBy("components/admin/partners/PartnerCardPreview.module.css");
    expect(hidden.single).toEqual([".partner-heading", ".partner-action"]);
    for (const id of PARTNER_IDS) expectNoneHidden(partnerRoot(partners, id), hidden.single);
    // The hidden markup is on the card (the page's own heading is drawn) and carries no stamp.
    unstamped(partnerRoot(partners, P1), ".partner-heading, .partner-heading h1");
  });

  it("a card's guard accepts its own fields and refuses everything else", () => {
    const own = resolveEditTarget(pt(P1, "role"))!, other = resolveEditTarget(pt(P2, "role"))!, page = resolveEditTarget(partnerPageTarget("partners", "title"))!, opp = resolveEditTarget(partnerPageTarget("opportunities", "title"))!;
    expect(partnersOwnsTarget(partnerDialogId(P1), own)).toBe(true);
    expect(partnersOwnsTarget(partnerDialogId(P1), other)).toBe(false);
    expect(partnersOwnsTarget(partnerDialogId(P1), page)).toBe(false);
    expect(partnersOwnsTarget(pageDialogId("partners"), page)).toBe(true);
    expect(partnersOwnsTarget(pageDialogId("partners"), opp)).toBe(false);
    expect(partnersOwnsTarget(pageDialogId("partners"), own)).toBe(false);
    expect(partnersOwnsTarget(pageDialogId("opportunities"), opp)).toBe(true);
    expect(partnersOwnsTarget("bogus", own)).toBe(false);
    expect(partnersOwnsTarget(partnerDialogId(P1), resolveEditTarget(INJURY_TARGETS.presenterName)!)).toBe(false);
  });

  it("the public Partners page markup has no id of its own", () => {
    expect(renderToStaticMarkup(createElement(CinematicPartners, { page: "partners", content: partners, logoUrls }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });

  it("the stamp helpers cover exactly the registry's partner fields", () => {
    const all = new Set([...partnersPageStamps("opportunities"), ...partnerItemStamps(P1)].flatMap(stamp => [stamp.target(null as never, 0)]));
    expect(all.has(partnerTarget(P1, "name"))).toBe(true);
    expect(all.has(editTarget("partners", "opportunities", "ctaLabel"))).toBe(true);
  });
});

/* ---------------------------------------------------------------- Injury Report */
const roster = injuryRosterFixture(), media = injuryMediaFixture();
const report = (content: CinematicInjuryReportContent, block: InjuryBlock) => reportFor(content, [], roster, media);
function blockRoot(content: CinematicInjuryReportContent, block: InjuryBlock) {
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: block === "presenter" ? "head" : "rehab" }, createElement(CinematicInjuryReport, { report: report(content, block) }))));
  applyEditTargetStamps(root as unknown as ParentNode, injuryBlockStampsByCard().get(block)!);
  return root;
}
/** An injury card exactly as the editor renders it: the entry alone, no logo, band or quote, former players kept as a placeholder. */
function entryRoot(content: CinematicInjuryReportContent, entryId: string, stampsFor: string = entryId, rosterRows = roster) {
  const entry = content.entries.find(row => row.id === entryId)!;
  const view = reportFor({ ...content, presenterLogoAssetId: null, bandAssetId: null, page: { ...content.page, quote: "" } }, [entry], rosterRows, [], true);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "single" }, createElement(CinematicInjuryReport, { report: view }))));
  applyEditTargetStamps(root as unknown as ParentNode, injuryStampsByCard(content.entries).get(entryDialogId(stampsFor))!);
  return root;
}
const injury = injuryFixture();
const [E1, E2, E3] = ENTRY_IDS;
const en = (id: string, field: "injury" | "timeline" | "note") => `injuryReport.entry.row:${id}.${field}`;

describe("Injury Report page-part cards: stamps on the real public markup", () => {
  it("presenter: the partner's logo picture is the logo field; with no logo the name shows as text and is the name field", () => {
    const root = blockRoot(injury, "presenter");
    expect(only(root, INJURY_TARGETS.presenterLogo).tagName).toBe("img");
    expect(only(root, INJURY_TARGETS.presenterLogo).getAttribute("src")).toBe(injuryUrl("logo"));
    expect(nodesFor(root, INJURY_TARGETS.presenterName)).toHaveLength(0);
    expect(stampedIds(root)).toHaveLength(1);
    const bare = structuredClone(injury);
    bare.presenterLogoAssetId = null;
    const named = blockRoot(bare, "presenter");
    expect(only(named, INJURY_TARGETS.presenterName).tagName).toBe("span");
    expect(text(only(named, INJURY_TARGETS.presenterName))).toBe("MVMNT CULTR");
    expect(nodesFor(named, INJURY_TARGETS.presenterLogo)).toHaveLength(0);
    // The page's own title and the "Presented by" caption are fixed words.
    unstamped(root, ".injury-heading h1, .injury-presenter > span");
  });

  it("rehab: the photo, the heading, the quote, who said it and the video, each on its own node", () => {
    const root = blockRoot(injury, "rehab");
    expect(only(root, INJURY_TARGETS.rehabBand).tagName).toBe("img");
    expect(only(root, INJURY_TARGETS.rehabBand).getAttribute("src")).toBe(injuryUrl("band"));
    expect(only(root, INJURY_TARGETS.rehabBand).getAttribute("alt")).toBe("Players in rehab");
    expect(only(root, INJURY_TARGETS.rehabHeading).tagName).toBe("h2");
    expect(text(only(root, INJURY_TARGETS.rehabHeading))).toBe("Rehab with MVMNT CULTR");
    expect(only(root, INJURY_TARGETS.rehabQuote).tagName).toBe("p");
    expect(text(only(root, INJURY_TARGETS.rehabQuote))).toBe("“Recovery is a team sport.”");
    expect(only(root, INJURY_TARGETS.rehabQuoteAttribution).tagName).toBe("figcaption");
    expect(text(only(root, INJURY_TARGETS.rehabQuoteAttribution))).toBe("Head physio");
    expect(only(root, INJURY_TARGETS.rehabVideoUrl).getAttribute("class")).toBe("injury-video");
    expect(only(root, INJURY_TARGETS.rehabVideoUrl).querySelectorAll("button.injury-video-cover")).toHaveLength(1);
    expect(stampedIds(root)).toHaveLength(5);
  });

  it("rehab with no photo, quote or video link: no stamp for the photo or the quote, and the video's cover keeps its own", () => {
    const bare = structuredClone(injury);
    bare.bandAssetId = null; bare.page.quote = ""; bare.page.quoteAttribution = ""; bare.page.videoUrl = "";
    const root = blockRoot(bare, "rehab");
    expect(stampedIds(root).sort()).toEqual([INJURY_TARGETS.rehabHeading, INJURY_TARGETS.rehabVideoUrl].sort());
    expect(text(only(root, INJURY_TARGETS.rehabVideoUrl))).toBe("Coming soon");
  });

  it("with a filled draft exactly these declared fields have no node: the presenter's name (a logo is set) and the photo's description", () => {
    expect([
      ...missingIn("injuryReport", "presenter", [blockRoot(injury, "presenter")]),
      ...missingIn("injuryReport", "rehab", [blockRoot(injury, "rehab")]),
      ...missingIn("injuryReport", "entry", ENTRY_IDS.map(id => entryRoot(injury, id))),
    ]).toEqual(["presenter.name", "rehab.bandAlt"]);
  });

  it("with a bare draft exactly these declared fields have no node on the page", () => {
    const bare: CinematicInjuryReportContent = { page: { presenterName: "", rehabHeading: "", quote: "", quoteAttribution: "", videoUrl: "", bandAlt: "" }, presenterLogoAssetId: null, bandAssetId: null, entries: [{ id: E1, playerId: INJURY_PLAYER_IDS[0], injury: "", timeline: "", note: "" }] };
    expect([
      ...missingIn("injuryReport", "presenter", [blockRoot(bare, "presenter")]),
      ...missingIn("injuryReport", "rehab", [blockRoot(bare, "rehab")]),
      ...missingIn("injuryReport", "entry", [entryRoot(bare, E1)]),
    ]).toEqual(["presenter.logo", "rehab.band", "rehab.bandAlt", "rehab.quote", "rehab.quoteAttribution", "entry.row.note"]);
  });

  it("the page-part cards' CSS hides the other part: no stamped node is, or is inside, a hidden node", () => {
    const hidden = hiddenBy("components/admin/injury-report/InjuryCardPreview.module.css");
    expect(hidden.head).toEqual([".injury-body", ".injury-band", ".injury-rehab", ".injury-quote", ".injury-video"]);
    expect(hidden.rehab).toEqual([".injury-heading", ".injury-body"]);
    expectNoneHidden(blockRoot(injury, "presenter"), hidden.head);
    expectNoneHidden(blockRoot(injury, "rehab"), hidden.rehab);
    unstamped(blockRoot(injury, "presenter"), ".injury-rehab h2, .injury-video");
  });
});

describe("Injury cards: stamps on the real public markup", () => {
  it("each entry's injury, timeline and note are stamped on their own lines, keyed by the entry's uuid", () => {
    for (const [id, row] of [[E1, injury.entries[0]], [E2, injury.entries[1]], [E3, injury.entries[2]]] as const) {
      const root = entryRoot(injury, id);
      const lines = root.querySelectorAll(".injury-details > p");
      expect(lines.map(text)).toEqual([`Injury ${row.injury}`, `Timeline ${row.timeline}`]);
      expect(only(root, en(id, "injury"))).toBe(lines[0]);
      expect(only(root, en(id, "timeline"))).toBe(lines[1]);
      if (row.note) { expect(only(root, en(id, "note")).getAttribute("class")).toBe("injury-note"); expect(text(only(root, en(id, "note")))).toBe(row.note); }
      else expect(nodesFor(root, en(id, "note"))).toHaveLength(0);
      for (const target of stampedIds(root)) expect(target.startsWith(`injuryReport.entry.row:${id}.`), target).toBe(true);
    }
  });

  it("the player's name, number, position and photo are Roster's and carry no id", () => {
    const root = entryRoot(injury, E1);
    expect(text(root.querySelectorAll(".injury-name")[0])).toBe("Pat Quinn #7");
    unstamped(root, ".injury-name, .injury-number, .injury-position, .injury-photo, .injury-photo img, .injury-top, .injury-info, .injury-card, .injury-details b");
    expect(stampedIds(root)).toHaveLength(3);
  });

  it("reordered entries keep their ids: each card shows its own entry's text, and the editor's stamps follow the uuids", () => {
    const moved = structuredClone(injury);
    moved.entries.reverse();
    expect(moved.entries.map(row => row.id)).toEqual([E3, E2, E1]);
    expect(text(only(entryRoot(moved, E3), en(E3, "injury")))).toBe("Injury Knee bruise");
    expect(text(only(entryRoot(moved, E1), en(E1, "timeline")))).toBe("Timeline 2-3 weeks");
    const byCard = injuryStampsByCard(moved.entries);
    expect([...byCard.keys()]).toEqual([`entry:${E3}`, `entry:${E2}`, `entry:${E1}`]);
    for (const [card, stamps] of byCard) {
      const uuid = card.slice("entry:".length);
      const ids = stamps.map(stamp => stamp.target(null as never, 0));
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(id?.startsWith(`injuryReport.entry.row:${uuid}.`), `${card} ${id}`).toBe(true);
    }
  });

  it("an entry whose player left the Roster is drawn as a placeholder and its own fields are still stamped", () => {
    const gone = { players: roster.players.filter(row => row.id !== INJURY_PLAYER_IDS[1]), assets: [] };
    const root = entryRoot(injury, E2, E2, gone);
    expect(text(root.querySelectorAll(".injury-name")[0])).toBe("Former player");
    expect(text(only(root, en(E2, "injury")))).toBe("Injury Ankle sprain");
    unstamped(root, ".injury-name, .injury-position");
  });

  it("an added entry is stamped by its own uuid and a removed one leaves no stamp", () => {
    const more = structuredClone(injury);
    const extra = "cccccccc-0000-4000-8000-000000000009";
    more.entries.push({ id: extra, playerId: INJURY_PLAYER_IDS[0], injury: "Concussion", timeline: "Out", note: "" });
    expect(text(only(entryRoot(more, extra), en(extra, "injury")))).toBe("Injury Concussion");
    expect([...injuryStampsByCard(more.entries).keys()]).toHaveLength(4);
    const fewer = structuredClone(injury);
    fewer.entries.length = 1;
    expect([...injuryStampsByCard(fewer.entries).keys()]).toEqual([`entry:${E1}`]);
  });

  it("another entry's stamps on this card never pass this card's guard", () => {
    const root = entryRoot(injury, E1, E2);
    for (const id of stampedIds(root)) expect(injuryOwnsTarget(entryDialogId(E1), resolveEditTarget(id)!)).toBe(false);
  });

  it("the single-injury card's CSS hides the page's heading, rehab, band, quote, video and cross: no stamped node is inside one", () => {
    const hidden = hiddenBy("components/admin/injury-report/InjuryCardPreview.module.css");
    expect(hidden.single).toEqual([".injury-heading", ".injury-rehab", ".injury-band", ".injury-quote", ".injury-video", ".injury-cross"]);
    for (const id of ENTRY_IDS) expectNoneHidden(entryRoot(injury, id), hidden.single);
  });

  it("a card's guard accepts its own fields and refuses everything else", () => {
    const own = resolveEditTarget(injuryEntryTarget(E1, "injury"))!, other = resolveEditTarget(injuryEntryTarget(E2, "injury"))!;
    expect(injuryOwnsTarget(entryDialogId(E1), own)).toBe(true);
    expect(injuryOwnsTarget(entryDialogId(E1), other)).toBe(false);
    expect(injuryOwnsTarget(entryDialogId(E1), resolveEditTarget(INJURY_TARGETS.rehabHeading)!)).toBe(false);
    expect(injuryOwnsTarget("presenter", resolveEditTarget(INJURY_TARGETS.presenterLogo)!)).toBe(true);
    expect(injuryOwnsTarget("presenter", resolveEditTarget(INJURY_TARGETS.rehabHeading)!)).toBe(false);
    expect(injuryOwnsTarget("rehab", resolveEditTarget(INJURY_TARGETS.rehabHeading)!)).toBe(true);
    expect(injuryOwnsTarget("rehab", own)).toBe(false);
    expect(injuryOwnsTarget("bogus", own)).toBe(false);
    expect(injuryOwnsTarget(entryDialogId(E1), resolveEditTarget(partnerTarget(P1, "role"))!)).toBe(false);
  });

  it("the public Injury Report markup has no id of its own, and the stamp helpers declare real ids", () => {
    expect(renderToStaticMarkup(createElement(CinematicInjuryReport, { report: reportFor(injury, injury.entries, roster, media) }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
    expect(injuryBlockStamps("rehab").length).toBe(5);
    expect(injuryEntryStamps(E1).length).toBe(2);
  });
});
