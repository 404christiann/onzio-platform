import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CONTACT_ACTIONS, cinematicContactSaveSchema, starterCinematicContactContent, type CinematicContactContent, type CinematicContactSave,
} from "@/lib/cinematic-contact-content";
import {
  CONTACT_SECTIONS, buildContactSaveInput, changedContactSections, contactFieldErrors, contactPageState, contactSectionOfPath,
  contactSectionSlice, contactSectionSummary, firstContactErrorSection,
} from "@/components/admin/contact/contact-sections";
import { ContactSectionFields } from "@/components/admin/contact/ContactSectionFields";

const OPERATION = "6f1b3c0e-5a38-4d0a-9c53-0d1f3a0a1b11";
const snapshot = { revision: "7", designRevision: "cinematic@2:rev" };
const saved = (): CinematicContactContent => ({ ...starterCinematicContactContent(), informationHref: "mailto:office@example.com" });

/** The request the editor built before the rebuild: the whole draft, parsed by the save schema, in the schema's key order. */
function legacyRequest(draft: CinematicContactContent) {
  const parsed = cinematicContactSaveSchema.safeParse({ operationId: OPERATION, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft });
  if (!parsed.success) throw new Error("legacy save refused");
  return parsed.data;
}
function rebuiltRequest(draft: CinematicContactContent, pending: CinematicContactSave | null = null) {
  const parsed = cinematicContactSaveSchema.safeParse(buildContactSaveInput({ pending, operationId: OPERATION, snapshot, draft }));
  if (!parsed.success) throw new Error("rebuilt save refused");
  return parsed.data;
}

describe("RC-ADMIN-4a Contact editor: save payload", () => {
  const edits: [string, (content: CinematicContactContent) => void][] = [
    ["title", content => { content.title = "Contact Rose City ·rcv"; }],
    ["subtitle", content => { content.subtitle = "Reach the front office"; }],
    ["row text", content => { content.rows.tickets.prompt = "Ticket questions & orders"; }],
    ["button text", content => { content.rows.partnerships.action = "Partner with us"; }],
    ["information destination", content => { content.informationHref = "https://example.com/contact-us"; }],
    ["site path destination", content => { content.informationHref = "/community/faq"; }],
    ["cleared destination", content => { content.informationHref = ""; }],
    ["every field", content => { content.title = "A"; content.subtitle = "B"; for (const id of CONTACT_ACTIONS) { content.rows[id].prompt = `${id} row`; content.rows[id].action = `${id} button`; } content.informationHref = "mailto:a@b.co"; }],
  ];
  it.each(edits)("sends the same bytes as the old editor after editing %s", (_name, edit) => {
    const draft = structuredClone(saved());
    edit(draft);
    expect(JSON.stringify(rebuiltRequest(draft))).toBe(JSON.stringify(legacyRequest(draft)));
  });
  it("sends exactly operationId, expectedRevision, designRevision and the whole content, in that order", () => {
    const request = rebuiltRequest(saved());
    expect(Object.keys(request)).toEqual(["operationId", "expectedRevision", "designRevision", "content"]);
    expect(Object.keys(request.content)).toEqual(["title", "subtitle", "rows", "informationHref"]);
    expect(Object.keys(request.content.rows)).toEqual(["media", "tryouts", "tickets", "information", "partnerships"]);
    expect(request.expectedRevision).toBe("7");
    expect(request.designRevision).toBe("cinematic@2:rev");
  });
  it("re-sends an unconfirmed save unchanged, even if the draft moved on", () => {
    const first = rebuiltRequest(saved());
    const moved = structuredClone(saved());
    moved.title = "Changed after the failed save";
    expect(buildContactSaveInput({ pending: first, operationId: "ignored", snapshot: { revision: "9", designRevision: "other" }, draft: moved })).toBe(first);
  });
});

describe("RC-ADMIN-4a Contact editor: sections", () => {
  it("has the heading and the five fixed rows, in the public page's order, with no way to add, hide or reorder", () => {
    expect(CONTACT_SECTIONS.map(section => section.id)).toEqual(["heading", ...CONTACT_ACTIONS]);
    expect(CONTACT_SECTIONS.map(section => section.title)).toEqual(["Page heading", "Media", "Tryouts", "Tickets", "Information", "Partnerships"]);
  });
  it("marks only the card whose fields changed", () => {
    const draft = saved();
    expect(changedContactSections(draft, saved())).toEqual([]);
    draft.rows.tickets.action = "Buy";
    draft.informationHref = "";
    expect(changedContactSections(draft, saved())).toEqual(["tickets", "information"]);
    draft.title = "New title";
    expect(changedContactSections(draft, saved())).toEqual(["heading", "tickets", "information"]);
  });
  it("compares an unsaved page with the starter content", () => {
    expect(changedContactSections(starterCinematicContactContent(), null)).toEqual([]);
    const draft = starterCinematicContactContent();
    draft.subtitle = "Hello";
    expect(changedContactSections(draft, null)).toEqual(["heading"]);
  });
  it("keeps the Information slice to its row and destination", () => {
    const draft = saved();
    const before = contactSectionSlice(draft, "information");
    draft.rows.media.prompt = "Something else";
    expect(contactSectionSlice(draft, "information")).toBe(before);
    draft.informationHref = "/faq";
    expect(contactSectionSlice(draft, "information")).not.toBe(before);
  });
  it("says Link pending on the Information card until a destination is entered", () => {
    const draft = starterCinematicContactContent();
    expect(contactSectionSummary(draft, "information")).toBe("General questions → Information · Link pending");
    draft.informationHref = "/faq";
    expect(contactSectionSummary(draft, "information")).toBe("General questions → Information");
    expect(contactSectionSummary(draft, "media")).toBe("Media inquiries → Media");
    expect(contactSectionSummary(draft, "heading")).toBe("Contact us · Get in touch");
  });
});

