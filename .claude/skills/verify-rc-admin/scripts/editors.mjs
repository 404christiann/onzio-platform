// Pure decisions about what an editor's save looks like on the wire and what gate 3 can ask of it. The spec supplies the
// requests; verify.test.mjs pins the rules. Added in RC-ADMIN-4b-0 for editors that save through POST /api/admin/data,
// where reads are POSTs too and one URL carries every table.

export const ADMIN_DATA_PATH = "/api/admin/data";
export const WRITE_OPERATIONS = ["insert", "update", "upsert", "delete"];

/** Parse a request body that should be JSON; anything else is "no body" (never throws). */
export function parseBody(text) {
  try { const value = JSON.parse(text ?? ""); return value && typeof value === "object" ? value : undefined; } catch { return undefined; }
}

/** A request that changes data. On /api/admin/data only the write operations do: the editors' reads (operation "select") are POSTs. */
export function isMutating({ method, pathname, body }) {
  if (method === "GET" || method === "HEAD") return false;
  if (pathname === ADMIN_DATA_PATH) return WRITE_OPERATIONS.includes(parseBody(body)?.operation);
  return true;
}

/**
 * Is this request the editor's save? `editor.save` matches the path; `editor.ops` (and `editor.tables`) narrow a shared
 * endpoint by the body's operation and table. A shared endpoint with no ops declared matches nothing, never every read.
 */
export function isEditorSave(editor, { method, pathname, body }) {
  if (method !== "POST" || !editor.save.test(pathname)) return false;
  if (pathname !== ADMIN_DATA_PATH) return true;
  const parsed = parseBody(body);
  if (!editor.ops?.length || !parsed || !editor.ops.includes(parsed.operation)) return false;
  return !editor.tables?.length || editor.tables.includes(parsed.table);
}

/** Gate 3 steps an editor may declare it does not have (in `lacks`, with the reason). The first four are never optional. */
export const OPTIONAL_STEPS = ["retry", "conflict", "discard"];

/**
 * What gate 3 asks of an editor, from its declared `lacks`: { applicable, reason } for the whole gate (`pageSave`), and
 * `skipped`: { step: reason } for steps it lacks. Only OPTIONAL_STEPS can be skipped: clean, dirty, saving and saved always run.
 */
export function gate3Plan(editor) {
  const lacks = editor?.lacks ?? {};
  if (lacks.pageSave) return { applicable: false, reason: `${editor.key} has no page Save button (declared in EDITORS): ${lacks.pageSave}`, skipped: {}, noStatus: undefined };
  const skipped = {};
  for (const step of OPTIONAL_STEPS) if (lacks[step]) skipped[step] = lacks[step];
  // `status`: the old AdminSaveButton with no "Unsaved changes" line beside it. Only that text check is skipped; the dirty state and an enabled Save still are required.
  return { applicable: true, reason: undefined, skipped, noStatus: lacks.status };
}

/** Every gate 3 step passed, or says "n/a: <declared reason>" and is an optional step. An n/a on any other step is a failure. */
export function stepsPass(steps) {
  const entries = Object.entries(steps ?? {});
  return entries.length > 0 && entries.every(([name, outcome]) => outcome === "pass" || (OPTIONAL_STEPS.includes(name) && /^n\/a: \S/.test(outcome)));
}

/**
 * The Seasons create button: the classic page says "Create Next Season", the rebuilt one says "Create 2028 season" (the year
 * varies). Both are the same action for the `seasons` row. Anchored, so "Create season template" or a row's own Edit never match.
 */
export const SEASON_CREATE_BUTTON = /^(?:Create Next Season|Create \d{4} season)$/i;
