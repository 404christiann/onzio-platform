import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTryoutMutationPayload, emptyTryoutDraft } from "@/lib/tryout-admin";
import { tryoutsPageSaveSchema } from "@/lib/tryouts-page-editor/contract";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const row = (id: string | null, sort_order: number) => ({
  ...buildTryoutMutationPayload(emptyTryoutDraft(sort_order)), id, sort_order,
});
const request = () => ({
  operationId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedRevision: "0",
  page: { intro_with_tryouts: "See events below.", intro_no_tryouts: "Coming soon." },
  events: [row("bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 0)],
  deletedIds: [] as string[],
});

describe("Tryouts public-page Save contract", () => {
  it("accepts one complete page request and rejects tenant or participant payloads", () => {
    expect(tryoutsPageSaveSchema.safeParse(request()).success).toBe(true);
    expect(tryoutsPageSaveSchema.safeParse({ ...request(), page: null }).success).toBe(true);
    expect(tryoutsPageSaveSchema.safeParse({ ...request(), club_id: "attacker" }).success).toBe(false);
    expect(tryoutsPageSaveSchema.safeParse({ ...request(), events: [{ ...row(null, 0), participant_email: "private" }] }).success).toBe(false);
    expect(tryoutsPageSaveSchema.safeParse({ ...request(), events: [{ ...row(null, 0), registration_href: "//evil.test" }] }).success).toBe(false);
  });

  it("rejects duplicate, overlapping, and out-of-order event identities", () => {
    const base = request();
    expect(tryoutsPageSaveSchema.safeParse({ ...base, events: [base.events[0], base.events[0]] }).success).toBe(false);
    expect(tryoutsPageSaveSchema.safeParse({ ...base, deletedIds: [base.events[0].id] }).success).toBe(false);
    expect(tryoutsPageSaveSchema.safeParse({ ...base, events: [row(null, 1)] }).success).toBe(false);
  });

  it("routes the public canvas to the atomic endpoint, with a red white-text staged Delete and Undo", () => {
    const route = read("app/admin/(protected)/tryouts/page.tsx");
    const editor = read("components/admin/tryouts/TryoutsPageEditor.tsx");
    const preview = read("components/admin/ScaledTryoutsPreview.tsx");
    expect(route).toContain('export { default } from "@/components/admin/tryouts/TryoutsPageEditor"');
    expect(editor).toContain('fetch("/api/admin/tryouts-page"');
    expect(editor).toContain("deletedIds: deleted.map");
    expect(editor).toContain("page: pageDirty ? buildTryoutsPageMutationPayload(pageCopy)");
    expect(editor).toContain("setEvents((current) => ordered(current.filter");
    expect(editor).toContain("function undoDelete()");
    expect(editor).toContain("bg-destructive");
    expect(editor).toContain("text-destructive-foreground");
    expect(editor).toContain('import { AlertDialog } from "@base-ui/react/alert-dialog"');
    expect(editor).toContain("<AlertDialog.Title");
    expect(editor).toContain("<AlertDialog.Description");
    expect(editor).not.toContain('window.confirm(`Delete');
    expect(editor).toContain('club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1"');
    expect(editor).not.toMatch(/\.from\("tryouts"\)\s*\.(update|delete|insert)/);
    expect(preview).toContain("TryoutsPreviewFrame");
    expect(preview).toContain("editor={onSelect ? { selected, onSelect } : undefined}");
    expect(editor).toContain("nativeForms[event.registrationFormId]");
    expect(read("app/api/admin/tryouts-page/route.ts")).toContain("loadLinkedOpenRegistrationForms");
  });

  it("checks auth and tenant again at the route and database boundary", () => {
    const api = read("app/api/admin/tryouts-page/route.ts");
    const migration = read("supabase/migrations/20261002143000_tryouts_page_atomic_save.sql");
    for (const guard of ["requireFreshClubSession", "getClubContext", "authorizeMutation", "sec-fetch-site", "tryoutsPageSaveSchema"]) {
      expect(api).toContain(guard);
    }
    for (const guard of ["can_mutate_feature(p_club_id,'tryouts')", "auth.uid()", "expectedRevision", "tryouts_page_save_receipts", "pg_advisory_xact_lock", "actual_count<>expected_count", "club_id=p_club_id and id=event_id"]) {
      expect(migration).toContain(guard);
    }
    expect(migration).toContain("delete from onzio.tryouts where club_id=p_club_id and id=any(deleted_ids)");
    expect(migration).not.toMatch(/delete from onzio\.registrations|delete from onzio\.registration_forms/);
  });
});
