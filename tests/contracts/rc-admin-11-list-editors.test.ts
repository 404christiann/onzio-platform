import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemPreviewCards } from "@/components/admin/list-cards/ItemPreviewCards";
import { moveFocusSelectors } from "@/components/admin/list-cards/useMoveFocus";
import { ListField, PositionTools } from "@/components/admin/list-cards/ListField";
import {
  changedBlocks, changedEntryIds, entryDialogId, injuryDirty, mergeMedia, parseInjuryDialogId, playerLabel, reportFor,
} from "@/components/admin/injury-report/injury-sections";
import {
  changedPages, changedPartnerIds, pageDialogId, pageSample, pageWithPartner, parseDialogId, partnerDialogId, partnerName, partnersDirty,
  partnersSaveInput, partnersSaveRequest, singlePartnerContent,
} from "@/components/admin/partners/partners-sections";
import {
  cinematicInjuryReportContentSchema, starterCinematicInjuryReportContent, type CinematicInjuryReportContent,
} from "@/lib/cinematic-injury-report-content";
import {
  addInjuryEntry, injuryReportSaveRequest, moveInjuryEntry, removeInjuryEntry, type CinematicInjuryReportSnapshot, type InjuryRosterPlayer,
} from "@/lib/cinematic-injury-report-editor";
import type { InjuryPlayerRow } from "@/lib/cinematic-injury-report-query";
import {
  MAX_PARTNERS, cinematicPartnersSaveSchema, starterCinematicPartnersContent, type CinematicPartnersContent, type CinematicPartnersSave, type CinematicPartnersSnapshot,
} from "@/lib/cinematic-partners-content";
import { addPartner, movePartner, removePartner } from "@/lib/cinematic-partners-editor";

vi.mock("@/lib/media-assets", () => ({ mediaAssetUrl: (asset: { storage_path: string }) => `https://media.test/${asset.storage_path}` }));
vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const html = (node: ReactElement) => renderToStaticMarkup(node);
const read = (path: string) => readFileSync(path, "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OPERATION = id(900);
let counter = 0;
beforeEach(() => {
  counter = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => id(1000 + ++counter) as `${string}-${string}-${string}-${string}-${string}`);
});

/* ---------- Partners ---------- */

const loadedPartners = (): CinematicPartnersContent => {
  const content = starterCinematicPartnersContent();
  content.pages.partners.intro = "Rose City FC is powered by local business.";
  content.pages.opportunities.ctaHref = "/community/partnership";
  content.partners = [
    { id: id(1), name: "Foothill Transit", role: "Main partner", logoAssetId: id(11), tone: "original" },
    { id: id(2), name: "Niky's Sports", role: "Front of short sponsor", logoAssetId: null, tone: "grey" },
    { id: id(3), name: "Tepito Coffee", role: "", logoAssetId: id(12), tone: "black" },
  ];
  return content;
};
const partnersSnapshot = (content: CinematicPartnersContent | null = loadedPartners()): CinematicPartnersSnapshot => ({ revision: "7", designRevision: "d1", content, logos: [] });

/** The request the editor built before this package: the same expression, taken from the old CinematicPartnersEditor.save(). */
function oldPartnersRequest(draft: CinematicPartnersContent, snapshot: CinematicPartnersSnapshot, pending: CinematicPartnersSave | null) {
  counter = 0;
  return cinematicPartnersSaveSchema.safeParse(pending ?? {
    operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: draft,
  });
}
const newPartnersRequest = (draft: CinematicPartnersContent, snapshot: CinematicPartnersSnapshot, pending: CinematicPartnersSave | null) => {
  counter = 0;
  return partnersSaveRequest({ pending, operationId: () => crypto.randomUUID(), snapshot, draft });
};
const bytes = (value: { success: boolean; data?: unknown }) => JSON.stringify(value.success ? value.data : "refused");

