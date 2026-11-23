import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cinematicPolicySaveSchema, starterCinematicPolicyContent, type CinematicPolicyContent, type CinematicPolicyDraft, type CinematicPolicySave } from "@/lib/cinematic-policies-content";
import { policyDraftReducer, preparePolicySave, type PolicyDraftAction } from "@/lib/cinematic-policies-draft";
import {
  PAGE_DIALOG_ID, buildPolicySaveRequest, changedPolicyPages, firstPageWithError, isAnswered, pageSummary, parseDialogId, policiesDirty, policiesPageState, policyFieldErrors,
  rowDialogId, rowSummary, savedPolicies,
} from "@/components/admin/policies/policies-sections";
import { PolicyDialogFields, type PolicyFieldsApi } from "@/components/admin/policies/PolicyDialogFields";

const OP = "6b0e6f1c-5d0a-4a0b-9d6e-0c7f1b0b7a11";
const snapshot = { revision: "7", designRevision: "design-1" };

function sam(): CinematicPolicyDraft {
  const draft = starterCinematicPolicyContent();
  draft.guidelines.rows = [
    { id: "accessibility", heading: "Accessibility", blocks: [{ kind: "subheading", text: "Parking" }, { kind: "paragraph", text: "ADA parking." }, { kind: "paragraph", text: "Seating." }] },
    { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "No pets." }] },
    { id: "bags", heading: "Bags & Backpacks", blocks: [] },
  ];
  draft.fanCode.rows = [{ id: "respect", heading: "Respect", blocks: [{ kind: "paragraph", text: "Be kind." }] }];
  return draft;
}

/** The save expression exactly as the pre-RC-ADMIN-4a CinematicPolicyEditor built it, kept here as the reference. */
function legacySave(pending: CinematicPolicySave | null, draft: CinematicPolicyDraft): CinematicPolicySave | null {
  if (pending) return pending;
  const ready = preparePolicySave(draft);
  if (!ready.ok) return null;
  return { operationId: OP, expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: ready.content };
}
function rebuiltSave(pending: CinematicPolicySave | null, draft: CinematicPolicyDraft): CinematicPolicySave | null {
  const ready = preparePolicySave(draft);
  if (!pending && !ready.ok) return null;
  return buildPolicySaveRequest({ pending, operationId: OP, snapshot, content: ready.ok ? ready.content : (pending as CinematicPolicySave).content });
}
const edits = (draft: CinematicPolicyDraft, actions: PolicyDraftAction[]) => actions.reduce(policyDraftReducer, draft);

describe("Policies save request", () => {
  const scripts: Record<string, PolicyDraftAction[]> = {
    "no edit": [],
    "title and red line": [{ type: "set-page", page: "guidelines", field: "title", value: "Robinson Stadium Guidelines" }, { type: "set-page", page: "fanCode", field: "subtitle", value: "" }],
    "heading and a blank line that is dropped": [{ type: "set-heading", page: "guidelines", row: 2, value: "Bags" }, { type: "add-line", page: "guidelines", row: 2, kind: "paragraph" }],
    "new row on the other page": [{ type: "add-row", page: "fanCode", id: "row-1" }, { type: "set-heading", page: "fanCode", row: 1, value: "Safety" }, { type: "add-line", page: "fanCode", row: 1, kind: "subheading" }, { type: "set-line", page: "fanCode", row: 1, line: 0, text: "Stewards" }],
    "reorder rows and lines, retype a line": [{ type: "move-row", page: "guidelines", row: 0, by: 1 }, { type: "move-line", page: "guidelines", row: 1, line: 0, by: 1 }, { type: "set-line-kind", page: "guidelines", row: 1, line: 0, kind: "subheading" }],
    "remove a row and a line": [{ type: "remove-row", page: "guidelines", row: 1 }, { type: "remove-line", page: "guidelines", row: 0, line: 2 }],
  };
  for (const [name, actions] of Object.entries(scripts)) {
    it(`is byte-identical to the old editor's request for: ${name}`, () => {
      const draft = edits(sam(), actions);
      const before = legacySave(null, draft), after = rebuiltSave(null, draft);
      expect(after).not.toBeNull();
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
      expect(cinematicPolicySaveSchema.safeParse(after).success).toBe(true);
      expect(Object.keys(after!)).toEqual(["operationId", "expectedRevision", "designRevision", "content"]);
    });
  }
  it("re-sends a pending request unchanged, whatever the draft says now", () => {
    const pending = legacySave(null, sam())!;
    const later = edits(sam(), [{ type: "set-page", page: "guidelines", field: "title", value: "Changed after the failed save" }]);
    expect(JSON.stringify(rebuiltSave(pending, later))).toBe(JSON.stringify(pending));
    expect(buildPolicySaveRequest({ pending, operationId: "other", snapshot: { revision: "9", designRevision: "x" }, content: later as CinematicPolicyContent })).toBe(pending);
  });
  it("refuses an empty title or row heading with the old message, and the new field errors name the same fields", () => {
    const draft = edits(sam(), [{ type: "set-page", page: "fanCode", field: "title", value: "  " }, { type: "set-heading", page: "guidelines", row: 1, value: "" }]);
    expect(legacySave(null, draft)).toBeNull();
    expect(preparePolicySave(draft)).toEqual({ ok: false, message: "Stadium Guidelines, row 2: enter a row heading." });
    expect(policyFieldErrors(draft)).toEqual({ "fanCode.title": "Enter a page title.", "guidelines.animals.heading": "Enter a row heading." });
    expect(firstPageWithError(policyFieldErrors(draft))).toBe("guidelines");
    expect(firstPageWithError(policyFieldErrors(sam()))).toBeNull();
  });
});

