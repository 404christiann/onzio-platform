import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as model from "@/lib/program-admin";
import * as constants from "@/components/admin/programs/program-editor-types";
import { deriveProgramSlug } from "@/lib/slugify";
import { submitPageSave } from "@/lib/page-editor-save";

const hookSource = readFileSync(resolve("components/admin/programs/useProgramsEditor.ts"), "utf8");
const id = "44444444-4444-4444-8444-444444444401";
const otherId = "44444444-4444-4444-8444-444444444402";
const createdId = "44444444-4444-4444-8444-444444444409";
const originalVersion = "2026-11-15T00:00:00.123456Z";

function createEditor(classic = true) {
  const first = { ...model.emptyProgramDraft(), id, updatedAt: originalVersion, slug: "academy", navLabel: "Academy", displayTitle: "Academy" };
  const second = { ...first, id: otherId, slug: "other", navLabel: "Other", displayTitle: "Other", sortOrder: 1 };
  const row = (draft: typeof first) => ({
    ...model.buildProgramMutationPayload(draft), id: draft.id,
    club_id: "11111111-1111-4111-8111-111111111111",
    status: draft.status, sort_order: draft.sortOrder,
    sign_ups_closed: false, sign_up_by_contact: false,
    created_at: originalVersion, updated_at: originalVersion,
  });
  const rows = [row(first), row(second)];
  const commands: Array<{ path: string; body: any; raw: string; recovery: string | null }> = [];
  const receipts = new Map<string, unknown>();
  const outcomes = { program: [] as string[], directory: [] as string[] };
  let tick = 1;
  const version = () => "2026-11-15T00:00:" + String(tick++).padStart(2, "0") + ".123456Z";
  const transport = async (url: string, options: RequestInit = {}) => {
    const path = new URL(url, "http://localhost").pathname;
    if (!options.method || options.method === "GET") {
      const receipt = receipts.get(new URL(url, "http://localhost").searchParams.get("operationId") ?? "");
      return Response.json({ operation: receipt ? { status: "committed", receipt } : null });
    }
    const raw = String(options.body), body = JSON.parse(raw);
    commands.push({ path, body, raw, recovery: new Headers(options.headers).get("X-Editor-Recovery") });
    const kind = path.endsWith("directory") ? "directory" : "program";
    const outcome = outcomes[kind].shift();
    if (outcome === "rejected") return Response.json({ error: { code: "FORBIDDEN", message: "Rejected" } }, { status: 403 });
    if (outcome === "uncertain") return Response.json({ error: { message: "Unknown" } }, { status: 503 });
    if (kind === "program") {
      let current = rows.find(item => item.id === body.programId);
      if (current && (body.program.status !== current.status || body.program.sort_order !== current.sort_order)) {
        return Response.json({ error: { code: "FIELD_UNAVAILABLE", message: "Order and visibility belong to the directory." } }, { status: 400 });
      }
      if (body.expected.programUpdatedAt !== (current?.updated_at ?? null)) {
        return Response.json({ error: { code: "CONTENT_CHANGED", message: "Stale content version" } }, { status: 409 });
      }
      if (!current) {
        current = { ...row(first), id: createdId };
        rows.push(current);
      }
      Object.assign(current, body.program, { updated_at: version() });
      const snapshot = { program: structuredClone(current), gallery: [] };
      receipts.set(body.operationId, snapshot);
      if (outcome === "receipt") return Response.json({ error: { message: "Response lost" } }, { status: 503 });
      return Response.json(snapshot);
    }
    if (body.expected.some((item: any) => rows.find(current => current.id === item.id)?.updated_at !== item.updatedAt)) {
      return Response.json({ error: { code: "CONTENT_CHANGED", message: "Stale directory version" } }, { status: 409 });
    }
    for (const item of body.programs) Object.assign(rows.find(current => current.id === item.id)!, { status: item.status, sort_order: item.sortOrder, updated_at: version() });
    const snapshot = { programs: structuredClone(rows) };
    receipts.set(body.operationId, snapshot);
    return Response.json(snapshot);
  };
  vi.stubGlobal("fetch", transport);
  const output: Record<string, any> = { draft: first, programs: [first, second], gallery: [], galleryByProgram: {}, dirty: false };
  const state: Record<string, any> = {
    ...model, ...constants, deriveProgramSlug, submitPageSave, crypto: { randomUUID }, Error, console,
    classic, draft: first, programs: [first, second], gallery: [], galleryByProgram: {},
    dirty: false, managementDirty: false, pageCopyDirty: false,
    loading: false, saving: false, managementSaving: false, uploadingRole: null, uploadingGallery: false,
    programConflict: null, managementConflict: null, unconfirmedProgram: null, unconfirmedManagement: null, editorLocked: false,
    operationInFlight: { current: false }, batch: { current: false }, pendingPickers: { current: new Set() },
    pendingProgramCommand: { current: null }, pendingDirectoryCommand: { current: null },
    directoryDraft: { current: [first, second] },
    confirmedDirectory: { current: [first, second].map(({ id, updatedAt, status, sortOrder }) => ({ id, updatedAt, status, sortOrder })) },
    confirmedAssets: { current: new Set() }, ownedUploads: { current: new Map() },
    latestMedia: { current: { draft: first, gallery: [], unconfirmedProgram: null } },
    fetch: transport, errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
    selectTab: () => {}, selectPageCopySection: () => {},
  };
  for (const name of ["Programs", "Draft", "Gallery", "GalleryByProgram", "RemovedGalleryIds", "SavedManagement", "UnconfirmedProgram", "UnconfirmedManagement", "Error", "Errors", "Dirty", "Saving", "Saved", "ManagementError", "ManagementSaving", "ManagementSaved", "ManagementConflict", "ProgramConflict", "BatchSaving", "CleanupError", "SelectedSection"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    state["set" + name] = (value: any) => { output[key] = typeof value === "function" ? value(output[key]) : value; };
  }
  const context = createContext(state);
  const ast = ts.createSourceFile("useProgramsEditor.ts", hookSource, ts.ScriptTarget.Latest, true);
  const declarations: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.name.text !== "useProgramsEditor") declarations.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  runInContext(ts.transpile(declarations.join("\n"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  function publish() {
    Object.assign(state, output);
    state.directoryDraft.current = state.programs;
  }
  function stage() {
    state.updateDraft("displayTitle", "Updated academy"); publish();
    state.persistProgramOrder([{ ...second, sortOrder: 0 }, { ...first, sortOrder: 1 }]); publish();
    state.toggleProgramVisibility(id); publish();
    state.managementDirty = true;
  }
  return { state, output, rows, commands, receipts, outcomes, stage, publish, first, second };
}

afterEach(() => vi.unstubAllGlobals());

describe("classic combined program and directory saves", () => {
  it("saves content using confirmed metadata and then persists staged order and visibility against the returned version", async () => {
    const editor = createEditor(); editor.stage();
    expect(await editor.state.saveAll()).toBe(true);
    expect(editor.commands.map(command => command.path)).toEqual(["/api/admin/programs-page", "/api/admin/programs-directory"]);
    const [content, directory] = editor.commands.map(command => command.body);
    expect(content.program).toMatchObject({ display_title: "Updated academy", status: "active", sort_order: 0 });
    expect(directory.programs).toEqual([{ id: otherId, sortOrder: 0, status: "active" }, { id, sortOrder: 1, status: "hidden" }]);
    expect(directory.expected.find((item: any) => item.id === id).updatedAt).toBe((editor.receipts.get(content.operationId) as any).program.updated_at);
    expect(directory.expected.find((item: any) => item.id === id).updatedAt).not.toBe(originalVersion);
    expect(editor.rows.find(item => item.id === id)).toMatchObject({ display_title: "Updated academy", status: "hidden", sort_order: 1 });
    expect(editor.output.draft).toMatchObject({ displayTitle: "Updated academy", status: "hidden", sortOrder: 1 });
  });

  it("keeps staged metadata visible after content succeeds and records only actual server metadata as confirmed", async () => {
    const editor = createEditor(); editor.stage();
    expect(await editor.state.saveProgram()).toBe(true);
    expect(editor.output.draft).toMatchObject({ displayTitle: "Updated academy", status: "hidden", sortOrder: 1 });
    expect(editor.state.directoryDraft.current.find((item: any) => item.id === id)).toMatchObject({ status: "hidden", sortOrder: 1 });
    expect(editor.state.confirmedDirectory.current.find((item: any) => item.id === id)).toMatchObject({ status: "active", sortOrder: 0, updatedAt: "2026-11-15T00:00:01.123456Z" });
  });

  it("stops before directory persistence when the content save is definitely rejected", async () => {
    const editor = createEditor(); editor.stage(); editor.outcomes.program.push("rejected");
    expect(await editor.state.saveAll()).toBe(false);
    expect(editor.commands).toHaveLength(1);
    expect(editor.output.draft).toMatchObject({ displayTitle: "Updated academy", status: "hidden", sortOrder: 1 });
    expect(editor.state.confirmedDirectory.current.find((item: any) => item.id === id).updatedAt).toBe(originalVersion);
    expect(editor.rows.find(item => item.id === id)).toMatchObject({ display_title: "Academy", status: "active", sort_order: 0 });
  });

  it("replays the original uncertain content command without changing its metadata before saving the staged directory", async () => {
    const editor = createEditor(); editor.stage(); editor.outcomes.program.push("uncertain");
    expect(await editor.state.saveAll()).toBe(false);
    const original = editor.commands[0].raw;
    editor.publish();
    expect(await editor.state.saveAll()).toBe(true);
    expect(editor.commands.map(command => command.path)).toEqual(["/api/admin/programs-page", "/api/admin/programs-page", "/api/admin/programs-directory"]);
    expect(editor.commands[1].raw).toBe(original);
    expect(editor.commands[1].recovery).toBe("1");
    expect(editor.rows.find(item => item.id === id)).toMatchObject({ status: "hidden", sort_order: 1, display_title: "Updated academy" });
  });

  it("reconciles a committed content receipt before persisting the staged directory", async () => {
    const editor = createEditor(); editor.stage(); editor.outcomes.program.push("receipt");
    expect(await editor.state.saveAll()).toBe(true);
    expect(editor.commands.map(command => command.path)).toEqual(["/api/admin/programs-page", "/api/admin/programs-directory"]);
    expect(editor.rows.find(item => item.id === id)).toMatchObject({ status: "hidden", sort_order: 1, display_title: "Updated academy" });
  });

  it("retries only the exact uncertain directory command after content was confirmed", async () => {
    const editor = createEditor(); editor.stage(); editor.outcomes.directory.push("uncertain");
    expect(await editor.state.saveAll()).toBe(false);
    const original = editor.commands[1].raw;
    editor.publish();
    expect(await editor.state.saveAll()).toBe(true);
    expect(editor.commands.map(command => command.path)).toEqual(["/api/admin/programs-page", "/api/admin/programs-directory", "/api/admin/programs-directory"]);
    expect(editor.commands[2].raw).toBe(original);
    expect(editor.commands[2].recovery).toBe("1");
    expect(editor.rows.find(item => item.id === id)).toMatchObject({ status: "hidden", sort_order: 1, display_title: "Updated academy" });
  });

  it("leaves new-program content metadata unchanged before the server has assigned an ID", async () => {
    const editor = createEditor();
    editor.state.draft = { ...editor.first, id: null, slug: "new-program", status: "hidden", sortOrder: 2 };
    editor.output.draft = editor.state.draft;
    expect(await editor.state.saveProgram()).toBe(true);
    expect(editor.commands[0].body.program).toMatchObject({ slug: "new-program", status: "hidden", sort_order: 2 });
    expect(editor.output.draft).toMatchObject({ id: createdId, slug: "new-program", status: "hidden", sortOrder: 2 });
  });

  it("retains the Legacy combined-save request and result behavior", async () => {
    const editor = createEditor(false); editor.stage();
    expect(await editor.state.saveAll()).toBe(true);
    expect(editor.commands[0].body.program).toMatchObject({ status: "active", sort_order: 0, display_title: "Updated academy" });
    expect(editor.commands[1].body.programs).toEqual([{ id: otherId, sortOrder: 0, status: "active" }, { id, sortOrder: 1, status: "hidden" }]);
    expect(editor.output.draft).toMatchObject({ displayTitle: "Updated academy", status: "hidden", sortOrder: 1 });
  });
});