describe("Partners: the save request is byte-identical to the old editor's", () => {
  const edit = (base: CinematicPartnersContent, change: (value: CinematicPartnersContent) => CinematicPartnersContent | void) => { const next = structuredClone(base); return change(next) ?? next; };
  const cases: [string, (base: CinematicPartnersContent) => CinematicPartnersContent][] = [
    ["untouched load then save", base => base],
    ["page heading", base => edit(base, value => { value.pages.partners.title = "Club Partners 2027"; })],
    ["page intro and button link", base => edit(base, value => { value.pages.partners.intro = "New intro"; value.pages.opportunities.ctaHref = "https://example.com/partner"; })],
    ["partner name and role (by id, as the dialog edits)", base => edit(base, value => { const row = value.partners.find(partner => partner.id === id(2))!; row.name = "Niky's"; row.role = "Gear"; })],
    ["partner logo and tone", base => edit(base, value => { const row = value.partners.find(partner => partner.id === id(2))!; row.logoAssetId = id(13); row.tone = "black"; })],
    ["add a partner, named", base => edit(base, value => { const next = addPartner(value); next.partners[3].name = "MVMNT CULTR"; return next; })],
    ["move a partner later", base => edit(base, value => movePartner(value, 0, 1))],
    ["remove a partner", base => edit(base, value => removePartner(value, 1))],
  ];
  for (const [name, change] of cases) {
    it(name, () => {
      const snapshot = partnersSnapshot(), draft = change(loadedPartners());
      const before = bytes(oldPartnersRequest(draft, snapshot, null));
      const after = bytes(newPartnersRequest(draft, snapshot, null));
      expect(after).toBe(before);
      expect(after).not.toBe(JSON.stringify("refused"));
    });
  }
  it("the same edit made by row index (old) and by row id (new) gives the same bytes", () => {
    const byIndex = structuredClone(loadedPartners()); byIndex.partners[1].name = "Niky's"; byIndex.partners[1].tone = "original";
    const byId = structuredClone(loadedPartners()); const row = byId.partners.find(partner => partner.id === id(2))!; row.name = "Niky's"; row.tone = "original";
    expect(bytes(newPartnersRequest(byId, partnersSnapshot(), null))).toBe(bytes(oldPartnersRequest(byIndex, partnersSnapshot(), null)));
  });
  it("an untouched starter page (never saved) saves the starter content", () => {
    const snapshot = partnersSnapshot(null), draft = starterCinematicPartnersContent();
    expect(bytes(newPartnersRequest(draft, snapshot, null))).toBe(bytes(oldPartnersRequest(draft, snapshot, null)));
  });
  it("a retried save sends the stored request unchanged and does not draw a new operation id", () => {
    const stored = cinematicPartnersSaveSchema.parse({ operationId: OPERATION, expectedRevision: "7", designRevision: "d1", content: loadedPartners() });
    const retried = newPartnersRequest(starterCinematicPartnersContent(), partnersSnapshot(), stored);
    expect(retried.success && JSON.stringify(retried.data)).toBe(JSON.stringify(stored));
    expect(counter).toBe(0);
    expect(partnersSaveInput({ pending: stored, operationId: () => "unused", snapshot: partnersSnapshot(), draft: loadedPartners() })).toBe(stored);
  });
  it("a first save draws exactly one operation id, like before", () => {
    newPartnersRequest(loadedPartners(), partnersSnapshot(), null);
    expect(counter).toBe(1);
  });
  it("still refuses what the schema refused: a partner without a name, a page without a heading", () => {
    const noName = structuredClone(loadedPartners()); noName.partners[0].name = "  ";
    const noHeading = structuredClone(loadedPartners()); noHeading.pages.opportunities.title = "";
    expect(newPartnersRequest(noName, partnersSnapshot(), null).success).toBe(false);
    expect(newPartnersRequest(noHeading, partnersSnapshot(), null).success).toBe(false);
  });
  it("keeps the 24 partner limit", () => {
    let content = starterCinematicPartnersContent();
    for (let n = 0; n < MAX_PARTNERS + 3; n += 1) content = addPartner(content);
    expect(content.partners).toHaveLength(24);
  });
});

