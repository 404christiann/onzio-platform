import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-CL-27 sweep guard. ONZIO_SWEEP_GUARD_ROOT lets a reviewer point the same scan at a temporary copy.
const root = resolve(process.env.ONZIO_SWEEP_GUARD_ROOT ?? process.cwd());
const SCANNED = ["app/admin", "components/admin"];
const SOURCE = /\.(ts|tsx|css)$/;

function files(directory: string): string[] {
  let entries: string[];
  try { entries = readdirSync(directory); } catch { return []; }
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : files(path);
    return SOURCE.test(entry) ? [path] : [];
  });
}

const sources = () => SCANNED.flatMap((directory) => files(join(root, directory)));
const relative = (path: string) => path.slice(root.length + 1).replaceAll("\\", "/");

function offenders(needle: string | RegExp) {
  return sources()
    .filter((path) => {
      const text = readFileSync(path, "utf8");
      return typeof needle === "string" ? text.includes(needle) : needle.test(text);
    })
    .map(relative);
}

// The reimagined portal does not mount the classic unsaved-guard provider (its shell leaves through the top bar's
// useLeaveGuard), so the spec's confirm ban is excluded for it ("excluding reimagined"). Most reimagined screens live
// under a directory named reimagined, which the scan skips. These few shared files still hold the reimagined portal's
// original native confirm inside one named function; each entry allows exactly that call, in that function, in that file.
// Anything else in the same file, or a second copy of the call, still fails.
const REIMAGINED_CONFIRM_ALLOWLIST: { file: string; within: string; call: string; why: string }[] = [
  { file: "app/admin/(protected)/tryouts/page.tsx", within: "function selectTryout(", call: 'window.confirm("Discard unsaved tryout changes?")', why: "LegacyAdminTryoutsPage (not rendered; kept because contract tests read its text)" },
  { file: "app/admin/(protected)/tryouts/page.tsx", within: "function startCreate(", call: 'window.confirm("Discard unsaved tryout changes?")', why: "LegacyAdminTryoutsPage (not rendered; kept because contract tests read its text)" },
];

/** Source without comments, so prose that mentions confirm() is not a call. */
function code(path: string) {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}])\/\/.*$/gm, "$1");
}

/** The text of the function that starts at `within`: from the declaration to the closing brace at its own indent. */
function functionRange(text: string, within: string): [number, number] | null {
  const start = text.indexOf(within);
  if (start < 0 || text.indexOf(within, start + 1) >= 0) return null;
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
  const end = text.indexOf(`\n${indent}}\n`, start);
  return end < 0 ? null : [start, end];
}

function withoutAllowed(file: string, text: string, list = REIMAGINED_CONFIRM_ALLOWLIST) {
  let remaining = text;
  for (const entry of list.filter((candidate) => candidate.file === file)) {
    const range = functionRange(remaining, entry.within);
    if (!range) continue;
    const body = remaining.slice(range[0], range[1]);
    const at = body.indexOf(entry.call);
    if (at < 0 || body.indexOf(entry.call, at + 1) >= 0) continue;
    remaining = remaining.slice(0, range[0] + at) + remaining.slice(range[0] + at + entry.call.length);
  }
  return remaining;
}

// A bare confirm( is the same native dialog; a file that declares its own confirm binding calls that instead.
const NATIVE_CONFIRM = /\bwindow\.confirm\b|\bglobalThis\.confirm\b|(?<![\w$.])confirm\s*\(/;
const DECLARES_OWN_CONFIRM = /\bfunction\s+confirm\b|\b(?:const|let|var)\s+confirm\b/;

function confirmOffenders() {
  return sources().filter((path) => path.endsWith(".ts") || path.endsWith(".tsx")).filter((path) => {
    const text = withoutAllowed(relative(path), code(path));
    if (/\bwindow\.confirm\b|\bglobalThis\.confirm\b/.test(text)) return true;
    return !DECLARES_OWN_CONFIRM.test(text) && NATIVE_CONFIRM.test(text);
  }).map(relative);
}

describe("admin sweep guards (reimagined excluded)", () => {
  it("never opens a native confirm (window.confirm, globalThis.confirm or a bare confirm call)", () => {
    expect(confirmOffenders()).toEqual([]);
  });
  it("lists each reimagined-portal confirm exactly once, in its named function", () => {
    const stale = REIMAGINED_CONFIRM_ALLOWLIST.filter((entry) => {
      const path = join(root, entry.file);
      let text: string;
      try { text = code(path); } catch { return true; }
      const range = functionRange(text, entry.within);
      if (!range) return true;
      const body = text.slice(range[0], range[1]);
      const at = body.indexOf(entry.call);
      return at < 0 || body.indexOf(entry.call, at + 1) >= 0;
    });
    expect(stale.map((entry) => `${entry.file} ${entry.within}`)).toEqual([]);
  });
  it("catches a bare confirm call, and allows only the single named call in the named function", () => {
    const bare = "function a() { if (confirm('Sure?')) go(); }";
    expect(NATIVE_CONFIRM.test(bare) && !DECLARES_OWN_CONFIRM.test(bare)).toBe(true);
    expect(NATIVE_CONFIRM.test("globalThis.confirm('Sure?')")).toBe(true);
    expect(NATIVE_CONFIRM.test("onConfirm(value); dialog.confirm(x); AdminConfirmDialog(")).toBe(false);
    const call = 'window.confirm("Discard?")';
    const list = [{ file: "x.ts", within: "function pick(", call, why: "test" }];
    const hit = (text: string) => /window\.confirm/.test(withoutAllowed("x.ts", text, list));
    expect(hit(`  function pick() {
    if (${call}) return;
  }
`)).toBe(false);
    expect(hit(`  function pick() {
    if (${call}) return;
    ${call};
  }
`)).toBe(true);
    expect(hit(`  function pick() {
    return;
  }
  function other() {
    ${call};
  }
`)).toBe(true);
    expect(/window\.confirm/.test(withoutAllowed("y.ts", `  function pick() {
    ${call};
  }
`, list))).toBe(true);
  });
  it('never shows the "All changes saved" wording', () => {
    expect(offenders("All changes saved")).toEqual([]);
  });
  it("keeps the retired pill and bouncing-dots loaders gone", () => {
    expect(offenders(/AdminSaveFeedback|AdminLoadingDots|spinner-ellipsis|admin-save-feedback/)).toEqual([]);
  });
});