describe("RC-ADMIN-4a Contact editor: field messages", () => {
  it("has none for a valid draft, including a blank Information destination", () => {
    expect(contactFieldErrors(saved())).toEqual({});
    expect(contactFieldErrors(starterCinematicContactContent())).toEqual({});
  });
  it("uses the strings the schema has always had, one per field", () => {
    const draft = starterCinematicContactContent();
    draft.title = "  "; draft.subtitle = "";
    draft.rows.media.prompt = ""; draft.rows.tryouts.action = " ";
    draft.informationHref = "not a link";
    expect(contactFieldErrors(draft)).toEqual({
      title: "Enter a title.", subtitle: "Enter a subtitle.",
      "rows.media.prompt": "Enter row text.", "rows.tryouts.action": "Enter button text.",
      informationHref: "That doesn't look like a link or email.",
    });
  });
  it("sends each message to the card that holds the field, and opens the first card in card order", () => {
    expect(contactSectionOfPath("title")).toBe("heading");
    expect(contactSectionOfPath("subtitle")).toBe("heading");
    expect(contactSectionOfPath("rows.partnerships.prompt")).toBe("partnerships");
    expect(contactSectionOfPath("informationHref")).toBe("information");
    expect(firstContactErrorSection({})).toBeNull();
    expect(firstContactErrorSection({ informationHref: "x", "rows.tickets.action": "y" })).toBe("tickets");
    expect(firstContactErrorSection({ informationHref: "x", subtitle: "y" })).toBe("heading");
  });
});

describe("RC-ADMIN-4a Contact editor: save button state", () => {
  it("lets a running save win, then retry, conflict and error in that order", () => {
    const base = { base: "dirty" as const, busy: false, pending: false, conflict: false, saveFailed: false };
    expect(contactPageState(base)).toBe("dirty");
    expect(contactPageState({ ...base, base: "saved" })).toBe("saved");
    expect(contactPageState({ ...base, busy: true, pending: true })).toBe("saving");
    expect(contactPageState({ ...base, pending: true, conflict: true, saveFailed: true })).toBe("retry");
    expect(contactPageState({ ...base, conflict: true, saveFailed: true })).toBe("conflict");
    expect(contactPageState({ ...base, saveFailed: true })).toBe("error");
  });
});

describe("RC-ADMIN-4a Contact editor: dialog fields", () => {
  const render = (id: Parameters<typeof ContactSectionFields>[0]["id"], overrides: Partial<Parameters<typeof ContactSectionFields>[0]["api"]> = {}) =>
    renderToStaticMarkup(createElement(ContactSectionFields, { id, api: { draft: saved(), locked: false, errors: {}, update: () => undefined, ...overrides } }));
  it("shows Title and Subtitle for the page heading", () => {
    const html = render("heading");
    expect(html).toContain("Title");
    expect(html).toContain("Subtitle");
    expect(html).not.toContain("Row text");
  });
  it("shows the fixed site route, and no destination field, for Media, Tryouts, Tickets and Partnerships", () => {
    for (const [id, route] of [["media", "/stadium/media-credentials"], ["tryouts", "/tryouts"], ["tickets", "/tickets"], ["partnerships", "/community/partnership"]] as const) {
      const html = render(id);
      expect(html).toContain("Row text");
      expect(html).toContain("Button text");
      expect(html).toContain(route);
      expect(html).not.toContain("Information destination");
    }
  });
  it("shows the destination field only on Information", () => {
    const html = render("information");
    expect(html).toContain("Information destination");
    expect(html).toContain("mailto:office@example.com");
    expect(html).toContain("A link (like a Google Form), a page on your site starting with /, or an email address. Leave blank to keep the button inactive.");
    expect(html).not.toContain("opens <code>");
  });
  it("shows a field's message and marks it invalid only when one exists", () => {
    const draft = saved();
    draft.title = "";
    const withError = render("heading", { draft, errors: { title: "Enter a title." } });
    expect(withError).toContain("Enter a title.");
    expect(withError).toContain('aria-invalid="true"');
    expect(render("heading", { draft: saved() })).not.toContain("aria-invalid");
  });
  it("disables every field while a save is running or awaiting confirmation", () => {
    for (const id of ["heading", ...CONTACT_ACTIONS] as const) {
      const html = render(id, { locked: true });
      expect((html.match(/<input/g) ?? []).length).toBe((html.match(/<input[^>]* disabled/g) ?? []).length);
    }
  });
});