describe("Partners: what counts as changed", () => {
  it("the same content in another key order is not a change", () => {
    const saved = loadedPartners();
    const reordered = JSON.parse(JSON.stringify({ partners: saved.partners.map(({ tone, name, id: rowId, role, logoAssetId }) => ({ tone, name, id: rowId, role, logoAssetId })), pages: saved.pages })) as CinematicPartnersContent;
    expect(partnersDirty(reordered, saved)).toBe(false);
    reordered.partners[0].name += "!";
    expect(partnersDirty(reordered, saved)).toBe(true);
  });
  it("marks a partner that is new, edited or moved, and a page whose text changed", () => {
    const saved = loadedPartners(), draft = structuredClone(saved);
    expect(changedPartnerIds(draft, saved).size).toBe(0);
    draft.partners[2].role = "Official coffee";
    expect([...changedPartnerIds(draft, saved)]).toEqual([id(3)]);
    const moved = movePartner(saved, 0, 1);
    expect(new Set(changedPartnerIds(moved, saved))).toEqual(new Set([id(1), id(2)]));
    expect(changedPartnerIds(addPartner(saved), saved).size).toBe(1);
    draft.pages.opportunities.ctaLabel = "Contact us";
    expect(changedPages(draft, saved)).toEqual(["opportunities"]);
  });
  it("dialog ids round-trip and refuse anything else", () => {
    expect(parseDialogId(pageDialogId("opportunities"))).toEqual({ kind: "page", page: "opportunities" });
    expect(parseDialogId(partnerDialogId(id(5)))).toEqual({ kind: "partner", id: id(5) });
    expect(parseDialogId("page:other")).toBeNull();
    expect(partnerName({ id: id(1), name: "  ", role: "", logoAssetId: null, tone: "original" }, 4)).toBe("Partner 5");
  });
  it("a card previews one partner with the page's own heading and bottom bar switched off", () => {
    const content = loadedPartners(), single = singlePartnerContent(content, content.partners[1]);
    expect(single.partners).toEqual([content.partners[1]]);
    expect(single.pages.partners).toMatchObject({ title: "", subtitle: "", intro: "", ctaLabel: "" });
    expect(pageSample(content, 2).partners).toHaveLength(2);
    expect(pageSample(content, 9)).toBe(content);
    expect(pageWithPartner(content, content.partners[0]).pages).toBe(content.pages);
  });
});

/* ---------- Injury Report ---------- */

const players: InjuryRosterPlayer[] = [
  { id: id(21), name: "Sample Defender", number: 4, position: "Defender" },
  { id: id(22), name: "Sample Midfielder", number: 7, position: "Midfielder" },
  { id: id(23), name: "Sample Forward", number: 9, position: "Forward" },
];
const loadedInjury = (): CinematicInjuryReportContent => {
  const content = starterCinematicInjuryReportContent();
  content.page.quote = "Recovery is where seasons are won.";
  content.page.videoUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0";
  content.entries = [
    { id: id(31), playerId: id(21), injury: "Hamstring strain", timeline: "2–3 weeks", note: "Rested as a precaution." },
    { id: id(32), playerId: id(22), injury: "Ankle sprain", timeline: "Day-to-day", note: "" },
  ];
  return content;
};
const injurySnapshot = (content: CinematicInjuryReportContent | null = loadedInjury()): CinematicInjuryReportSnapshot => ({ revision: "4", designRevision: "d2", content, players, media: [] });
const injuryBytes = (draft: CinematicInjuryReportContent, snapshot = injurySnapshot()) => {
  const result = injuryReportSaveRequest(draft, snapshot, OPERATION);
  return JSON.stringify(result.ok ? result.request : result.errors);
};

