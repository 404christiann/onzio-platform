import { describe, expect, it } from "vitest";
import { starterCinematicPolicyContent, type CinematicPolicyDraft } from "@/lib/cinematic-policies-content";
import { policyDraftReducer, preparePolicySave } from "@/lib/cinematic-policies-draft";

function sam(): CinematicPolicyDraft {
  const draft = starterCinematicPolicyContent();
  draft.guidelines.rows = [
    { id: "accessibility", heading: "Accessibility", blocks: [{ kind: "subheading", text: "Parking" }, { kind: "paragraph", text: "ADA parking." }] },
    { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "No pets." }] },
    { id: "bags", heading: "Bags & Backpacks", blocks: [] },
  ];
  return draft;
}
const headings = (draft: CinematicPolicyDraft) => draft.guidelines.rows.map(row => row.heading);

describe("policy editor draft", () => {
  it("adds an empty row to the chosen page only, without changing the original draft", () => {
    const before = sam();
    const after = policyDraftReducer(before, { type: "add-row", page: "fanCode", id: "row-1" });
    expect(after.fanCode.rows).toEqual([{ id: "row-1", heading: "", blocks: [] }]);
    expect(after.guidelines).toEqual(sam().guidelines);
    expect(before.fanCode.rows).toEqual([]);
  });
  it("edits page fields and row headings", () => {
    let draft = policyDraftReducer(sam(), { type: "set-page", page: "guidelines", field: "subtitle", value: "" });
    draft = policyDraftReducer(draft, { type: "set-heading", page: "guidelines", row: 2, value: "Bags" });
    expect(draft.guidelines.subtitle).toBe("");
    expect(headings(draft)).toEqual(["Accessibility", "Animals", "Bags"]);
  });
  it("moves rows up and down, ignoring moves past either end, and removes rows", () => {
    let draft = policyDraftReducer(sam(), { type: "move-row", page: "guidelines", row: 2, by: -1 });
    expect(headings(draft)).toEqual(["Accessibility", "Bags & Backpacks", "Animals"]);
    expect(policyDraftReducer(draft, { type: "move-row", page: "guidelines", row: 0, by: -1 })).toEqual(draft);
    expect(policyDraftReducer(draft, { type: "move-row", page: "guidelines", row: 2, by: 1 })).toEqual(draft);
    draft = policyDraftReducer(draft, { type: "remove-row", page: "guidelines", row: 0 });
    expect(headings(draft)).toEqual(["Bags & Backpacks", "Animals"]);
  });
  it("adds, edits, retypes, moves and removes answer lines within one row", () => {
    let draft = policyDraftReducer(sam(), { type: "add-line", page: "guidelines", row: 2, kind: "subheading" });
    draft = policyDraftReducer(draft, { type: "add-line", page: "guidelines", row: 2, kind: "paragraph" });
    draft = policyDraftReducer(draft, { type: "set-line", page: "guidelines", row: 2, line: 0, text: "Size" });
    draft = policyDraftReducer(draft, { type: "set-line", page: "guidelines", row: 2, line: 1, text: "Clear bags only." });
    expect(draft.guidelines.rows[2].blocks).toEqual([{ kind: "subheading", text: "Size" }, { kind: "paragraph", text: "Clear bags only." }]);
    draft = policyDraftReducer(draft, { type: "set-line-kind", page: "guidelines", row: 2, line: 0, kind: "paragraph" });
    draft = policyDraftReducer(draft, { type: "move-line", page: "guidelines", row: 2, line: 1, by: -1 });
    expect(draft.guidelines.rows[2].blocks.map(line => line.text)).toEqual(["Clear bags only.", "Size"]);
    draft = policyDraftReducer(draft, { type: "remove-line", page: "guidelines", row: 2, line: 0 });
    expect(draft.guidelines.rows[2].blocks).toEqual([{ kind: "paragraph", text: "Size" }]);
    expect(draft.guidelines.rows[0]).toEqual(sam().guidelines.rows[0]);
  });
  it("stops adding at 30 rows and 12 answer lines", () => {
    let draft = sam();
    for (let i = 0; i < 40; i++) draft = policyDraftReducer(draft, { type: "add-row", page: "guidelines", id: `extra-${i}` });
    expect(draft.guidelines.rows).toHaveLength(30);
    for (let i = 0; i < 20; i++) draft = policyDraftReducer(draft, { type: "add-line", page: "guidelines", row: 0, kind: "paragraph" });
    expect(draft.guidelines.rows[0].blocks).toHaveLength(12);
  });
  it("saves without answer lines left blank, keeps a row with no answer, and refuses a row with no heading", () => {
    let draft = policyDraftReducer(sam(), { type: "add-line", page: "guidelines", row: 1, kind: "paragraph" });
    const ready = preparePolicySave(draft);
    expect(ready.ok && ready.content.guidelines.rows.map(row => row.blocks.length)).toEqual([2, 1, 0]);
    draft = policyDraftReducer(draft, { type: "add-row", page: "fanCode", id: "untitled" });
    const blocked = preparePolicySave(draft);
    expect(blocked).toEqual({ ok: false, message: "Fan Code of Conduct, row 1: enter a row heading." });
  });
});
