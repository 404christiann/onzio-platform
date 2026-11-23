import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { aboutDrafts, contactFixture, policiesFixture } from "../fixtures/about-contact-policies-fixtures";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import { ABOUT_CONTACT_POLICIES_TARGETS } from "@/lib/edit-targets/about-contact-policies";
import { SECTIONS, moveCard, type AboutDrafts, type SectionId } from "@/components/admin/about/rose-city/about-sections";
import { AboutSectionFields, type AboutFieldsApi } from "@/components/admin/about/rose-city/AboutSectionFields";
import { ABOUT_TARGETS, colorTarget, featureTarget, storyParagraphTarget, valueTarget } from "@/components/admin/about/rose-city/about-edit-targets";
import { CONTACT_SECTIONS, type ContactSectionId } from "@/components/admin/contact/contact-sections";
import { ContactSectionFields } from "@/components/admin/contact/ContactSectionFields";
import { CONTACT_TARGETS, contactRowTarget } from "@/components/admin/contact/contact-edit-targets";
import { PAGE_DIALOG_ID, rowDialogId } from "@/components/admin/policies/policies-sections";
import { PolicyDialogFields, type PolicyFieldsApi } from "@/components/admin/policies/PolicyDialogFields";
import { POLICY_TARGETS, lineTarget, policiesOwnsTarget, rowHeadingTarget } from "@/components/admin/policies/policies-edit-targets";
import { CONTACT_ACTIONS } from "@/lib/cinematic-contact-content";

/**
 * UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES: every declared About, Contact and Policies field has exactly one control in the dialog,
 * carrying the id a preview click focuses it by, in the dialog section the id names; the three editors wire the cards' stamps, the
 * click and the focus.
 */
vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;
const CONTROLS = "input:not([type=hidden]),textarea,select,button";
/** The ids stamped on a rendered dialog panel, with a check that each one wraps a control a click can focus. */
function stampedIn(markup: string): string[] {
  const root = parseStaticMarkup(markup);
  const nodes = [...root.descendants()].filter(node => node.hasAttribute(EDIT_TARGET_ATTRIBUTE));
  for (const node of nodes) expect(node.matches(CONTROLS) || node.querySelectorAll(CONTROLS).length > 0, node.getAttribute(EDIT_TARGET_ATTRIBUTE) ?? "").toBe(true);
  return nodes.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) as string);
}
/** The stamped node for an id, and the label text before its first control. */
function nodeOf(markup: string, id: string): StaticElement {
  const nodes = [...parseStaticMarkup(markup).descendants()].filter(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE) === id);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
}
const labelOf = (node: StaticElement) => (node.querySelectorAll("label")[0] ?? node.querySelectorAll("legend")[0])?.textContent ?? node.getAttribute("aria-label") ?? "";
const valueOf = (node: StaticElement) => { const control = node.querySelectorAll("input,textarea")[0]; return control ? control.getAttribute("value") ?? control.textContent : null; };

/** Every registry declaration of one editor's section is stamped on its dialog panel (single fields by id, row fields on every row). */
function declaredFieldsAreStamped(editor: string, section: string, stamped: string[]) {
  const spec = EDIT_TARGET_REGISTRY[editor].sections[section];
  for (const field of spec.fields ?? []) expect(stamped, `${editor}.${section}.${field}`).toContain(`${editor}.${section}.${field}`);
  for (const field of spec.rowFields ?? []) expect(stamped.some(id => id.startsWith(`${editor}.${section}.row:`) && id.endsWith(`.${field}`)), `${editor}.${section} rows ${field}`).toBe(true);
}