describe("Policies cards", () => {
  it("says every answered row starts open, as the public page does, and the rest are coming soon", () => {
    const rows = sam().guidelines.rows;
    expect(rows.map(isAnswered)).toEqual([true, true, false]);
    expect(rowSummary(rows[0])).toBe("Starts open · 1 subheading, 2 paragraphs");
    expect(rowSummary(rows[1])).toBe("Starts open · 1 paragraph");
    expect(rowSummary(rows[2])).toBe("Coming soon · No answer yet");
    expect(rowSummary({ id: "x", heading: "X", blocks: [{ kind: "paragraph", text: "   " }] })).toBe("Coming soon · No answer yet");
    expect(readFileSync("components/cinematic/CinematicPolicyPage.tsx", "utf8")).toContain("open={answered(row)}");
  });
  it("summarises the page heading and tracks which page changed", () => {
    expect(pageSummary(sam().guidelines)).toBe("Stadium Guidelines & FAQ’s · Guidelines");
    expect(pageSummary({ title: "", subtitle: "", heading: "", rows: [] })).toBe("No title");
    const saved = sam() as CinematicPolicyContent;
    expect(policiesDirty(sam(), saved)).toBe(false);
    const draft = edits(sam(), [{ type: "set-heading", page: "fanCode", row: 0, value: "Respect all" }]);
    expect(policiesDirty(draft, saved)).toBe(true);
    expect(changedPolicyPages(draft, saved)).toEqual(["fanCode"]);
    expect(savedPolicies(null)).toEqual(starterCinematicPolicyContent());
  });
  it("keeps dialog ids apart: a row called page or heading never opens the page heading", () => {
    expect(parseDialogId(PAGE_DIALOG_ID)).toEqual({ kind: "page" });
    expect(parseDialogId(rowDialogId("page"))).toEqual({ kind: "row", id: "page" });
    expect(parseDialogId("nonsense")).toBeNull();
  });
  it("maps failures to the Save button states, a running save first", () => {
    const base = { base: "dirty" as const, busy: false, pending: false, conflict: false, saveFailed: false };
    expect(policiesPageState(base)).toBe("dirty");
    expect(policiesPageState({ ...base, saveFailed: true })).toBe("error");
    expect(policiesPageState({ ...base, conflict: true })).toBe("conflict");
    expect(policiesPageState({ ...base, pending: true, conflict: true })).toBe("retry");
    expect(policiesPageState({ ...base, busy: true, pending: true })).toBe("saving");
  });
});

describe("Policies dialog fields", () => {
  const api = (draft: CinematicPolicyDraft, errors: Record<string, string> = {}): PolicyFieldsApi => ({ draft, page: "guidelines", locked: false, errors, edit: () => {}, moveRow: () => {}, removeRow: () => {} });
  const html = (props: PolicyFieldsApi, id: Parameters<typeof PolicyDialogFields>[0]["id"]) => renderToStaticMarkup(createElement(PolicyDialogFields, { api: props, id }));
  it("shows the three page heading fields with the old hints and limits", () => {
    const out = html(api(sam()), PAGE_DIALOG_ID);
    for (const text of ["Title", "Red line under the title", "Section heading", "Leave blank to hide it.", "Shown above the rows. Leave blank to hide it."]) expect(out).toContain(text);
    expect(out.match(/maxLength="120"|maxlength="120"/gi)).toHaveLength(3);
  });
  it("shows a row's heading, its answer lines with type, move and remove, and the row position tools", () => {
    const out = html(api(sam()), rowDialogId("accessibility"));
    for (const text of ["Row heading", "Answer · 3 of 12 lines", "Line 1 type", "Move line 1 up", "Move line 3 down", "Remove line 2", "Add subheading", "Add paragraph", "Move Accessibility earlier", "Move Accessibility later", "Remove row"]) expect(out).toContain(text);
    expect(out).toContain("Line 1 subheading");
    expect(out).toContain("Line 2 paragraph");
  });
  it("says so when a row has no answer, and shows a refused heading on the field", () => {
    const out = html(api(sam(), { "guidelines.bags.heading": "Enter a row heading." }), rowDialogId("bags"));
    expect(out).toContain("No answer yet. The site shows “Details coming soon.”");
    expect(out).toContain("Enter a row heading.");
  });
  it("renders nothing for a row that is not on the page", () => {
    expect(html(api(sam()), rowDialogId("gone"))).toBe("");
  });
});

describe("Policies editor source", () => {
  const source = readFileSync("components/admin/policies/CinematicPolicyEditor.tsx", "utf8");
  it("is built on the editor kit and keeps one POST to the same endpoint and the same recovery key", () => {
    for (const piece of ["PageFrame", "PreviewCards", "EditorDialog", "useSaveState", "useUnsavedGuard"]) expect(source).toContain(piece);
    expect(source).not.toContain("EditorSaveBar");
    expect(source).toContain("onzio:cinematic-policies:v1:");
    expect(readFileSync("lib/cinematic-policies-editor.ts", "utf8")).toContain('fetch("/api/admin/cinematic-policies", { method: "POST"');
  });
  it("offers Load latest and keep my edits and the discard confirmation", () => {
    expect(source).toContain("Load latest and keep my edits");
    expect(source).toContain("DISCARD_CONFIRM");
  });
  it("no longer claims only the first answered row starts open", () => {
    expect(source).not.toContain("The first row with an answer starts open");
    expect(source).toContain("Every row with an answer starts open on the page.");
  });
});