describe("Injury Report: the save request is byte-identical to the old editor's", () => {
  it("the editor still builds the request with injuryReportSaveRequest and no builder of its own", () => {
    const source = read("components/admin/injury-report/CinematicInjuryReportEditor.tsx");
    expect(source).toContain("injuryReportSaveRequest(draft, snapshot, crypto.randomUUID())");
    expect(source).toContain("saveCinematicInjuryReportEditor(request)");
    expect(source).not.toMatch(/cinematicInjuryReportSaveSchema\.safeParse/);
  });
  it("an untouched load then save sends the saved content unchanged", () => {
    const content = loadedInjury(), result = injuryReportSaveRequest(structuredClone(content), injurySnapshot(content), OPERATION);
    expect(result.ok && JSON.stringify(result.request)).toBe(JSON.stringify({ operationId: OPERATION, expectedRevision: "4", designRevision: "d2", content }));
  });
  it("pinned bytes for the edits the dialogs make", () => {
    const draft = structuredClone(loadedInjury());
    draft.page.presenterName = " MVMNT CULTR "; // trimmed on save, as before
    draft.page.videoUrl = "https://youtu.be/dQw4w9WgXcQ"; // stored in embed form, as before
    draft.entries[1].injury = "  Calf strain ";
    const expected = structuredClone(loadedInjury());
    expected.page.presenterName = "MVMNT CULTR"; expected.page.videoUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"; expected.entries[1].injury = "Calf strain";
    expect(injuryBytes(draft)).toBe(JSON.stringify({ operationId: OPERATION, expectedRevision: "4", designRevision: "d2", content: expected }));
  });
  it("the same edit made by row index (old) and by row id (new) gives the same bytes", () => {
    const byIndex = structuredClone(loadedInjury()); byIndex.entries[1].timeline = "1 week"; byIndex.entries[1].note = "Cleared for light training.";
    const byId = structuredClone(loadedInjury()); const row = byId.entries.find(entry => entry.id === id(32))!; row.timeline = "1 week"; row.note = "Cleared for light training.";
    expect(injuryBytes(byId)).toBe(injuryBytes(byIndex));
  });
  it("add, move and remove use the same helpers as before", () => {
    const added = addInjuryEntry(loadedInjury(), players);
    expect(added.entries).toHaveLength(3);
    expect(added.entries[2]).toMatchObject({ playerId: id(23), injury: "", timeline: "", note: "" });
    expect(injuryReportSaveRequest(added, injurySnapshot(), OPERATION).ok).toBe(false); // a blank injury is refused, as before
    expect(moveInjuryEntry(loadedInjury(), 0, 1).entries.map(entry => entry.id)).toEqual([id(32), id(31)]);
    expect(removeInjuryEntry(loadedInjury(), 0).entries.map(entry => entry.id)).toEqual([id(32)]);
    expect(cinematicInjuryReportContentSchema.safeParse(moveInjuryEntry(loadedInjury(), 0, 1)).success).toBe(true);
  });
});