/* ---------------------------------------------------------------- the registry */
describe("the registry entries", () => {
  it("About, Contact and Policies are declared from the one module, on their own routes", () => {
    for (const editor of ["about", "contact", "policies"]) expect(EDIT_TARGET_REGISTRY[editor]).toBe(ABOUT_CONTACT_POLICIES_TARGETS[editor]);
    expect(EDIT_TARGET_REGISTRY.about.route).toBe("/admin/about");
    expect(EDIT_TARGET_REGISTRY.contact.route).toBe("/admin/contact");
    expect(EDIT_TARGET_REGISTRY.policies.route).toBe("/admin/policies");
  });
  it("the sections are exactly the dialog sections: About's seven, Contact's six, Policies' page heading and rows", () => {
    expect(Object.keys(EDIT_TARGET_REGISTRY.about.sections)).toEqual([...SECTIONS.about, ...SECTIONS.logo].map(section => section.id));
    expect(Object.keys(EDIT_TARGET_REGISTRY.contact.sections)).toEqual(CONTACT_SECTIONS.map(section => section.id));
    expect(Object.keys(EDIT_TARGET_REGISTRY.policies.sections)).toEqual(["page", "row"]);
  });
  it("the registry file spreads the module with one line and imports nothing else new", () => {
    const registry = read("lib/admin-edit-targets.ts");
    expect(registry).toMatch(/^import \{ ABOUT_CONTACT_POLICIES_TARGETS \} from "\.\/edit-targets\/about-contact-policies";$/m);
    expect(registry).toMatch(/^export const EDIT_TARGET_REGISTRY: EditTargetRegistry = \{\n  \.\.\.ABOUT_CONTACT_POLICIES_TARGETS,$/m);
    expect(read("lib/edit-targets/about-contact-policies.ts")).not.toMatch(/^import(?! type)/m);
  });
});

describe("the id builders write exactly the ids the registry's grammar names", () => {
  it("about", () => {
    expect(ABOUT_TARGETS.heroHeading).toBe("about.hero.heading");
    expect(ABOUT_TARGETS.closingButtonLabel).toBe("about.closing.buttonLabel");
    expect(storyParagraphTarget(3)).toBe("about.story.row:3.paragraph");
    expect(valueTarget("card-7", "title")).toBe("about.values.row:card-7.title");
    expect(valueTarget("card-7", "description")).toBe("about.values.row:card-7.description");
    expect(featureTarget("card-8", "iconScale")).toBe("about.features.row:card-8.iconScale");
    expect(colorTarget("card-9", "label")).toBe("about.colors.row:card-9.label");
  });
  it("contact", () => {
    expect(CONTACT_TARGETS.subtitle).toBe("contact.heading.subtitle");
    expect(contactRowTarget("tickets", "prompt")).toBe("contact.tickets.prompt");
    expect(contactRowTarget("information", "destination")).toBe("contact.information.destination");
  });
  it("policies", () => {
    expect(POLICY_TARGETS.heading).toBe("policies.page.heading");
    expect(rowHeadingTarget("accessibility")).toBe("policies.row.row:accessibility.heading");
    expect(lineTarget("accessibility", 2)).toBe("policies.row.row:accessibility-l2.line");
  });
});

/* ---------------------------------------------------------------- About */
const fixed = aboutDrafts();
const aboutApi = (drafts: AboutDrafts): AboutFieldsApi => ({
  drafts, locked: false, uploading: false, errors: {}, setAbout: noop, setLogo: noop, retire: noop, upload: async () => true, onMediaPending: noop,
  destinations: { options: [], loaded: true, available: true, error: null, retry: noop },
});
const aboutMarkup = (id: SectionId, drafts = fixed) => renderToStaticMarkup(createElement(AboutSectionFields, { api: aboutApi(drafts), id }));
/** What each About section's dialog must stamp for a draft, written out from the registry's grammar and the draft (not from the helpers under test). */
function aboutExpected(id: SectionId, drafts: AboutDrafts): string[] {
  const p = (field: string, row?: string | number) => `about.${id}.${row === undefined ? "" : `row:${row}.`}${field}`;
  switch (id) {
    case "hero": return [p("heading")];
    case "story": return [p("image"), ...drafts.about.story_paragraphs.map((_, index) => p("paragraph", index))];
    case "values": return [p("heading"), ...drafts.about.values.flatMap(value => [p("title", value._id), p("description", value._id)])];
    case "closing": return [p("text"), p("buttonLabel"), p("destination")];
    case "images": return [p("annotated"), p("map")];
    case "features": return drafts.logo.features.flatMap(card => ["title", "description", "patch", "icon", "iconSize", "iconScale"].map(field => p(field, card._id)));
    case "colors": return drafts.logo.color_cards.flatMap(card => [p("label", card._id), p("image", card._id)]);
  }
}

describe("About: every declared field has its control in the dialog", () => {
  it.each([...SECTIONS.about, ...SECTIONS.logo].map(section => section.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampedIn(aboutMarkup(id));
    expect([...stamped].sort()).toEqual(aboutExpected(id, fixed).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
    declaredFieldsAreStamped("about", id, stamped);
  });

  it("each control's id is on the control the label names", () => {
    expect(labelOf(nodeOf(aboutMarkup("hero"), ABOUT_TARGETS.heroHeading))).toBe("Page heading");
    expect(valueOf(nodeOf(aboutMarkup("hero"), ABOUT_TARGETS.heroHeading))).toBe("About Rose City");
    expect(labelOf(nodeOf(aboutMarkup("story"), ABOUT_TARGETS.storyImage))).toBe("Feature image");
    expect(nodeOf(aboutMarkup("story"), storyParagraphTarget(3)).querySelectorAll("textarea")[0].getAttribute("aria-label")).toBe("Story paragraphs, paragraph 4");
    expect(valueOf(nodeOf(aboutMarkup("story"), storyParagraphTarget(3)))).toBe("Story three.");
    expect(labelOf(nodeOf(aboutMarkup("values"), ABOUT_TARGETS.valuesHeading))).toBe("Values heading");
    expect(labelOf(nodeOf(aboutMarkup("closing"), ABOUT_TARGETS.closingText))).toBe("Closing text");
    expect(labelOf(nodeOf(aboutMarkup("closing"), ABOUT_TARGETS.closingButtonLabel))).toBe("Button text");
    expect(labelOf(nodeOf(aboutMarkup("closing"), ABOUT_TARGETS.closingDestination))).toBe("Button goes to");
    expect(labelOf(nodeOf(aboutMarkup("images"), ABOUT_TARGETS.imagesAnnotated))).toBe("Annotated crest image");
    expect(labelOf(nodeOf(aboutMarkup("images"), ABOUT_TARGETS.imagesMap))).toBe("Map image");
  });

  it("value, feature and color rows are keyed by the card's own id, and follow it when the cards move", () => {
    const drafts = fixed;
    const [v0, v1, v2] = drafts.about.values.map(value => value._id);
    const moved: AboutDrafts = { ...drafts, about: { ...drafts.about, values: moveCard(drafts.about.values, v0, 1) }, logo: { ...drafts.logo, features: moveCard(drafts.logo.features, drafts.logo.features[2]._id, -1), color_cards: [...drafts.logo.color_cards].reverse() } };
    expect([...stampedIn(aboutMarkup("values", moved))].sort()).toEqual(aboutExpected("values", moved).sort());
    expect([...stampedIn(aboutMarkup("features", moved))].sort()).toEqual(aboutExpected("features", moved).sort());
    expect([...stampedIn(aboutMarkup("colors", moved))].sort()).toEqual(aboutExpected("colors", moved).sort());
    // The first value on the page is now the one that was second: its controls come first and carry its id.
    expect(stampedIn(aboutMarkup("values", moved)).filter(id => id.endsWith(".title"))).toEqual([valueTarget(v1, "title"), valueTarget(v0, "title"), valueTarget(v2, "title")]);
    expect(valueOf(nodeOf(aboutMarkup("values", moved), valueTarget(v0, "title")))).toBe("Community");
    expect(valueOf(nodeOf(aboutMarkup("values", moved), valueTarget(v1, "title")))).toBe("");
    expect(valueOf(nodeOf(aboutMarkup("features", moved), featureTarget(moved.logo.features[1]._id, "title")))).toBe("Feature 3");
    expect(valueOf(nodeOf(aboutMarkup("colors", moved), colorTarget(moved.logo.color_cards[0]._id, "label")))).toBe("White");
  });

  it("the card ids are unique across all three kinds of card, so no two controls share an id", () => {
    const { about, logo } = fixed;
    const ids = [...about.values, ...logo.features, ...logo.color_cards].map(card => card._id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a stamp is a data attribute on the field's own wrapper only", () => {
    expect(aboutMarkup("hero")).toMatch(/<div class="[^"]*" data-edit-target="about\.hero\.heading"><div class="[^"]*"><label[^>]*>Page heading<\/label><input/);
    expect(aboutMarkup("images").replace(/ data-edit-target="[^"]+"/g, "")).not.toContain("data-edit-target");
  });
});

/* ---------------------------------------------------------------- Contact */
const contactMarkup = (id: ContactSectionId) => renderToStaticMarkup(createElement(ContactSectionFields, { api: { draft: contactFixture(), locked: false, errors: {}, update: noop }, id }));
const contactExpected = (id: ContactSectionId) => id === "heading" ? ["contact.heading.title", "contact.heading.subtitle"]
  : [`contact.${id}.prompt`, `contact.${id}.action`, ...(id === "information" ? ["contact.information.destination"] : [])];

describe("Contact: every declared field has its control in the dialog", () => {
  it.each(CONTACT_SECTIONS.map(section => section.id))("%s: each declared field is stamped on exactly one control, and nothing else is", id => {
    const stamped = stampedIn(contactMarkup(id));
    expect([...stamped].sort()).toEqual(contactExpected(id).sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe(id);
    declaredFieldsAreStamped("contact", id, stamped);
  });
  it("each control's id is on the control the label names", () => {
    expect([labelOf(nodeOf(contactMarkup("heading"), CONTACT_TARGETS.title)), valueOf(nodeOf(contactMarkup("heading"), CONTACT_TARGETS.title))]).toEqual(["Title", "Contact the Club"]);
    expect([labelOf(nodeOf(contactMarkup("heading"), CONTACT_TARGETS.subtitle)), valueOf(nodeOf(contactMarkup("heading"), CONTACT_TARGETS.subtitle))]).toEqual(["Subtitle", "We answer fast"]);
    for (const action of CONTACT_ACTIONS) {
      expect(labelOf(nodeOf(contactMarkup(action), contactRowTarget(action, "prompt")))).toBe("Row text");
      expect(labelOf(nodeOf(contactMarkup(action), contactRowTarget(action, "action")))).toBe("Button text");
    }
    expect([labelOf(nodeOf(contactMarkup("information"), contactRowTarget("information", "destination"))), valueOf(nodeOf(contactMarkup("information"), contactRowTarget("information", "destination")))]).toEqual(["Information destination", "mailto:office@example.com"]);
  });
  it("a row's id carries the row's own action, so Media's button never focuses Tickets'", () => {
    expect(contactRowTarget("media", "action")).toBe("contact.media.action");
    expect(new Set(CONTACT_ACTIONS.map(action => contactRowTarget(action, "prompt"))).size).toBe(CONTACT_ACTIONS.length);
  });
});

/* ---------------------------------------------------------------- Policies */
const policyApi = (page: "guidelines" | "fanCode" = "guidelines"): PolicyFieldsApi => ({ draft: policiesFixture(), page, locked: false, errors: {}, edit: noop, moveRow: noop, removeRow: noop });
const policyMarkup = (id: Parameters<typeof PolicyDialogFields>[0]["id"], page: "guidelines" | "fanCode" = "guidelines") => renderToStaticMarkup(createElement(PolicyDialogFields, { api: policyApi(page), id }));

describe("Policies: every declared field has its control in the dialog", () => {
  it("the page heading stamps its three fields, in the registry's page section", () => {
    const stamped = stampedIn(policyMarkup(PAGE_DIALOG_ID));
    expect([...stamped].sort()).toEqual(["policies.page.heading", "policies.page.subtitle", "policies.page.title"]);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe("page");
    declaredFieldsAreStamped("policies", "page", stamped);
    expect([labelOf(nodeOf(policyMarkup(PAGE_DIALOG_ID), POLICY_TARGETS.title)), valueOf(nodeOf(policyMarkup(PAGE_DIALOG_ID), POLICY_TARGETS.title))]).toEqual(["Title", "Stadium Guidelines"]);
    expect(labelOf(nodeOf(policyMarkup(PAGE_DIALOG_ID), POLICY_TARGETS.subtitle))).toBe("Red line under the title");
    expect(labelOf(nodeOf(policyMarkup(PAGE_DIALOG_ID), POLICY_TARGETS.heading))).toBe("Section heading");
  });

  it("a row stamps its heading by its own id and every answer line (blank ones too) by `<row id>-l<n>`", () => {
    const markup = policyMarkup(rowDialogId("accessibility"));
    const stamped = stampedIn(markup);
    expect([...stamped].sort()).toEqual([rowHeadingTarget("accessibility"), ...[0, 1, 2, 3, 4].map(n => lineTarget("accessibility", n))].sort());
    declaredFieldsAreStamped("policies", "row", stamped);
    for (const target of stamped) expect(resolveEditTarget(target)?.section, target).toBe("row");
    expect([labelOf(nodeOf(markup, rowHeadingTarget("accessibility"))), valueOf(nodeOf(markup, rowHeadingTarget("accessibility")))]).toEqual(["Row heading", "Accessibility"]);
    expect([labelOf(nodeOf(markup, lineTarget("accessibility", 0))), valueOf(nodeOf(markup, lineTarget("accessibility", 0)))]).toEqual(["Line 1 subheading", "Parking"]);
    expect([labelOf(nodeOf(markup, lineTarget("accessibility", 2))), valueOf(nodeOf(markup, lineTarget("accessibility", 2)))]).toEqual(["Line 3 paragraph", "ADA parking."]);
    expect(valueOf(nodeOf(markup, lineTarget("accessibility", 4)))).toBe("Seating.");
  });

  it("a row with no lines stamps only its heading; a row that is not on the page renders nothing", () => {
    expect(stampedIn(policyMarkup(rowDialogId("bags")))).toEqual([rowHeadingTarget("bags")]);
    expect(policyMarkup(rowDialogId("gone"))).toBe("");
  });

  it("the other page's row stamps with that row's id (rows belong to the page being edited)", () => {
    expect(stampedIn(policyMarkup(rowDialogId("respect"), "fanCode"))).toEqual([rowHeadingTarget("respect"), lineTarget("respect", 0)]);
  });
});

describe("Policies: a card owns exactly its own fields (the card id has a colon, so ownsTarget decides)", () => {
  const resolved = (id: string) => resolveEditTarget(id) as ResolvedEditTarget;
  const draft = policiesFixture();
  const cards = [PAGE_DIALOG_ID, ...draft.guidelines.rows.map(row => rowDialogId(row.id))];
  const ownedBy = (target: string) => cards.filter(card => policiesOwnsTarget(card, resolved(target)));
  it("the page card owns the three page fields and nothing from a row", () => {
    for (const id of [POLICY_TARGETS.title, POLICY_TARGETS.subtitle, POLICY_TARGETS.heading]) expect(ownedBy(id)).toEqual([PAGE_DIALOG_ID]);
  });
  it("each row card owns its row's heading and lines and no other row's, even when one row id starts with another's", () => {
    for (const row of draft.guidelines.rows) {
      expect(ownedBy(rowHeadingTarget(row.id))).toEqual([rowDialogId(row.id)]);
      for (const n of [0, 1, 7]) expect(ownedBy(lineTarget(row.id, n))).toEqual([rowDialogId(row.id)]);
    }
    // A row called "accessibility-l1" must not take the first line of "accessibility".
    const lookalike = [PAGE_DIALOG_ID, rowDialogId("accessibility"), rowDialogId("accessibility-l1")];
    expect(lookalike.filter(card => policiesOwnsTarget(card, resolved(lineTarget("accessibility", 1))))).toEqual([rowDialogId("accessibility")]);
    expect(lookalike.filter(card => policiesOwnsTarget(card, resolved(rowHeadingTarget("accessibility-l1"))))).toEqual([rowDialogId("accessibility-l1")]);
  });
  it("a field of another editor, or an id that is no card, is owned by nothing", () => {
    const home = resolveEditTarget("homepage.hero.eyebrow") as ResolvedEditTarget;
    expect(cards.filter(card => policiesOwnsTarget(card, home))).toEqual([]);
    expect(policiesOwnsTarget("nonsense", resolved(POLICY_TARGETS.title))).toBe(false);
  });
});

/* ---------------------------------------------------------------- the editors */
describe("the three editors wire the cards, the click and the focus", () => {
  const about = read("components/admin/about/rose-city/RoseCityAboutEditor.tsx");
  const contact = read("components/admin/contact/CinematicContactEditor.tsx");
  const policies = read("components/admin/policies/CinematicPolicyEditor.tsx");

  it("cards are the kit's PreviewCards (not SectionCards), each opening the clicked field's section and asking the dialog to focus it", () => {
    for (const source of [about, contact, policies]) {
      expect(source).toContain("PreviewCards");
      expect(source).not.toMatch(/\bSectionCards\b/);
      expect(source).toMatch(/dialog\.openSection\(id as \w+, event\); dialog\.focusField\(target\)/);
      expect(source).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
      expect(source).toMatch(/mode="split"/);
    }
    expect(about).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as SectionId, event\); dialog\.focusField\(target\); \}\}/);
    expect(contact).toMatch(/onEdit=\{\(id, event, target\) => \{ dialog\.openSection\(id as ContactSectionId, event\); dialog\.focusField\(target\); \}\}/);
    expect(policies).toMatch(/const onEdit = \(id: string, event: React\.MouseEvent<HTMLButtonElement>, target\?: [^)]*\) => \{ dialog\.openSection\(id as PolicyDialogId, event\); dialog\.focusField\(target\); \};/);
  });
  it("the cards stamp the draft the preview shows (the deferred one), built once per draft", () => {
    expect(about).toMatch(/const deferred = useDeferredValue\(drafts\);\n  const stampsBySection = useMemo\(\(\) => new Map\(ALL_SECTIONS\.map\(section => \[section\.id, deferred \? aboutPreviewStamps\(deferred, section\.id\) : \[\]\]\)\), \[deferred\]\);/);
    expect(about).toMatch(/stamps=\{id => stampsBySection\.get\(id as SectionId\) \?\? \[\]\}/);
    expect(about).toMatch(/const previewOf = \(id: string\) => deferred && sharedSettled && <SectionLive id=\{id as SectionId\} drafts=\{deferred\}/);
    expect(contact).toMatch(/^const STAMPS = new Map<string, ReturnType<typeof contactPreviewStamps>>\(CONTACT_SECTIONS\.map\(section => \[section\.id, contactPreviewStamps\(section\.id\)\]\)\);$/m);
    expect(contact).toMatch(/stamps=\{id => STAMPS\.get\(id\) \?\? \[\]\}/);
    expect(contact).toMatch(/const previewOf = \(id: string\) => deferred && sharedSettled && <SectionLive/);
    expect(policies).toMatch(/const deferred = useDeferredValue\(draft\);\n  const stampsByCard = useMemo\(\(\) => policiesStampsByCard\(deferred\?\.\[page\]\.rows \?\? \[\], rowDialogId\), \[deferred, page\]\);/);
    expect(policies).toMatch(/stamps=\{id => stampsByCard\.get\(id\) \?\? \[\]\} ownsTarget=\{policiesOwnsTarget\}/);
    expect(policies).toMatch(/const live = deferred\?\.\[page\]; return live && sharedSettled && <CardLive/);
  });
  it("Policies' two grids both own their targets through ownsTarget", () => {
    expect(policies.match(/ownsTarget=\{policiesOwnsTarget\}/g)).toHaveLength(2);
  });
  it("the dialog's own live preview stays inert: no stamps and no click handlers there", () => {
    for (const source of [about, contact, policies]) expect(source.slice(source.indexOf("renderPreview={id => dialog.open"))).not.toMatch(/stamps|onClick|onEdit/);
  });
  it("the previews read the Homepage content once for the site shell, so no card fetches it on its own", () => {
    for (const source of [about, contact, policies]) {
      expect(source.match(/fetchCinematicHomepageContent\(club\.id\)/g)).toHaveLength(1);
      expect(source).toMatch(/initialContent=\{shared\}/);
      expect(source).toMatch(/\.finally\(\(\) => \{ if \(active\) setSharedSettled\(true\); \}\)/);
    }
  });
  it("save payloads, capabilities and validation are untouched: the editors still build and send through their own modules", () => {
    expect(about).toContain("buildAboutSaveRequest(");
    expect(about).toContain("saveAboutEditor(request)");
    expect(contact).toContain("buildContactSaveInput(");
    expect(contact).toContain("saveCinematicContactEditor(request)");
    expect(policies).toContain("buildPolicySaveRequest(");
    expect(policies).toContain("saveCinematicPolicyEditor(request)");
  });
  it("only the admin preview stamps public nodes; the public components gain nothing", () => {
    for (const file of ["CinematicAbout", "CinematicCrest", "CinematicContact", "CinematicPolicyPage"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });
});
