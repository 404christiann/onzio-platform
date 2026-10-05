import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { programPageSaveRequestSchema } from "@/lib/program-page-editor/contract";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const id = "44444444-4444-4444-8444-444444444401";
const asset = "55555555-5555-4555-8555-555555555501";
const updatedAt = "2026-10-02T18:00:00+00:00";
const valid = {
  operationId: "77777777-7777-4777-8777-777777777701",
  programId: id,
  expected: { programUpdatedAt: updatedAt, gallery: [{ id, updatedAt }] },
  program: {
    slug: "academy", nav_label: "Academy", display_title: "Youth Academy", kicker: "", summary: "", body: "", highlights: [],
    layout_variant: "statement_band" as const, hero_media_asset_id: asset, detail_media_asset_id: null,
    external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
    registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "",
    status: "active" as const, sort_order: 0,
  },
  gallery: [{ id, mediaAssetId: asset, alt: "Players training", sortOrder: 0 }],
};

describe("Programs public-page editor contract", () => {
  it("accepts a complete page save and rejects client tenant identity or missing baseline", () => {
    expect(programPageSaveRequestSchema.safeParse(valid).success).toBe(true);
    expect(programPageSaveRequestSchema.safeParse({ ...valid, club_id: id }).success).toBe(false);
    expect(programPageSaveRequestSchema.safeParse({ ...valid, expected: { programUpdatedAt: null, gallery: [] } }).success).toBe(false);
    expect(programPageSaveRequestSchema.safeParse({ ...valid, gallery: [{ ...valid.gallery[0], sortOrder: 1 }] }).success).toBe(false);
  });

  it("navigates from the real directory to a real detail page with a persistent search", () => {
    const page = source("app/admin/(protected)/programs/page.tsx");
    const frame = source("components/admin/ProgramCanvasFrame.tsx");
    expect(page).toContain("<AcademyProgramsPage programs={directoryPrograms}");
    expect(page).toContain("<AcademyProgramDetailPage program={previewProgram}");
    expect(page).toContain("<ProgramCanvasFrame");
    expect(page).toContain("program-editor-navigation-desktop");
    expect(page).toContain("program-editor-navigation-phone");
    expect(page).toContain('type ProgramPageView = "directory" | "detail" | "manage"');
    expect(page).toContain("program.displayTitle.toLowerCase().includes(trimmedProgramFilter)");
    expect(frame).toContain("createPortal");
    expect(frame).toContain("onProgramLink?.(");
    expect(frame).toContain("data-program-editor-section");
  });

  it("shows the linked open registration form in the detail canvas", () => {
    const page = source("app/admin/(protected)/programs/page.tsx");
    const route = source("app/api/admin/programs-preview-forms/route.ts");
    expect(page).toContain('fetch("/api/admin/programs-preview-forms", { cache: "no-store" })');
    expect(page).toContain("nativeRegistration: linkedForm");
    expect(route).toContain("requireFreshClubSession");
    expect(route).toContain('club.presentationTemplateKey !== "academy@1"');
    expect(route).toContain('eq("club_id", club.id).eq("status", "open")');
    expect(route).toContain("loadLinkedOpenRegistrationForms");
  });

  it("stages order and visibility until one directory Save", () => {
    const page = source("app/admin/(protected)/programs/page.tsx");
    expect(page).toContain("function toggleProgramVisibility(programId: string)");
    expect(page).toContain("async function saveManagement()");
    expect(page).toContain('fetch("/api/admin/programs-directory", { method: "POST"');
    expect(page).not.toContain("Order saves as soon as you drop it");
  });

  it("commits each detail page with its gallery in one actor-scoped transaction", () => {
    const route = source("app/api/admin/programs-page/route.ts");
    const sql = source("supabase/migrations/20261002204000_program_page_atomic_save.sql");
    expect(route).toContain("requireFreshClubSession");
    expect(route).toContain("authorizeMutation");
    expect(route).toContain('club.presentationTemplateKey !== "academy@1"');
    expect(route).toContain('request.headers.get("sec-fetch-site") !== "cross-site"');
    expect(route).toContain('onzio.rpc("save_program_page"');
    expect(sql).toContain("create function onzio.save_program_page");
    expect(sql).toContain("language plpgsql security invoker set search_path=''");
    expect(sql).toContain("create table onzio_private.program_page_receipts");
    expect(sql).toContain("delete from onzio.program_media where club_id=p_club_id and program_id=v_program_id");
    expect(sql).toContain("raise exception 'CONTENT_CHANGED' using errcode='PT409'");
  });
});