describe("Injury Report: what counts as changed, and what a card previews", () => {
  it("the same content in another key order is not a change", () => {
    const saved = loadedInjury();
    const reordered = JSON.parse(JSON.stringify({ entries: saved.entries, bandAssetId: saved.bandAssetId, presenterLogoAssetId: saved.presenterLogoAssetId, page: saved.page })) as CinematicInjuryReportContent;
    expect(injuryDirty(reordered, saved)).toBe(false);
    reordered.entries[0].note = "x";
    expect(injuryDirty(reordered, saved)).toBe(true);
  });
  it("marks the page parts and entries that changed", () => {
    const saved = loadedInjury(), draft = structuredClone(saved);
    expect(changedBlocks(draft, saved)).toEqual([]);
    draft.page.presenterName = "Other"; draft.page.quote = "New quote";
    expect(changedBlocks(draft, saved)).toEqual(["presenter", "rehab"]);
    draft.entries[1].timeline = "1 week";
    expect([...changedEntryIds(draft, saved)]).toEqual([id(32)]);
    expect(new Set(changedEntryIds(moveInjuryEntry(saved, 0, 1), saved))).toEqual(new Set([id(31), id(32)]));
  });
  it("dialog ids round-trip", () => {
    expect(parseInjuryDialogId("presenter")).toEqual({ kind: "block", block: "presenter" });
    expect(parseInjuryDialogId(entryDialogId(id(31)))).toEqual({ kind: "entry", id: id(31) });
    expect(parseInjuryDialogId("nope")).toBeNull();
  });
  it("a player who left the Roster keeps a placeholder card in the editor and disappears on the public page", () => {
    const content = loadedInjury(), rows: InjuryPlayerRow[] = [{ id: id(21), name: "Sample Defender", number: 4, position: "Defender", photo_url: "", photo_asset_id: null, active: true }];
    const roster = { players: rows, assets: [] };
    expect(reportFor(content, content.entries, roster, []).entries.map(entry => entry.id)).toEqual([id(31)]);
    const shown = reportFor(content, content.entries, roster, [], true).entries;
    expect(shown.map(entry => entry.id)).toEqual([id(31), id(32)]);
    expect(shown[1].player).toMatchObject({ name: "Former player", position: "No longer on the Roster", photo: null });
    expect(playerLabel(content.entries[1], players, 1)).toBe("Sample Midfielder");
    expect(playerLabel({ ...content.entries[1], playerId: id(99) }, players, 1)).toBe("Former player 2");
  });
  it("merges media by id without duplicates", () => {
    const item = { id: id(41), storage_path: "a", width: 1, height: 1, kind: "graphic" as const };
    expect(mergeMedia([item], [{ ...item, storage_path: "b" }])).toEqual([item]);
  });
});

/* ---------- the kit pieces ---------- */

describe("ItemPreviewCards and the list fields", () => {
  const items = [
    { id: "a", label: "Foothill Transit", changed: true, flags: [{ text: "No logo", tone: "note" as const }] },
    { id: "b", label: "Niky's Sports" },
  ];
  const render = (disabled = false, addDisabled = false) => html(createElement(ItemPreviewCards, {
    items, noun: "partner", label: "Partners", disabled, lazy: false, renderPreview: (itemId: string) => createElement("span", null, `preview ${itemId}`),
    onEdit: () => {}, onMove: () => {}, add: { label: "Add partner", count: "2 of 24", disabled: addDisabled, onAdd: () => {} },
  }));
  it("draws one card per item, a move pair, an Edit marked for the kit, and the add card last", () => {
    const markup = render();
    expect(markup).toContain('aria-label="Partners"');
    expect(markup.match(/data-item-card=/g)).toHaveLength(2);
    expect(markup.match(/data-kit-edit=""/g)).toHaveLength(4); // preview overlay + Edit, per card
    expect(markup).toContain('aria-label="Edit Foothill Transit partner"');
    expect(markup).toContain('aria-label="Move Niky&#x27;s Sports earlier"');
    expect(markup).toContain("preview a");
    expect(markup).toContain("(unsaved edits)");
    expect(markup).toContain("No logo");
    expect(markup.lastIndexOf("data-add-item")).toBeGreaterThan(markup.lastIndexOf("data-item-card"));
  });
  it("cannot move the first item earlier or the last later", () => {
    const markup = render();
    const earlier = markup.match(/<button[^>]*aria-label="Move Foothill Transit earlier"[^>]*>/)![0];
    const laterOfLast = markup.match(/<button[^>]*aria-label="Move Niky&#x27;s Sports later"[^>]*>/)![0];
    const laterOfFirst = markup.match(/<button[^>]*aria-label="Move Foothill Transit later"[^>]*>/)![0];
    expect(earlier).toContain("disabled");
    expect(laterOfLast).toContain("disabled");
    expect(laterOfFirst).not.toContain("disabled");
  });
  it("locks every Edit control while a save is pending, so the draft cannot change under a retry", () => {
    const markup = render(true);
    const edits = markup.match(/<button[^>]*data-kit-edit=""[^>]*>/g)!;
    expect(edits).toHaveLength(4);
    for (const button of edits) expect(button).toContain("disabled");
  });
  it("disables Add at the limit", () => {
    expect(render(false, true).match(/<button[^>]*data-add-item=""[^>]*>/)![0]).toContain("disabled");
    expect(render(false, false).match(/<button[^>]*data-add-item=""[^>]*>/)![0]).not.toContain("disabled");
  });
  it("ListField says when a field reaches its limit and shows a save error under it", () => {
    const full = html(createElement(ListField, { label: "Name", value: "x".repeat(80), max: 80, disabled: false, onChange: () => {} }));
    expect(full).toContain("Name is at its limit of 80 characters.");
    const wrong = html(createElement(ListField, { label: "Name", value: "", max: 80, disabled: false, error: "Enter the partner's name.", onChange: () => {} }));
    expect(wrong).toContain('aria-invalid="true"');
    expect(wrong).toContain("Enter the partner&#x27;s name.");
    expect(html(createElement(ListField, { label: "Name", value: "ok", max: 80, disabled: false, onChange: () => {} }))).not.toContain("limit");
  });
  it("PositionTools names the item on every button", () => {
    const markup = html(createElement(PositionTools, { index: 0, length: 3, name: "Foothill Transit", noun: "partner", disabled: false, note: "Both pages show partners in this order.", onMove: () => {}, onRemove: () => {} }));
    expect(markup).toContain('aria-label="Move Foothill Transit earlier"');
    expect(markup).toContain('aria-label="Remove Foothill Transit"');
    expect(markup).toContain("Partner 1 of 3.");
    expect(markup.match(/<button[^>]*aria-label="Move Foothill Transit earlier"[^>]*>/)![0]).toContain("disabled");
  });
});

