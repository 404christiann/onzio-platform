import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { aboutDrafts, contactFixture, policiesFixture } from "../fixtures/about-contact-policies-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
import { applyEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { SECTIONS, contentOfAbout, contentOfLogo, moveCard, pageOfSection, type AboutDrafts, type SectionId } from "@/components/admin/about/rose-city/about-sections";
import { ABOUT_TARGETS, colorTarget, featureTarget, aboutPreviewStamps, storyParagraphTarget, valueTarget } from "@/components/admin/about/rose-city/about-edit-targets";
import { CONTACT_SECTIONS, type ContactSectionId } from "@/components/admin/contact/contact-sections";
import { CONTACT_TARGETS, contactPreviewStamps, contactRowTarget } from "@/components/admin/contact/contact-edit-targets";
import { PAGE_DIALOG_ID, rowDialogId } from "@/components/admin/policies/policies-sections";
import { POLICY_TARGETS, lineTarget, policiesPageStamps, policiesRowStamps, policyCardContent, rowHeadingTarget } from "@/components/admin/policies/policies-edit-targets";
import { CONTACT_ACTIONS } from "@/lib/cinematic-contact-content";

/**
 * UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES: the card stamps, run against the real public markup (CinematicAbout, CinematicCrest,
 * CinematicContact, CinematicPolicyPage) rendered the way each card renders it: the draft's content inside `div.only[data-only]`
 * (placeholders on for About and Club Logo). Each stamp must land on exactly the node that shows its field's draft text or image,
 * and never on a node the card's CSS hides.
 */
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "club-1", name: "Rose City FC" }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => createElement("img", { src, alt, className }) }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
import CinematicAbout from "@/components/cinematic/CinematicAbout";
import CinematicCrest from "@/components/cinematic/CinematicCrest";
import CinematicContact from "@/components/cinematic/CinematicContact";
import CinematicPolicyPage from "@/components/cinematic/CinematicPolicyPage";

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
/** What each card's CSS hides (the editor's .module.css), as selectors the strict static DOM can match; nth-child rules are returned separately. */
function hiddenByCss(path: string) {
  const css = readFileSync(path, "utf8"), plain: string[] = [], nth: { only: string; formula: string }[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*display:\s*none\s*!important[^{}]*)\}/g)) {
    for (const part of rule[1].split(",").map(selector => selector.trim()).filter(Boolean)) {
      const match = part.match(/^\.only\[data-only="(\w+)"\] :global\(\.contact-row:nth-child\(([^)]+)\)\)$/);
      if (match) nth.push({ only: match[1], formula: match[2] });
      else plain.push(part.replace(/:global\(([^)]*)\)/g, "$1"));
    }
  }
  return { plain, nth };
}
const inHiddenNode = (node: StaticElement, selectors: string[]) => selectors.some(selector => node.matches(selector));
const nthMatches = (formula: string, position: number) => {
  if (/^\d+$/.test(formula)) return position === Number(formula);
  const rest = formula.match(/^(-?)n\+(\d+)$/);
  if (!rest) throw new Error(`unsupported nth-child ${formula}`);
  return rest[1] ? position <= Number(rest[2]) : position >= Number(rest[2]);
};

/* ---------------------------------------------------------------- About and Club Logo */
const drafts = aboutDrafts();
function aboutRoot(state: AboutDrafts, id: SectionId, stampsFrom: AboutDrafts = state) {
  const page = pageOfSection(id) === "about"
    ? createElement(CinematicAbout, { content: contentOfAbout(state.about), editorEmptySections: true })
    : createElement(CinematicCrest, { content: contentOfLogo(state.logo), editorEmptySections: true });
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": id }, page)));
  applyEditTargetStamps(root as unknown as ParentNode, aboutPreviewStamps(stampsFrom, id));
  return root;
}
const ABOUT_CSS = hiddenByCss("components/admin/about/rose-city/AboutEditor.module.css").plain;
const ALL = [...SECTIONS.about, ...SECTIONS.logo].map(section => section.id);

