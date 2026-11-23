import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NEWS_IDS, NEWS_NEW_KEY, SPONSOR_KEYS, newsDraftFixture, sponsorDraftsFixture } from "../fixtures/visitor-click-fixtures";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { NewsArticleFields, type NewsFieldsApi } from "@/components/admin/news/NewsArticleFields";
import { NEWS_FIELD_SECTION, newsOwnsTarget, newsSectionOf, newsStampsByCard, newsTarget, type NewsField } from "@/components/admin/news/news-edit-targets";
import { NEWS_SECTIONS } from "@/components/admin/news/news-page";
import { RoseCitySponsorFields, type SponsorFieldsApi } from "@/components/admin/sponsors/rose-city/RoseCitySponsorFields";
import { sponsorStampsByPlace, sponsorTarget } from "@/components/admin/sponsors/rose-city/sponsors-edit-targets";

/**
 * UI-PREVIEW-CLICK-LIST-2: every declared News and Rose City Sponsors field has its control in the dialog, carrying the id a
 * preview click focuses it by; the two editors wire the cards' stamps, the click, the section, the guard and the focus.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.test"); });
const noop = () => undefined;
const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
/** The markup from one stamped control on, enough to see its label and value. */
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(at, at + 900);
};

/* ---------------------------------------------------------------- News */
const nApi = (key: string, index: number, patch: Partial<NewsFieldsApi["draft"]> = {}): NewsFieldsApi => ({
  articleKey: key, draft: { ...newsDraftFixture(index), ...patch }, slug: "article", timeZone: "America/Los_Angeles", problems: {}, locked: false, uploading: false,
  update: noop, upload: noop, removeCover: noop,
});
const nMarkup = (section: string, key: string = NEWS_IDS[0], index = 0, patch = {}) => renderToStaticMarkup(createElement(NewsArticleFields, { api: nApi(key, index, patch), id: section as never }));
const SECTION_FIELDS = { details: ["category", "cardHeading", "publishedLocal", "title", "subtitle"], photo: ["cover", "coverAlt"], article: ["body", "actionLabel", "actionHref"] } as const;

describe("News: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.news.sections;
  it("the registry's sections are the dialog's sections, every field is a row field keyed by the article, on the News route", () => {
    expect(EDIT_TARGET_REGISTRY.news.route).toBe("/admin/news");
    expect(Object.keys(SECTIONS)).toEqual(NEWS_SECTIONS.map(section => section.id));
    for (const section of NEWS_SECTIONS) {
      expect(SECTIONS[section.id].fields).toBeUndefined();
      expect(SECTIONS[section.id].rowFields).toEqual(SECTION_FIELDS[section.id]);
    }
  });

  it.each(NEWS_SECTIONS.map(section => section.id))("%s: each declared field is stamped on exactly one control under the article's own id, and nothing else is", section => {
    for (const key of [NEWS_IDS[1], NEWS_NEW_KEY]) {
      const stamped = stampsIn(nMarkup(section, key));
      expect([...stamped].sort()).toEqual(SECTION_FIELDS[section].map(field => `news.${section}.row:${key}.${field}`).sort());
      expect(new Set(stamped).size).toBe(stamped.length);
      for (const id of stamped) expect(resolveEditTarget(id), id).toMatchObject({ section, row: key });
    }
  });

  it("each field maps to the section that holds its control", () => {
    for (const [section, fields] of Object.entries(SECTION_FIELDS)) for (const field of fields) expect(NEWS_FIELD_SECTION[field as NewsField], field).toBe(section);
    for (const field of Object.keys(NEWS_FIELD_SECTION) as NewsField[]) expect(newsSectionOf(newsTarget(NEWS_IDS[0], field)), field).toBe(NEWS_FIELD_SECTION[field]);
    expect(newsSectionOf(undefined)).toBeUndefined();
    expect(newsSectionOf("partners.partner.row:x.name")).toBeUndefined();
    expect(newsSectionOf("news.nowhere.row:x.title")).toBeUndefined();
  });

  it("each control's id is on the control the label names", () => {
    expect(around(nMarkup("details", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "cardHeading"))).toMatch(/>Card heading<[\s\S]*value="Foothill Transit"/);
    expect(around(nMarkup("details", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "title"))).toMatch(/>Title<[\s\S]*value="New bus line to Robinson"/);
    expect(around(nMarkup("details", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "subtitle"))).toMatch(/>Subtitle \(optional\)<[\s\S]*value="Subtitle 0"/);
    expect(around(nMarkup("details", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "publishedLocal"))).toMatch(/>Date and time<[\s\S]*value="2026-11-10T12:00"/);
    expect(around(nMarkup("photo", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "coverAlt"))).toMatch(/>Photo description<[\s\S]*value="Cover 0"/);
    expect(around(nMarkup("article", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "body"))).toMatch(/>Article text<[\s\S]*First paragraph 0/);
    expect(around(nMarkup("article", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "actionLabel"))).toMatch(/>Button label \(optional\)<[\s\S]*value="Partner with us"/);
    expect(around(nMarkup("article", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "actionHref"))).toMatch(/>Button link<[\s\S]*value="\/community\/partnership"/);
  });

  it("the category id sits on the chosen option, so focus lands on the radio that is selected; the cover id wraps the photo field", () => {
    for (const [index, label] of [[0, "News"], [1, "Community"]] as const) {
      const markup = nMarkup("details", NEWS_IDS[0], index, { category: index === 0 ? "news" : "community" });
      expect(stampsIn(markup).filter(id => id.endsWith(".category"))).toHaveLength(1);
      expect(around(markup, newsTarget(NEWS_IDS[0], "category"))).toMatch(new RegExp(`^[^>]*><input type="radio"[^>]*checked=""[^>]*/><span[^>]*><i[^>]*></i>${label}</span>`));
    }
    expect(around(nMarkup("photo", NEWS_IDS[0]), newsTarget(NEWS_IDS[0], "cover"))).toMatch(/Cover photo/);
  });

  it("controls follow their article's id: another article's dialog carries only its own ids", () => {
    for (const [key, index] of [[NEWS_IDS[0], 0], [NEWS_IDS[2], 2]] as const) for (const section of NEWS_SECTIONS) {
      expect(stampsIn(nMarkup(section.id, key, index)).every(id => id.includes(`.row:${key}.`))).toBe(true);
    }
    expect(around(nMarkup("details", NEWS_IDS[2], 2), newsTarget(NEWS_IDS[2], "title"))).toMatch(/value="The derby preview"/);
  });

  it("one stamps array per card, built from the ids alone, and the guard accepts only that article's fields", () => {
    const stamps = newsStampsByCard([NEWS_IDS[0], NEWS_NEW_KEY]);
    expect([...stamps.keys()]).toEqual([NEWS_IDS[0], NEWS_NEW_KEY]);
    const targets = (key: string) => stamps.get(key)!.map(stamp => stamp.target(null as never, 0));
    expect(targets(NEWS_IDS[0])).toEqual(["cardHeading", "title", "cover", "category"].map(field => newsTarget(NEWS_IDS[0], field as NewsField)));
    const own = resolveEditTarget(newsTarget(NEWS_IDS[0], "title"))!;
    expect(newsOwnsTarget(NEWS_IDS[0], own)).toBe(true);
    expect(newsOwnsTarget(NEWS_IDS[2], own)).toBe(false);
    expect(newsOwnsTarget(NEWS_NEW_KEY, resolveEditTarget(newsTarget(NEWS_NEW_KEY, "cover"))!)).toBe(true);
  });
});