/* ---------- both editors follow the kit pattern ---------- */

describe("both editors use the kit and the real public components", () => {
  const partners = read("components/admin/partners/CinematicPartnersEditor.tsx"), injury = read("components/admin/injury-report/CinematicInjuryReportEditor.tsx");
  for (const [name, source] of [["Partners", partners], ["Injury Report", injury]] as const) {
    it(`${name}: PageFrame, preview cards, split dialog, one Save through useSaveState`, () => {
      expect(source).toContain("<PageFrame");
      expect(source).toContain("<PreviewCards");
      expect(source).toContain("<ItemPreviewCards");
      expect(source).toMatch(/<EditorDialog[^>]*mode="split"/);
      expect(source).toContain("useSaveState({");
      expect(source).toContain("void saveAction.save()");
      expect(source).toContain("useUnsavedGuard(");
      expect(source).toContain("DISCARD_CONFIRM.confirmLabel");
      expect(source).toContain("Load latest and keep my edits");
      expect(source).toContain("Reload saved page");
      expect(source).toContain("<SettledPreview");
      expect(source).toContain("PageFrameSkeleton");
      expect(source).toContain("ItemPreviewCardsSkeleton");
      expect(source).not.toContain("EditorSaveBar");
      expect(source).not.toMatch(/toast/i);
    });
  }
  it("the previews are the real public components", () => {
    expect(partners).toContain("<CinematicPartners page=");
    expect(injury).toContain("<CinematicInjuryReport report=");
    expect(partners).toContain('from "@/components/cinematic/CinematicPartners"');
    expect(injury).toContain('from "@/components/cinematic/CinematicInjuryReport"');
  });
  it("saves go through the same routes and the same helpers", () => {
    expect(partners).toContain("saveCinematicPartnersEditor(request)");
    expect(partners).toContain("loadCinematicPartnersEditor()");
    expect(read("lib/cinematic-partners-editor.ts")).toContain('"/api/admin/cinematic-partners"');
    expect(read("lib/cinematic-injury-report-editor.ts")).toContain('"/api/admin/cinematic-injury-report"');
    expect(partners).toContain('storage.from("sponsors").upload(`partners/');
    expect(injury).toContain('bucket: "sponsors", folder: "injury-report-logo"');
    expect(injury).toContain('bucket: "news", folder: "injury-report-band"');
  });
  it("field limits come from the schemas", () => {
    const fields = read("components/admin/partners/PartnerFields.tsx"), injuryFields = read("components/admin/injury-report/InjuryFields.tsx");
    expect(fields).toContain('label="Name" value={partner.name} max={80}');
    expect(fields).toContain('label="Role" value={partner.role} max={160}');
    expect(injuryFields).toContain('label="Injury" value={entry.injury} max={80}');
    expect(injuryFields).toContain('label="Timeline" value={entry.timeline} max={40}');
    expect(injuryFields).toContain('label="Note (optional)" value={entry.note} max={200}');
    expect(injuryFields).toContain('label="Partner name" value={draft.page.presenterName} max={60}');
  });
  it("the Roster stays read only and the left-the-Roster state still blocks Save", () => {
    expect(injury).toContain("Remove the entries for players who are no longer on the Roster before saving.");
    expect(injury).toContain('"Left the Roster"');
    expect(read("components/admin/injury-report/InjuryFields.tsx")).toContain("read only here");
  });
  it("Remove is a plain remove: no hide-and-keep flag was added to the content", () => {
    expect(Object.keys(starterCinematicPartnersContent().partners)).toEqual([]);
    expect(Object.keys(addPartner(starterCinematicPartnersContent()).partners[0]).sort()).toEqual(["id", "logoAssetId", "name", "role", "tone"]);
  });
});