describe("About stamps on the real public markup", () => {
  it("hero: the page heading", () => {
    const root = aboutRoot(drafts, "hero");
    expect(only(root, ABOUT_TARGETS.heroHeading).tagName).toBe("h1");
    expect(text(only(root, ABOUT_TARGETS.heroHeading))).toBe("About Rose City");
    expect(stampedIds(root)).toHaveLength(1);
  });

  it("story: each paragraph by position (blank ones draw an empty paragraph, so position is the draft's) and the photo", () => {
    const root = aboutRoot(drafts, "story");
    drafts.about.story_paragraphs.forEach((paragraph, index) => {
      expect(only(root, storyParagraphTarget(index)).tagName).toBe("p");
      expect(text(only(root, storyParagraphTarget(index)))).toBe(paragraph);
    });
    expect(only(root, ABOUT_TARGETS.storyImage).tagName).toBe("img");
    expect(only(root, ABOUT_TARGETS.storyImage).getAttribute("src")).toBe("/images/about.webp");
    expect(stampedIds(root)).toHaveLength(drafts.about.story_paragraphs.length + 1);
  });

  it("story with no paragraphs and no photo: the placeholder line is not a field, nothing is stamped", () => {
    const empty = aboutDrafts();
    empty.about.story_paragraphs = []; empty.about.feature_image_url = "";
    const root = aboutRoot(empty, "story");
    expect(text(root.querySelectorAll(".about-paragraphs > p")[0])).toBe("Add your club story");
    unstamped(root, ".about-paragraphs > p");
    expect(stampedIds(root)).toEqual([]);
  });

  it("values: the heading, and each value's title and description by the card's own id (a value with no title still has its node)", () => {
    const root = aboutRoot(drafts, "values");
    expect(only(root, ABOUT_TARGETS.valuesHeading).tagName).toBe("h2");
    expect(text(only(root, ABOUT_TARGETS.valuesHeading))).toBe("What we stand for");
    drafts.about.values.forEach(value => {
      expect(only(root, valueTarget(value._id, "title")).tagName).toBe("h3");
      expect(text(only(root, valueTarget(value._id, "title")))).toBe(value.title);
      expect(only(root, valueTarget(value._id, "description")).tagName).toBe("p");
      expect(text(only(root, valueTarget(value._id, "description")))).toBe(value.description);
    });
    unstamped(root, ".about-value-number");
    expect(stampedIds(root)).toHaveLength(1 + drafts.about.values.length * 2);
  });

  it("values follow the card's id when the cards move: the stamps built from the moved draft match the moved page", () => {
    const moved: AboutDrafts = { ...drafts, about: { ...drafts.about, values: moveCard(moveCard(drafts.about.values, drafts.about.values[0]._id, 1), drafts.about.values[0]._id, 1) } };
    const root = aboutRoot(moved, "values");
    const titles = root.querySelectorAll(".about-values-grid > article > h3");
    expect(titles.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual(moved.about.values.map(value => valueTarget(value._id, "title")));
    expect(text(titles[2])).toBe("Community");
    // Stamps still built from the draft before the move (not yet rebuilt) would point each title at a different card: the memo must follow the draft.
    const stale = aboutRoot(moved, "values", drafts);
    expect(stale.querySelectorAll(".about-values-grid > article > h3").map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).not.toEqual(titles.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE)));
  });

  it("values heading blank: the page draws no h2, so the field has no node", () => {
    const state = aboutDrafts();
    state.about.values_heading = "";
    expect(nodesFor(aboutRoot(state, "values"), ABOUT_TARGETS.valuesHeading)).toHaveLength(0);
  });

  it("closing: the closing text and the button's words; the destination has no node", () => {
    const root = aboutRoot(drafts, "closing");
    expect(only(root, ABOUT_TARGETS.closingText).tagName).toBe("h2");
    expect(text(only(root, ABOUT_TARGETS.closingText))).toBe("Join us on match day.");
    expect(only(root, ABOUT_TARGETS.closingButtonLabel).tagName).toBe("a");
    expect(text(only(root, ABOUT_TARGETS.closingButtonLabel))).toBe("See the Schedule");
    expect(nodesFor(root, ABOUT_TARGETS.closingDestination)).toHaveLength(0);
    expect(stampedIds(root)).toHaveLength(2);
  });

  it("closing with no text: no heading is drawn, so none is stamped", () => {
    const state = aboutDrafts();
    state.about.closing_text = "";
    const root = aboutRoot(state, "closing");
    expect(nodesFor(root, ABOUT_TARGETS.closingText)).toHaveLength(0);
    expect(text(only(root, ABOUT_TARGETS.closingButtonLabel))).toBe("See the Schedule");
  });

  it("images: the crest diagram and the map are stamped as boxes, so a click works on the picture or on its placeholder", () => {
    const root = aboutRoot(drafts, "images");
    expect(only(root, ABOUT_TARGETS.imagesAnnotated).getAttribute("class")).toContain("crest-diagram");
    expect(only(root, ABOUT_TARGETS.imagesAnnotated).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/crest.png");
    expect(only(root, ABOUT_TARGETS.imagesMap).getAttribute("class")).toContain("identity-map");
    expect(only(root, ABOUT_TARGETS.imagesMap).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/map.png");
    const empty = aboutDrafts();
    empty.logo.annotated_image_url = ""; empty.logo.map_image_url = "";
    const bare = aboutRoot(empty, "images");
    expect(text(only(bare, ABOUT_TARGETS.imagesAnnotated))).toBe("Add the annotated crest artwork");
    expect(text(only(bare, ABOUT_TARGETS.imagesMap))).toBe("Add the club map artwork");
  });

  it("features: patch, title and description by the card's id; an icon only on the cards that have one, matched by their own card (not by the icon's index)", () => {
    const root = aboutRoot(drafts, "features");
    const [f1, f2, f3] = drafts.logo.features;
    for (const feature of drafts.logo.features) {
      expect(only(root, featureTarget(feature._id, "title")).tagName).toBe("h2");
      expect(text(only(root, featureTarget(feature._id, "title")))).toBe(feature.title);
      expect(text(only(root, featureTarget(feature._id, "description")))).toBe(feature.description);
      expect(only(root, featureTarget(feature._id, "patch")).getAttribute("class")).toBe("feature-patch");
      expect(only(root, featureTarget(feature._id, "patch")).querySelectorAll("img")[0].getAttribute("src")).toBe(feature.patch_url);
    }
    expect(nodesFor(root, featureTarget(f2._id, "icon"))).toHaveLength(0);
    expect(only(root, featureTarget(f1._id, "icon")).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/icon-1.png");
    // The third card's icon is the page's second icon node: it must carry the third card's id, not the second's.
    expect(only(root, featureTarget(f3._id, "icon")).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/icon-3.png");
    expect(only(root, featureTarget(f3._id, "icon")).closest(".identity-feature")?.querySelectorAll("h2")[0].textContent).toBe("Feature 3");
    expect(stampedIds(root)).toHaveLength(3 * 3 + 2);
    unstamped(root, ".feature-number");
  });

  it("features follow the card's id when the cards move", () => {
    const moved: AboutDrafts = { ...drafts, logo: { ...drafts.logo, features: moveCard(moveCard(drafts.logo.features, drafts.logo.features[2]._id, -1), drafts.logo.features[2]._id, -1) } };
    const root = aboutRoot(moved, "features");
    expect(root.querySelectorAll(".identity-feature h2").map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual(moved.logo.features.map(feature => featureTarget(feature._id, "title")));
    expect(text(only(root, featureTarget(moved.logo.features[0]._id, "title")))).toBe("Feature 3");
    expect(only(root, featureTarget(moved.logo.features[0]._id, "icon")).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/icon-3.png");
  });

  it("colors: each card's box is its image; a card with no picture shows its label, which is the label field", () => {
    const root = aboutRoot(drafts, "colors");
    drafts.logo.color_cards.forEach(card => {
      expect(only(root, colorTarget(card._id, "image")).parentElement?.getAttribute("class")).toContain("identity-colors");
    });
    const [red, midnight] = drafts.logo.color_cards;
    expect(only(root, colorTarget(red._id, "image")).querySelectorAll("img")[0].getAttribute("src")).toBe("/images/red.png");
    expect(nodesFor(root, colorTarget(red._id, "label"))).toHaveLength(0);
    expect(text(only(root, colorTarget(midnight._id, "label")))).toBe("Midnight");
    expect(only(root, colorTarget(midnight._id, "label")).parentElement).toBe(only(root, colorTarget(midnight._id, "image")));
    expect(stampedIds(root)).toHaveLength(3 + 1);
  });

  it("colors with no cards: the placeholder is not a field", () => {
    const state = aboutDrafts();
    state.logo.color_cards = [];
    const root = aboutRoot(state, "colors");
    expect(text(root.querySelectorAll(".identity-colors > div")[0])).toBe("Add the first color card");
    expect(stampedIds(root)).toEqual([]);
  });

  it.each(ALL)("%s: only its own section's fields are stamped, and never a node the card's CSS hides", id => {
    const root = aboutRoot(drafts, id);
    const ids = stampedIds(root);
    expect(ids.length).toBeGreaterThan(0);
    for (const target of ids) expect(target.startsWith(`about.${id}.`), target).toBe(true);
    for (const node of root.descendants()) if (node.hasAttribute(EDIT_TARGET_ATTRIBUTE)) expect(inHiddenNode(node, ABOUT_CSS.filter(selector => selector.includes(`data-only="${id}"`))), node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? "").toBe(false);
  });

  it.each(ALL)("%s: the CSS hides every other card's section and keeps its own", id => {
    const root = aboutRoot(drafts, id);
    const visible = (selector: string) => root.querySelectorAll(selector).filter(node => !inHiddenNode(node, ABOUT_CSS.filter(rule => rule.includes(`data-only="${id}"`))));
    const sectionsOf = (name: string) => visible(`[data-about-editor-section="${name}"]`).length;
    for (const section of SECTIONS.about) expect(sectionsOf(section.id) > 0, `${id} shows ${section.id}`).toBe(pageOfSection(id) === "about" && section.id === id);
    if (id === "images") { expect(visible(".identity-map").length).toBe(1); expect(visible(".identity-features").length + visible(".identity-colors").length).toBe(0); }
    if (id === "features") expect(visible(".identity-features").length + visible(".identity-intro").length + visible(".identity-place").length).toBe(1);
    if (id === "colors") expect(visible(".identity-colors").length).toBe(1);
    if (id === "colors") expect(visible(".identity-features").length + visible(".identity-map").length + visible(".identity-intro").length).toBe(0);
  });

  it("every declared About field has a stamped node in some card, except the five that have only a control", () => {
    const missing: string[] = [];
    for (const [section, spec] of Object.entries(EDIT_TARGET_REGISTRY.about.sections)) {
      const present = new Set(stampedIds(aboutRoot(drafts, section as SectionId)));
      for (const field of spec.fields ?? []) if (!present.has(`about.${section}.${field}`)) missing.push(`${section}.${field}`);
      for (const field of spec.rowFields ?? []) if (![...present].some(id => id.includes(".row:") && id.endsWith(`.${field}`))) missing.push(`${section}.row.${field}`);
    }
    expect(missing.sort()).toEqual(["closing.destination", "features.row.iconScale", "features.row.iconSize"]);
  });

  it("the public markup has no id: only the admin preview stamps", () => {
    const html = renderToStaticMarkup(createElement(CinematicAbout, { content: contentOfAbout(drafts.about) })) + renderToStaticMarkup(createElement(CinematicCrest, { content: contentOfLogo(drafts.logo) }));
    expect(html).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

/* ---------------------------------------------------------------- Contact */
const contact = contactFixture();
function contactRoot(content = contact, id: ContactSectionId) {
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": id }, createElement(CinematicContact, { content }))));
  applyEditTargetStamps(root as unknown as ParentNode, contactPreviewStamps(id));
  return root;
}
const CONTACT_CSS = hiddenByCss("components/admin/contact/ContactEditor.module.css");
/** The rows (1-based) and whether the heading shows in a card, from the CSS the card ships. */
const contactShown = (id: ContactSectionId) => ({
  heading: !CONTACT_CSS.plain.some(selector => selector === `.only[data-only="${id}"] .contact-heading`) && id === "heading",
  actions: !CONTACT_CSS.plain.some(selector => selector === `.only[data-only="${id}"] .contact-actions`),
  rows: [1, 2, 3, 4, 5].filter(position => !CONTACT_CSS.nth.some(rule => rule.only === id && nthMatches(rule.formula, position))),
});

describe("Contact stamps on the real public markup", () => {
  it("heading: the title and the red subtitle", () => {
    const root = contactRoot(contact, "heading");
    expect(only(root, CONTACT_TARGETS.title).tagName).toBe("h1");
    expect(text(only(root, CONTACT_TARGETS.title))).toBe("Contact the Club");
    expect(only(root, CONTACT_TARGETS.subtitle).tagName).toBe("p");
    expect(text(only(root, CONTACT_TARGETS.subtitle))).toBe("We answer fast");
    expect(stampedIds(root)).toHaveLength(2);
  });

  it.each(CONTACT_ACTIONS)("%s: only its own row's words and button are stamped, with that row's text", action => {
    const root = contactRoot(contact, action);
    const row = contact.rows[action];
    expect(only(root, contactRowTarget(action, "prompt")).tagName).toBe("span");
    expect(text(only(root, contactRowTarget(action, "prompt")))).toBe(row.prompt);
    expect(["a", "span"]).toContain(only(root, contactRowTarget(action, "action")).tagName);
    expect(text(only(root, contactRowTarget(action, "action")))).toBe(row.action);
    expect(stampedIds(root).sort()).toEqual([contactRowTarget(action, "action"), contactRowTarget(action, "prompt")].sort());
    // The stamped nodes are in the card's own row, which is the one row its CSS leaves showing.
    const own = CONTACT_ACTIONS.indexOf(action);
    expect(contactShown(action).rows).toEqual([own + 1]);
    expect(contactShown(action).heading).toBe(false);
    for (const node of root.descendants()) if (node.hasAttribute(EDIT_TARGET_ATTRIBUTE)) expect(node.closest(".contact-row")?.parentElement?.children.indexOf(node.closest(".contact-row") as StaticElement)).toBe(own);
  });

  it("the heading card shows only the heading", () => {
    expect(contactShown("heading")).toEqual({ heading: true, actions: false, rows: [1, 2, 3, 4, 5] });
  });

  it("Information with no destination yet: its grey 'Link pending' box is the button's node; with a destination it is the link", () => {
    const pending = { ...contact, informationHref: "" };
    const root = contactRoot(pending, "information");
    expect(only(root, contactRowTarget("information", "action")).tagName).toBe("span");
    expect(only(root, contactRowTarget("information", "action")).getAttribute("class")).toBe("contact-pending");
    expect(only(root, contactRowTarget("information", "action")).textContent).toContain(pending.rows.information.action);
    expect(only(contactRoot(contact, "information"), contactRowTarget("information", "action")).tagName).toBe("a");
    expect(nodesFor(root, contactRowTarget("information", "destination"))).toHaveLength(0);
  });

  it("only the button's stamp claims the 'Link pending' box, so it never depends on which stamp runs last", () => {
    const pending = { ...contact, informationHref: "" };
    const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": "information" }, createElement(CinematicContact, { content: pending }))));
    const box = [...root.querySelectorAll(".contact-pending")];
    expect(box).toHaveLength(1);
    const claims = contactPreviewStamps("information").flatMap(stamp => {
      const index = [...root.querySelectorAll(stamp.selector)].indexOf(box[0]);
      return index < 0 ? [] : [stamp.target(box[0] as unknown as Element, index)];
    }).filter(Boolean);
    expect(claims).toEqual([contactRowTarget("information", "action")]);
  });

  it("the page always draws five rows in CONTACT_ACTIONS order, even with every text blank, so a row's position is its action's", () => {
    const blank = structuredClone(contact);
    for (const action of CONTACT_ACTIONS) { blank.rows[action].prompt = ""; blank.rows[action].action = ""; }
    blank.informationHref = "";
    const root = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicContact, { content: blank })));
    expect(root.querySelectorAll(".contact-actions > .contact-row")).toHaveLength(CONTACT_ACTIONS.length);
    const full = parseStaticMarkup(renderToStaticMarkup(createElement(CinematicContact, { content: contact })));
    expect(full.querySelectorAll(".contact-actions > .contact-row").map(row => text(row.children[0]))).toEqual(CONTACT_ACTIONS.map(action => contact.rows[action].prompt));
  });

  it("every declared Contact field has a stamped node in some card, except the destination", () => {
    const missing: string[] = [];
    for (const [section, spec] of Object.entries(EDIT_TARGET_REGISTRY.contact.sections)) {
      const present = new Set(stampedIds(contactRoot(contact, section as ContactSectionId)));
      for (const field of spec.fields ?? []) if (!present.has(`contact.${section}.${field}`)) missing.push(`${section}.${field}`);
    }
    expect(missing).toEqual(["information.destination"]);
    expect(CONTACT_SECTIONS).toHaveLength(6);
  });

  it("the public markup has no id", () => {
    expect(renderToStaticMarkup(createElement(CinematicContact, { content: contact }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});

/* ---------------------------------------------------------------- Policies */
const policies = policiesFixture();
function policyRoot(id: string, stamps = id === PAGE_DIALOG_ID ? policiesPageStamps() : policiesRowStamps(policies.guidelines.rows.find(row => `row:${row.id}` === id)!), page = policies.guidelines) {
  const only = id === PAGE_DIALOG_ID ? "page" : "row";
  const root = parseStaticMarkup(renderToStaticMarkup(createElement("div", { className: "only", "data-only": only }, createElement(CinematicPolicyPage, { page: policyCardContent(page, id) }))));
  applyEditTargetStamps(root as unknown as ParentNode, stamps);
  return root;
}
const POLICY_CSS = hiddenByCss("components/admin/policies/policies.module.css").plain;

describe("Policies stamps on the real public markup", () => {
  it("the page card: the title, the red line and the section heading", () => {
    const root = policyRoot(PAGE_DIALOG_ID);
    expect(only(root, POLICY_TARGETS.title).tagName).toBe("h1");
    expect(text(only(root, POLICY_TARGETS.title))).toBe("Stadium Guidelines");
    expect(only(root, POLICY_TARGETS.subtitle).tagName).toBe("p");
    expect(text(only(root, POLICY_TARGETS.subtitle))).toBe("& FAQ’s");
    expect(only(root, POLICY_TARGETS.heading).tagName).toBe("h2");
    expect(text(only(root, POLICY_TARGETS.heading))).toBe("Guidelines");
    expect(stampedIds(root)).toHaveLength(3);
  });

  it("the page card with a blank red line and section heading: those fields have no node (the page draws none)", () => {
    const page = { ...policies.guidelines, subtitle: "", heading: "" };
    const root = policyRoot(PAGE_DIALOG_ID, undefined, page);
    expect(nodesFor(root, POLICY_TARGETS.subtitle)).toHaveLength(0);
    expect(nodesFor(root, POLICY_TARGETS.heading)).toHaveLength(0);
    expect(stampedIds(root)).toEqual([POLICY_TARGETS.title]);
  });

  it("a row card: the heading by the row's id and each drawn answer line by its draft position (blank lines are not drawn, so the nodes skip them)", () => {
    const row = policies.guidelines.rows[0];
    const root = policyRoot(rowDialogId(row.id));
    expect(only(root, rowHeadingTarget("accessibility")).tagName).toBe("h3");
    expect(text(only(root, rowHeadingTarget("accessibility")))).toBe("Accessibility");
    const drawn = [0, 2, 4];
    for (const index of drawn) {
      expect(text(only(root, lineTarget("accessibility", index)))).toBe(row.blocks[index].text);
      expect(only(root, lineTarget("accessibility", index)).tagName).toBe(row.blocks[index].kind === "subheading" ? "h4" : "p");
    }
    for (const blank of [1, 3]) expect(nodesFor(root, lineTarget("accessibility", blank))).toHaveLength(0);
    expect(stampedIds(root)).toHaveLength(1 + drawn.length);
  });

  it("a row with no answer shows 'Details coming soon.', which is not a field", () => {
    const root = policyRoot(rowDialogId("bags"));
    expect(text(root.querySelectorAll(".policy-pending")[0])).toBe("Details coming soon.");
    unstamped(root, ".policy-pending");
    expect(stampedIds(root)).toEqual([rowHeadingTarget("bags")]);
  });

  it("a row card draws only its own row, whatever the page holds", () => {
    const root = policyRoot(rowDialogId("animals"));
    expect(root.querySelectorAll(".policy-row")).toHaveLength(1);
    expect(stampedIds(root)).toEqual([rowHeadingTarget("animals"), lineTarget("animals", 0)]);
    expect(text(only(root, lineTarget("animals", 0)))).toBe("No pets.");
  });

  it("the other page's rows stamp with their own ids", () => {
    const row = policies.fanCode.rows[0];
    const root = policyRoot(rowDialogId(row.id), policiesRowStamps(row), policies.fanCode);
    expect(text(only(root, rowHeadingTarget("respect")))).toBe("Respect");
    expect(text(only(root, lineTarget("respect", 0)))).toBe("Be kind.");
  });

  it.each([PAGE_DIALOG_ID, ...policies.guidelines.rows.map(row => rowDialogId(row.id))])("%s: no stamped node is inside a node the card's CSS hides, and the card hides what it should", id => {
    const root = policyRoot(id);
    const rules = POLICY_CSS.filter(selector => selector.includes(`data-only="${id === PAGE_DIALOG_ID ? "page" : "row"}"`));
    for (const node of root.descendants()) if (node.hasAttribute(EDIT_TARGET_ATTRIBUTE)) expect(inHiddenNode(node, rules), node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? "").toBe(false);
    const shown = (selector: string) => root.querySelectorAll(selector).filter(node => !inHiddenNode(node, rules)).length;
    if (id === PAGE_DIALOG_ID) { expect(shown(".policy-empty")).toBe(0); expect(shown(".policy-heading")).toBe(1); expect(shown(".policy-body > h2")).toBe(1); }
    else { expect(shown(".policy-heading")).toBe(0); expect(shown(".policy-body > h2")).toBe(0); expect(shown(".policy-row")).toBe(1); }
  });

  it("every declared Policies field has a stamped node in some card", () => {
    const row = policies.guidelines.rows[0];
    const ids = [...stampedIds(policyRoot(PAGE_DIALOG_ID)), ...stampedIds(policyRoot(rowDialogId(row.id)))];
    for (const [section, spec] of Object.entries(EDIT_TARGET_REGISTRY.policies.sections)) {
      for (const field of spec.fields ?? []) expect(ids, `${section}.${field}`).toContain(`policies.${section}.${field}`);
      for (const field of spec.rowFields ?? []) expect(ids.some(id => id.startsWith(`policies.${section}.row:`) && id.endsWith(`.${field}`)), `${section} rows ${field}`).toBe(true);
    }
  });

  it("the public markup has no id", () => {
    expect(renderToStaticMarkup(createElement(CinematicPolicyPage, { page: policies.guidelines }))).not.toContain(EDIT_TARGET_ATTRIBUTE);
  });
});
