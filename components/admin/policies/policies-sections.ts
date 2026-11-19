import { POLICY_PAGES, starterCinematicPolicyContent, type CinematicPolicyContent, type CinematicPolicyDraft, type CinematicPolicyRow, type CinematicPolicySave, type CinematicPolicySnapshot, type PolicyPageKey } from "@/lib/cinematic-policies-content";
import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";

/** The dialog opens on the page heading ("page") or on one row ("row:<row id>"). Row ids are unique per page, never per both pages. */
export type PolicyDialogId = "page" | `row:${string}`;
export const PAGE_DIALOG_ID: PolicyDialogId = "page";
export const rowDialogId = (rowId: string): PolicyDialogId => `row:${rowId}`;
export function parseDialogId(id: string): { kind: "page" } | { kind: "row"; id: string } | null {
  if (id === "page") return { kind: "page" };
  return id.startsWith("row:") ? { kind: "row", id: id.slice(4) } : null;
}

/** An answer is the lines with text. The public page opens every row that has one and shows "Details coming soon." for the rest. */
export const isAnswered = (row: CinematicPolicyRow) => row.blocks.some(line => line.text.trim() !== "");

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** What one row card says it holds right now. Matches the public page: every answered row starts open. */
export function rowSummary(row: CinematicPolicyRow): string {
  if (!isAnswered(row)) return "Coming soon · No answer yet";
  const filled = row.blocks.filter(line => line.text.trim() !== "");
  const subheadings = filled.filter(line => line.kind === "subheading").length;
  const paragraphs = filled.length - subheadings;
  return `Starts open · ${[subheadings && plural(subheadings, "subheading"), paragraphs && plural(paragraphs, "paragraph")].filter(Boolean).join(", ")}`;
}

export function pageSummary(page: CinematicPolicyDraft[PolicyPageKey]): string {
  return [page.title.trim() || "No title", page.subtitle.trim(), page.heading.trim() && `· ${page.heading.trim()}`].filter(Boolean).join(" ");
}

export const savedPolicies = (snapshot: Pick<CinematicPolicySnapshot, "content"> | null): CinematicPolicyContent => snapshot?.content ?? starterCinematicPolicyContent();

/** The editor has always compared the whole draft with the saved pages. */
export const policiesDirty = (draft: CinematicPolicyDraft, saved: CinematicPolicyContent) => JSON.stringify(saved) !== JSON.stringify(draft);

export const changedPolicyPages = (draft: CinematicPolicyDraft, saved: CinematicPolicyContent): PolicyPageKey[] =>
  POLICY_PAGES.filter(page => JSON.stringify(draft[page]) !== JSON.stringify(saved[page]));

/**
 * The two rules an owner can break and fix: a page needs a title, a row needs a heading. Keys are `<page>.title` and
 * `<page>.<row id>.heading`, so a message stays with its row when rows move. Blank answer lines are dropped at save, not refused.
 */
export function policyFieldErrors(draft: CinematicPolicyDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const page of POLICY_PAGES) {
    if (!draft[page].title.trim()) errors[`${page}.title`] = "Enter a page title.";
    for (const row of draft[page].rows) if (!row.heading.trim()) errors[`${page}.${row.id}.heading`] = "Enter a row heading.";
  }
  return errors;
}

/** The first page that has a field error, in page order. */
export const firstPageWithError = (errors: Record<string, string>): PolicyPageKey | null =>
  POLICY_PAGES.find(page => Object.keys(errors).some(key => key.startsWith(`${page}.`))) ?? null;

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildPolicySaveRequest(args: {
  pending: CinematicPolicySave | null; operationId: string; snapshot: Pick<CinematicPolicySnapshot, "revision" | "designRevision">; content: CinematicPolicyContent;
}): CinematicPolicySave {
  return args.pending ?? { operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, content: args.content };
}

/** What the Save button shows. A running save wins over every failure. */
export function policiesPageState(args: { base: SaveState; busy: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  return derivePageSaveState(args.base, failure);
}
