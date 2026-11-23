import { editTarget, editTargetRowId, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { CinematicPolicyDraft, CinematicPolicyRow, PolicyPageKey } from "@/lib/cinematic-policies-content";
import { PAGE_DIALOG_ID, parseDialogId } from "./policies-sections";

/**
 * Click-to-field for Rose City's Stadium Guidelines and Fan Code editor (UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES). The ids are
 * declared in EDIT_TARGET_REGISTRY ("policies", lib/edit-targets/about-contact-policies.ts); PolicyDialogFields stamps them on the
 * dialog controls, and the *Stamps below put the same ids on the public nodes inside a card's preview only.
 *
 * The heading card (dialog id `page`) is the registry section `page`: the title, the red line and the section heading of
 * whichever page is being edited (only that page's cards exist, so the ids do not name the page). Every answer row (dialog id
 * `row:<row id>`, a colon, so the cards use PreviewCards' ownsTarget) is the one section `row`: its heading is keyed by the
 * row's own id, which never changes when rows move, and its answer lines by `<row id>-l<n>`, n the line's position in the
 * row's lines in the draft (blank ones included).
 *
 * CinematicPolicyPage draws only the lines that have text, so a line's node is matched to its draft line through the same
 * filter the page uses, never by plain position. Each row card renders the page with that one row (the heading, the section
 * heading and the empty message are hidden by policies.module.css `.only`).
 */
export const POLICY_TARGETS = {
  title: editTarget("policies", "page", "title"),
  subtitle: editTarget("policies", "page", "subtitle"),
  heading: editTarget("policies", "page", "heading"),
} as const;
export const rowHeadingTarget = (rowId: string): EditTargetId => editTarget("policies", "row", "heading", rowId);
/** The key a row's n-th answer line carries (n counts every line in the draft, blank or not). */
export const lineKey = (rowId: string, line: number) => `${rowId}-l${line}`;
export const lineTarget = (rowId: string, line: number): EditTargetId => editTarget("policies", "row", "line", lineKey(rowId, line));

/** Whether a declared field belongs to the card with this dialog id: the page card's three fields, or one row's own heading and lines. */
export function policiesOwnsTarget(dialogId: string, target: ResolvedEditTarget): boolean {
  if (target.editor !== "policies") return false;
  const parsed = parseDialogId(dialogId);
  if (!parsed) return false;
  if (parsed.kind === "page") return target.section === "page" && target.row === undefined;
  const row = editTargetRowId(parsed.id);
  if (target.section !== "row" || target.row === undefined) return false;
  return target.field === "heading" ? target.row === row : target.field === "line" && target.row.startsWith(`${row}-l`) && /^\d+$/.test(target.row.slice(row.length + 2));
}

const fixed = (id: EditTargetId) => () => id;

/** Where the heading card's fields show on the public page, as rendered by components/cinematic/CinematicPolicyPage. */
export function policiesPageStamps(): EditTargetStamp[] {
  return [
    { selector: ".policy-heading > div > h1", target: fixed(POLICY_TARGETS.title) },
    { selector: ".policy-heading > div > p", target: fixed(POLICY_TARGETS.subtitle) },
    { selector: ".policy-body > h2", target: fixed(POLICY_TARGETS.heading) },
  ];
}

/** The draft positions of the lines the public page draws for a row (the ones with text), in order. */
export const drawnLines = (row: CinematicPolicyRow): number[] => row.blocks.flatMap((line, index) => line.text.trim() ? [index] : []);

/** Where one row's fields show on its card (the page drawn with that one row). Keyed by the row's own id. */
export function policiesRowStamps(row: CinematicPolicyRow): EditTargetStamp[] {
  const drawn = drawnLines(row);
  return [
    { selector: ".policy-row > summary > h3", target: fixed(rowHeadingTarget(row.id)) },
    { selector: ".policy-answer > h4, .policy-answer > p:not(.policy-pending)", target: (_, index) => index < drawn.length ? lineTarget(row.id, drawn[index]) : null },
  ];
}

/** The stamps of the heading card and every row card of one page, by the card's dialog id. */
export function policiesStampsByCard(rows: readonly CinematicPolicyRow[], rowDialogId: (rowId: string) => string): Map<string, EditTargetStamp[]> {
  return new Map<string, EditTargetStamp[]>([[PAGE_DIALOG_ID, policiesPageStamps()], ...rows.map(row => [rowDialogId(row.id), policiesRowStamps(row)] as const)]);
}

type PolicyPageContent = CinematicPolicyDraft[PolicyPageKey];

/** What one card draws: the heading card (no rows) or the page with only this row. The rest is hidden by policies.module.css `.only`. */
export function policyCardContent(page: PolicyPageContent, id: string): PolicyPageContent {
  const target = parseDialogId(id);
  return target?.kind === "row" ? { ...page, title: "", subtitle: "", heading: "", rows: page.rows.filter(row => row.id === target.id) } : { ...page, rows: [] };
}

/** The part of the draft one card shows; the card re-renders only when this changes. */
export function cardSlice(page: PolicyPageContent, id: string) {
  const target = parseDialogId(id);
  return JSON.stringify(target?.kind === "row" ? page.rows.find(row => row.id === target.id) ?? null : [page.title, page.subtitle, page.heading]);
}
