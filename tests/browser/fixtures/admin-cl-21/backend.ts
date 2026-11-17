import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlElEQVRogeXOMQEAIAzAsMqeFrTgjcnIwZE/zbnvZ+mAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgLb69Z3wSh87CQAAAABJRU5ErkJggg==", "base64");
export function gate() { let release = () => {}; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
export const ids = ["21212121-0000-4000-8000-000000000001", "21212121-0000-4000-8000-000000000002", "21212121-0000-4000-8000-000000000003"];
export const formId = "21212121-0000-4000-8000-000000000010";
export async function backend(page: Page, origin: string) {
  let tick = 1;
  const version = () => "2026-11-15T00:00:" + String(tick++).padStart(2, "0") + ".123456Z";
  const rows: any[] = ids.map((id, index) => ({
    id, club_id: "11111111-1111-4111-8111-111111111111", slug: ["academy", "futsal", "hidden"][index], nav_label: ["Academy", "Futsal", "Hidden"][index],
    display_title: ["Academy Pathway", "Winter Futsal", "Hidden Program"][index], kicker: "Play together", summary: "A program for every player.", body: "Train and grow through the game.",
    highlights: ["Skill", "Teamwork"], layout_variant: "statement_band", hero_media_asset_id: null, detail_media_asset_id: null,
    external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
    registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "",
    status: index === 2 ? "hidden" : "active", sort_order: index, created_at: version(), updated_at: version(),
  }));
  const state = {
    rows, media: [] as any[], copy: null as any, posts: [] as { kind: string; body: any; recovery: string | undefined }[],
    reads: [] as string[], cleanups: [] as string[], assets: [] as string[], errors: [] as string[], uploads: 0, expectedHttpErrors: 0,
    readGate: null as ReturnType<typeof gate> | null, postGate: null as ReturnType<typeof gate> | null, uploadGate: null as ReturnType<typeof gate> | null,
    programOutcome: "" as "" | "uncertain" | "receipt" | "conflict" | "denied", directoryOutcome: "" as "" | "uncertain" | "conflict",
    copyFailure: false, cleanupFailure: false, uploadFailure: false,
    forms: [{ id: formId, title: "Open Academy Registration", status: "open" }, { id: "21212121-0000-4000-8000-000000000011", title: "Draft Registration", status: "draft" }],
    openForms: { [formId]: { slug: "academy-open", title: "Open Academy Registration", description: "Join us", participantMode: "adult_only", waiverText: "", fields: [], prices: [] } },
    receipts: new Map<string, any>(),
  };
  page.on("pageerror", error => state.errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (state.expectedHttpErrors > 0 && /Failed to load resource:.*status of (400|403|409|503)/.test(message.text())) state.expectedHttpErrors--;
    else state.errors.push(message.text());
  });
  await page.route("**/*", async route => {
    const failure = (status: number, json: unknown) => { state.expectedHttpErrors++; return route.fulfill({ status, json }); };
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/favicon.ico" || url.pathname.startsWith("/__cl21__/asset/") || url.pathname.startsWith("/images/")) return route.fulfill({ contentType: "image/png", body: png });
    if (url.pathname === "/__cl21__/data") {
      const query = route.request().postDataJSON();
      state.reads.push(query.table);
      if (query.action === "upsert") {
        state.posts.push({ kind: "copy", body: query.values, recovery: undefined });
        if (state.copyFailure) { state.copyFailure = false; return route.fulfill({ json: { data: null, error: { message: "Page words could not be saved." } } }); }
        state.copy = { ...query.values, id: "copy", updated_at: version() };
        return route.fulfill({ json: { data: state.copy, error: null } });
      }
      await state.readGate?.promise;
      const data = query.table === "programs" ? state.rows : query.table === "program_media" ? state.media : query.table === "programs_page_content" ? state.copy ? [state.copy] : [] : query.table === "registration_forms" ? state.forms : [];
      return route.fulfill({ json: { data: query.single ? data[0] ?? null : data, error: null } });
    }
    if (url.pathname === "/__cl21__/upload") {
      state.uploads++;
      await state.uploadGate?.promise;
      if (state.uploadFailure) { state.uploadFailure = false; return route.fulfill({ json: { data: null, error: { message: "Photo upload failed." } } }); }
      const assetId = randomUUID(); state.assets.push(assetId);
      return route.fulfill({ json: { data: { assetId, path: url.searchParams.get("path") }, error: null } });
    }
    if (url.pathname === "/__cl21__/cleanup") {
      const paths = route.request().postDataJSON().paths;
      if (state.cleanupFailure) { state.cleanupFailure = false; return route.fulfill({ json: { data: null, error: { message: "Unused photo cleanup failed." } } }); }
      state.cleanups.push(...paths);
      return route.fulfill({ json: { data: paths, error: null } });
    }
    if (url.pathname === "/api/admin/programs-preview-forms") return route.fulfill({ json: { forms: state.openForms } });
    if (!["/api/admin/programs-page", "/api/admin/programs-directory"].includes(url.pathname)) return route.continue();
    const kind = url.pathname.endsWith("directory") ? "directory" : "program";
    if (route.request().method() === "GET") {
      if (url.searchParams.has("operationId")) {
        const receipt = state.receipts.get(url.searchParams.get("operationId")!);
        return route.fulfill({ json: { operation: receipt ? { status: "committed", receipt } : null } });
      }
      return route.fulfill({ json: kind === "directory" ? { programs: state.rows } : { program: state.rows.find(row => row.id === url.searchParams.get("programId")), gallery: state.media.filter(row => row.program_id === url.searchParams.get("programId")) } });
    }
    const body = route.request().postDataJSON();
    state.posts.push({ kind, body, recovery: route.request().headers()["x-editor-recovery"] });
    await state.postGate?.promise;
    const outcome = kind === "program" ? state.programOutcome : state.directoryOutcome;
    if (kind === "program") state.programOutcome = ""; else state.directoryOutcome = "";
    if (outcome === "denied") return failure(403, { error: { code: "FORBIDDEN", message: "You cannot save this program." } });
    if (outcome === "conflict") {
      if (kind === "program") { const row = state.rows.find(row => row.id === body.programId); row.display_title = "Saved elsewhere"; row.updated_at = version(); }
      else { state.rows.reverse(); state.rows.forEach((row, index) => { row.sort_order = index; row.updated_at = version(); }); }
      return failure(409, { error: { code: "CONTENT_CHANGED", message: "Saved content changed elsewhere." } });
    }
    if (outcome === "uncertain") return failure(503, { error: { message: "Save is unconfirmed." } });
    if (kind === "program") {
      let row = state.rows.find(row => row.id === body.programId);
      if (row && (body.program.slug !== row.slug || body.program.status !== row.status || body.program.sort_order !== row.sort_order)) return failure(400, { error: { code: "FIELD_UNAVAILABLE", message: "Program order and visibility are edited in Manage programs." } });
      if (!row) { row = { id: randomUUID(), club_id: "11111111-1111-4111-8111-111111111111", created_at: version() }; state.rows.push(row); }
      if (body.expected.programUpdatedAt !== (row.updated_at ?? null)) return failure(409, { error: { code: "CONTENT_CHANGED", message: "Program revision is stale." } });
      Object.assign(row, body.program, { updated_at: version() });
      state.media = state.media.filter(item => item.program_id !== row.id).concat(body.gallery.map((item: any) => ({ id: item.id ?? randomUUID(), club_id: row.club_id, program_id: row.id, media_asset_id: item.mediaAssetId, alt: item.alt, sort_order: item.sortOrder, updated_at: version(), url: origin + "/__cl21__/asset/" + item.mediaAssetId })));
      const snapshot = { program: structuredClone(row), gallery: structuredClone(state.media.filter(item => item.program_id === row.id)) };
      state.receipts.set(body.operationId, snapshot);
      if (outcome === "receipt") return failure(503, { error: { message: "Response interrupted." } });
      return route.fulfill({ json: snapshot });
    }
    if (body.expected.some((item: any) => state.rows.find(row => row.id === item.id)?.updated_at !== item.updatedAt)) return failure(409, { error: { code: "CONTENT_CHANGED", message: "Directory revision is stale." } });
    for (const item of body.programs) Object.assign(state.rows.find(row => row.id === item.id), { status: item.status, sort_order: item.sortOrder, updated_at: version() });
    state.rows.sort((left, right) => left.sort_order - right.sort_order);
    const snapshot = { programs: structuredClone(state.rows) };
    state.receipts.set(body.operationId, snapshot);
    return route.fulfill({ json: snapshot });
  });
  return state;
}
