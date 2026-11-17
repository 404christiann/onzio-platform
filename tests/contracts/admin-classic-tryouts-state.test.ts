import { describe, expect, it } from "vitest";
import { deletionCommand, eventFromSnapshot, pageCommand, reconcileDeletedEvent,
  type TryoutsSnapshot } from "@/components/admin/tryouts/classic-tryouts-state";
import { emptyTryoutDraft, tryoutDraftToRow, tryoutsPageToDraft } from "@/lib/tryout-admin";
import { tryoutsPageSaveSchema } from "@/lib/tryouts-page-editor/contract";

const first = "88888888-8888-4888-8888-888888888811";
const second = "88888888-8888-4888-8888-888888888812";
const op = "99999999-9999-4999-8999-999999999991";
function fixture(): TryoutsSnapshot {
  return { revision: "7", page: { intro_with_tryouts: "Saved intro", intro_no_tryouts: "Saved empty" },
    events: [first, second].map((id, sortOrder) => ({
      ...tryoutDraftToRow({ ...emptyTryoutDraft(sortOrder), id, headline: "Saved " + sortOrder }),
      hidden: false, stays_open_after_date: true, sign_up_by_contact: false,
      created_at: "2026-11-14T10:11:12.123456Z", updated_at: "2026-11-14T10:11:12.654321Z",
    })) };
}

describe("classic Tryouts isolated confirmed deletion", () => {
  it("uses only confirmed survivor values, leaves page unchanged and commits one identity", () => {
    const saved = fixture();
    saved.events[1].headline = "  Saved whitespace  ";
    saved.events[1].eyebrow = " retained ";
    saved.events[1].registration_href = "mailto:owner@example.test";
    const target = eventFromSnapshot(saved.events[0]);
    const command = deletionCommand(saved, target, op);
    expect(command.kind).toBe("delete");
    expect(command.request).toEqual({
      operationId: op, expectedRevision: "7", page: null, deletedIds: [first],
      events: [{
        id: second, program_id: null, status: "upcoming", eyebrow: " retained ",
        headline: "  Saved whitespace  ", intro: "", hero_media_asset_id: null,
        eligibility_copy: "", what_to_expect_copy: "", preparation_copy: "", event_date: null,
        location: "", cost_text: "", cta_label: "", registration_href: "mailto:owner@example.test",
        registration_form_id: null, closed_message: "", sort_order: 0,
      }],
    });
    expect(tryoutsPageSaveSchema.safeParse(command.request).success).toBe(true);
    expect(saved.events).toHaveLength(2);
    expect(saved.events[1].sort_order).toBe(1);
  });

  it("retains unrelated edits, new rows, sign-up state and unpublished media after receipt", () => {
    const saved = fixture();
    const target = eventFromSnapshot(saved.events[0]);
    const survivor = { ...eventFromSnapshot(saved.events[1]), headline: "Unsaved survivor",
      heroMediaAssetId: "77777777-7777-4777-8777-777777777771", heroMediaPreviewUrl: "/new-owned.webp" };
    const added = { ...emptyTryoutDraft(2), clientKey: "new-client-key", headline: "Never saved" };
    const command = deletionCommand(saved, target, op);
    const committed = { ...saved, revision: "8", events: [{ ...saved.events[1], sort_order: 0 }] };
    const result = reconcileDeletedEvent(committed, [target, survivor, added], target.clientKey, true);
    expect(result.dirty).toBe(true);
    expect(result.events).toEqual([{ ...survivor, sortOrder: 0 }, { ...added, sortOrder: 1 }]);
    expect(result.events[0].signUp).toEqual({ hidden: false, stays_open_after_date: true, sign_up_by_contact: false });
    expect(command.request.events[0].headline).toBe("Saved 1");
    expect(command.request.events[0].hero_media_asset_id).toBeNull();
    expect(command.request.page).toBeNull();
    expect(command.request.expectedRevision).toBe("7");
  });

  it("keeps an unrelated unsaved reorder while advancing the confirmed baseline", () => {
    const saved = fixture();
    const third = { ...saved.events[1], id: "88888888-8888-4888-8888-888888888813", sort_order: 2 };
    saved.events.push(third);
    const current = [eventFromSnapshot(third), eventFromSnapshot(saved.events[0]), eventFromSnapshot(saved.events[1])];
    const committed = { ...saved, revision: "8", events: saved.events.slice(1).map((row, sort_order) => ({ ...row, sort_order })) };
    const result = reconcileDeletedEvent(committed, current, first, false);
    expect(result.events.map((event) => event.id)).toEqual([third.id, second]);
    expect(result.dirty).toBe(true);
  });

  it("clears dirty only when the deletion leaves exactly the confirmed draft", () => {
    const saved = fixture();
    const committed = { ...saved, revision: "8", events: [{ ...saved.events[1], sort_order: 0 }] };
    expect(reconcileDeletedEvent(committed, saved.events.map(eventFromSnapshot), first, false).dirty).toBe(false);
    expect(reconcileDeletedEvent(committed, saved.events.map(eventFromSnapshot), first, true).dirty).toBe(true);
  });

  it("cannot manufacture a persisted deletion for a never-saved or missing identity", () => {
    const saved = fixture();
    expect(() => deletionCommand(saved, { ...emptyTryoutDraft(), clientKey: "local" }, op)).toThrow("Reload");
    expect(() => deletionCommand(saved, { ...eventFromSnapshot(saved.events[0]), id: "missing" }, op)).toThrow("Reload");
  });

  it("keeps normal page Save on the unchanged contract with a complete ordered draft", () => {
    const saved = fixture();
    const events = saved.events.map(eventFromSnapshot);
    events[0].headline = "  Updated  ";
    const command = pageCommand(saved.revision, tryoutsPageToDraft(saved.page), true, events, op);
    expect(command.kind).toBe("page");
    expect(command.request.events[0].headline).toBe("Updated");
    expect(command.request.events[0].id).toBe(first);
    expect(command.request.deletedIds).toEqual([]);
    expect(command.request.page).toEqual({ intro_with_tryouts: "Saved intro", intro_no_tryouts: "Saved empty" });
    expect(tryoutsPageSaveSchema.safeParse(command.request).success).toBe(true);
  });
});