describe("the News editor", () => {
  const editor = read("components/admin/news/CinematicNewsEditor.tsx");

  it("a card click opens the section of the clicked field (Details when there is none) on that article, then focuses the field", () => {
    expect(editor).toMatch(/function open\(card: NewsCardItem, event\?: MouseEvent<HTMLElement>, target\?: EditTargetId\) \{/);
    expect(editor).toMatch(/setOpenKey\(card\.key\);\s*dialog\.openSection\(newsSectionOf\(target\) \?\? "details", event\);\s*dialog\.focusField\(target\);/);
    expect(editor).toMatch(/onEdit=\{\(card, event, target\) => open\(card, event, target\)\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("Add article still opens the new article on Details with no field", () => {
    expect(editor).toMatch(/setOpenKey\(key\);\s*dialog\.openSection\("details", event\);\s*\}/);
  });

  it("the cards are stamped from one array per article, rebuilt only when the article ids change, with the article guard", () => {
    expect(editor).toMatch(/const cardKeys = cards\.map\(card => card\.key\)\.join\("\\n"\);/);
    expect(editor).toMatch(/const cardStamps = useMemo\(\(\) => newsStampsByCard\(cardKeys \? cardKeys\.split\("\\n"\) : \[\]\), \[cardKeys\]\);/);
    expect(editor).toMatch(/stamps=\{key => cardStamps\.get\(key\) \?\? NO_STAMPS\} ownsTarget=\{newsOwnsTarget\}/);
  });

  it("the dialog's controls are given the article's id; its live preview of the article stays inert", () => {
    expect(editor).toMatch(/articleKey: entry\.key, draft,/);
    const preview = editor.slice(editor.indexOf("renderPreview={() =>"));
    expect(preview).not.toMatch(/stamps|onClick|editTarget/);
  });

  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["CinematicNews", "CinematicNewsPartners", "CinematicSponsors"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });

  it("news fields are keyed by the article id in the registry, never by position", () => {
    expect(read("components/admin/news/news-edit-targets.ts")).not.toMatch(/\.indexOf\(|\[\d\]|index/);
  });
});

/* ---------------------------------------------------------------- Rose City Sponsors */
const sApi = (): SponsorFieldsApi => ({
  drafts: sponsorDraftsFixture(), locked: false, uploading: false, errors: {}, canAdd: () => true,
  setName: noop, setWebsite: noop, move: noop, remove: noop, replace: noop, add: noop,
});
const sMarkup = () => renderToStaticMarkup(createElement(RoseCitySponsorFields, { api: sApi(), place: "carousel" }));
const se = (key: string, field: string) => `sponsors.carousel.row:${key}.${field}`;

describe("Sponsors: every declared field has its control in the dialog", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.sponsors.sections;
  it("the registry is the one carousel section with name, website and logo keyed by the sponsor's key, on the Sponsors route", () => {
    expect(EDIT_TARGET_REGISTRY.sponsors.route).toBe("/admin/sponsors");
    expect(Object.keys(SECTIONS)).toEqual(["carousel"]);
    expect(SECTIONS.carousel.fields).toBeUndefined();
    expect(SECTIONS.carousel.rowFields).toEqual(["name", "website", "logo"]);
  });

  it("each sponsor's row stamps its three fields under its own key, once each, and nothing else is stamped", () => {
    const stamped = stampsIn(sMarkup());
    expect([...stamped].sort()).toEqual(SPONSOR_KEYS.flatMap(key => ["name", "website", "logo"].map(field => se(key, field))).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const id of stamped) expect(resolveEditTarget(id)?.section, id).toBe("carousel");
  });

  it("each control's id is on the control the label names, in that sponsor's own row", () => {
    const markup = sMarkup();
    expect(around(markup, se(SPONSOR_KEYS[0], "name"))).toMatch(/>Name<[\s\S]*value="Alpha Bank"/);
    expect(around(markup, se(SPONSOR_KEYS[1], "website"))).toMatch(/>Their website \(optional\)<[\s\S]*value="betabrewing\.test"/);
    expect(around(markup, se(SPONSOR_KEYS[2], "name"))).toMatch(/value="Gamma Gear"/);
    expect(markup).toMatch(new RegExp(`aria-label="Replace logo for Beta Brewing"[^>]*data-edit-target="${se(SPONSOR_KEYS[1], "logo").replace(/[.:]/g, "\\$&")}"`));
    expect(markup).toMatch(new RegExp(`data-sponsor-row="${SPONSOR_KEYS[1]}"[\\s\\S]*?${se(SPONSOR_KEYS[1], "name").replace(/[.:]/g, "\\$&")}`));
  });

  it("controls follow their sponsor's key when the sponsors are reordered", () => {
    const api = { ...sApi(), drafts: sponsorDraftsFixture().reverse() };
    const markup = renderToStaticMarkup(createElement(RoseCitySponsorFields, { api, place: "carousel" }));
    expect(around(markup, se(SPONSOR_KEYS[0], "name"))).toMatch(/value="Alpha Bank"/);
    expect(markup.indexOf(se(SPONSOR_KEYS[2], "name"))).toBeLessThan(markup.indexOf(se(SPONSOR_KEYS[0], "name")));
  });

  it("the stamps map holds one array per place, built from the keys alone", () => {
    const stamps = sponsorStampsByPlace({ carousel: SPONSOR_KEYS });
    expect([...stamps.keys()]).toEqual(["carousel"]);
    expect(stamps.get("carousel")![0].target(null as never, 1)).toBe(sponsorTarget(SPONSOR_KEYS[1], "logo"));
  });
});

describe("the Rose City Sponsors editor", () => {
  const editor = read("components/admin/sponsors/rose-city/RoseCitySponsorsEditor.tsx");
  const targets = read("components/admin/sponsors/rose-city/sponsors-edit-targets.ts");

  it("the card opens the clicked sponsor's place and asks the dialog to focus the field; the dialog is given the request", () => {
    expect(editor).toMatch(/onEdit=\{\(id, event: MouseEvent<HTMLButtonElement>, target\) => \{ dialog\.openSection\(id as Place, event\); dialog\.focusField\(target\); \}\}/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("the card stamps the draft the preview shows (the deferred one), rebuilt only when the sponsors' keys change", () => {
    expect(editor).toMatch(/const carouselKeys = inPlace\(deferred, "carousel"\)\.map\(\(draft\) => draft\.key\)\.join\("\\n"\);/);
    expect(editor).toMatch(/const placeStamps = useMemo\(\(\) => sponsorStampsByPlace\(\{ carousel: carouselKeys \? carouselKeys\.split\("\\n"\) : \[\] \}\), \[carouselKeys\]\);/);
    expect(editor).toMatch(/stamps=\{\(id\) => placeStamps\.get\(id\) \?\? NO_STAMPS\}/);
  });

  it("the preview is stamped on both sets, the clone mapped back to its sponsor with a modulo, never by position alone", () => {
    expect(targets).toMatch(/selector: "\.sponsor-set img"/);
    expect(targets).toMatch(/draftKeys\[index % draftKeys\.length\]/);
  });

  it("the dialog's own sections stay as they were, and the public strip gains nothing", () => {
    expect(editor.slice(editor.indexOf("<EditorDialog"))).not.toMatch(/stamps|onClick/);
    expect(read("components/cinematic/CinematicSponsors.tsx")).not.toMatch(/edit-target|editTarget/);
  });
});
