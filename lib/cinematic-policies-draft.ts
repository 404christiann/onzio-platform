import { POLICY_LIMITS, cinematicPolicyContentSchema, type CinematicPolicyBlock, type CinematicPolicyContent, type CinematicPolicyDraft, type PolicyPageKey } from "@/lib/cinematic-policies-content";

export const POLICY_PAGE_NAMES: Record<PolicyPageKey, string> = { guidelines: "Stadium Guidelines", fanCode: "Fan Code of Conduct" };

type Kind = CinematicPolicyBlock["kind"];
type Target = { page: PolicyPageKey; row: number };
export type PolicyDraftAction =
  | { type: "set-page"; page: PolicyPageKey; field: "title" | "subtitle" | "heading"; value: string }
  | { type: "add-row"; page: PolicyPageKey; id: string }
  | (Target & { type: "remove-row" })
  | (Target & { type: "move-row"; by: -1 | 1 })
  | (Target & { type: "set-heading"; value: string })
  | (Target & { type: "add-line"; kind: Kind })
  | (Target & { type: "remove-line"; line: number })
  | (Target & { type: "move-line"; line: number; by: -1 | 1 })
  | (Target & { type: "set-line"; line: number; text: string })
  | (Target & { type: "set-line-kind"; line: number; kind: Kind });

function moved<T>(items: T[], index: number, by: number): T[] {
  const to = index + by;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Pure edits for the policies editor. Every action returns a new draft. */
export function policyDraftReducer(draft: CinematicPolicyDraft, action: PolicyDraftAction): CinematicPolicyDraft {
  const page = draft[action.page];
  const withRows = (rows: CinematicPolicyDraft[PolicyPageKey]["rows"]) => ({ ...draft, [action.page]: { ...page, rows } });
  switch (action.type) {
    case "set-page": return { ...draft, [action.page]: { ...page, [action.field]: action.value } };
    case "add-row": return page.rows.length >= POLICY_LIMITS.rows ? draft : withRows([...page.rows, { id: action.id, heading: "", blocks: [] }]);
    case "remove-row": return withRows(page.rows.filter((_, index) => index !== action.row));
    case "move-row": { const rows = moved(page.rows, action.row, action.by); return rows === page.rows ? draft : withRows(rows); }
  }
  const row = page.rows[action.row];
  if (!row) return draft;
  const withRow = (change: Partial<typeof row>) => withRows(page.rows.map((item, index) => index === action.row ? { ...item, ...change } : item));
  switch (action.type) {
    case "set-heading": return withRow({ heading: action.value });
    case "add-line": return row.blocks.length >= POLICY_LIMITS.blocks ? draft : withRow({ blocks: [...row.blocks, { kind: action.kind, text: "" }] });
    case "remove-line": return withRow({ blocks: row.blocks.filter((_, index) => index !== action.line) });
    case "move-line": { const blocks = moved(row.blocks, action.line, action.by); return blocks === row.blocks ? draft : withRow({ blocks }); }
    case "set-line": return withRow({ blocks: row.blocks.map((line, index) => index === action.line ? { ...line, text: action.text } : line) });
    case "set-line-kind": return withRow({ blocks: row.blocks.map((line, index) => index === action.line ? { ...line, kind: action.kind } : line) });
  }
}

/** Drop answer lines left blank, then apply the save rules with a message the owner can act on. */
export function preparePolicySave(draft: CinematicPolicyDraft): { ok: true; content: CinematicPolicyContent } | { ok: false; message: string } {
  const trimmed = Object.fromEntries(Object.entries(draft).map(([key, page]) => [key, {
    ...page, rows: page.rows.map(row => ({ ...row, blocks: row.blocks.filter(line => line.text.trim()) })),
  }]));
  const parsed = cinematicPolicyContentSchema.safeParse(trimmed);
  if (parsed.success) return { ok: true, content: parsed.data };
  const issue = parsed.error.issues[0];
  const [page, area, row] = issue.path as [PolicyPageKey, string, number | undefined];
  const where = POLICY_PAGE_NAMES[page] ? `${POLICY_PAGE_NAMES[page]}${area === "rows" && typeof row === "number" ? `, row ${row + 1}` : ""}` : "Policies";
  return { ok: false, message: `${where}: ${issue.message.charAt(0).toLowerCase()}${issue.message.slice(1)}` };
}