describe("move focus finds the card the grid draws (fix loop 1, L1)", () => {
  const cardId = partnerDialogId(id(1));
  const markup = html(createElement(ItemPreviewCards, {
    items: [{ id: cardId, label: "Foothill Transit" }, { id: partnerDialogId(id(2)), label: "Niky" }], noun: "partner", label: "Partners", disabled: false, lazy: false,
    renderPreview: () => null, onEdit: () => {}, onMove: () => {}, add: { label: "Add partner", count: "2 of 24", disabled: false, onAdd: () => {} },
  }));
  it("the selectors built from the dialog id match data-item-card and data-move", () => {
    for (const delta of [-1, 1] as const) {
      const { root, button } = moveFocusSelectors(cardId, delta, false);
      expect(root).toBe(`[data-item-card="${cardId}"]`);
      expect(markup).toContain(`data-item-card="${cardId}"`);
      expect(button).toBe(`[data-move="${cardId}:${delta}"]`);
      expect(markup).toContain(`data-move="${cardId}:${delta}"`);
    }
    expect(cardId).toBe(`partner:${id(1)}`);
  });
  it("both editors pass the dialog id, not the raw row id, from the grid", () => {
    expect(read("components/admin/partners/CinematicPartnersEditor.tsx")).toContain("rememberMove(partnerDialogId(partner.id), delta, inDialog)");
    expect(read("components/admin/injury-report/CinematicInjuryReportEditor.tsx")).toContain("rememberMove(entryDialogId(entry.id), delta, inDialog)");
  });
  it("the dialog path looks up the dialog's own buttons", () => {
    expect(moveFocusSelectors(cardId, -1, true)).toEqual({ root: "[data-editor-dialog]", button: "[data-move-earlier]" });
    expect(moveFocusSelectors(cardId, 1, true).button).toBe("[data-move-later]");
  });
  it("the hook falls back to the other enabled button after a move to first or last place", () => {
    const hook = read("components/admin/list-cards/useMoveFocus.ts");
    expect(hook).toContain("[pick(move.delta), pick(move.delta === 1 ? -1 : 1)].find(button => button && !button.disabled)?.focus()");
  });
});

describe("an upload that finishes after the page changed is retired (fix loop 1, L3)", () => {
  it("both editors retire the just-committed asset before returning", () => {
    expect(read("components/admin/partners/CinematicPartnersEditor.tsx")).toContain("if (generation !== epoch.current) { void retireUploads([result.data.assetId]); return; }");
    expect(read("components/admin/injury-report/CinematicInjuryReportEditor.tsx")).toContain("if (generation !== epoch.current) { void retireUploads([result.data.assetId]); return false; }");
  });
});
