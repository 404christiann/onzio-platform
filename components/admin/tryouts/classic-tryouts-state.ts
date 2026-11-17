import type { DBTryout, DBTryoutsPageContent } from "@/lib/db-types";
import type { PublicRegistrationForm } from "@/lib/registration-public";
import { buildTryoutMutationPayload, buildTryoutsPageMutationPayload, tryoutToDraft,
  type TryoutDraft, type TryoutsPageDraft } from "@/lib/tryout-admin";
import type { TryoutsPageSaveRequest } from "@/lib/tryouts-page-editor/contract";

export type EventDraft = TryoutDraft & {
  clientKey: string;
  signUp?: Pick<DBTryout, "hidden" | "stays_open_after_date" | "sign_up_by_contact">;
};
export type TryoutsSnapshot = {
  revision: string;
  page: Partial<DBTryoutsPageContent>;
  events: DBTryout[];
  registrationForms?: Record<string, PublicRegistrationForm>;
  operation?: { status: "committed" | "not-committed"; receipt?: TryoutsSnapshot };
};
export type TryoutsCommand =
  | { kind: "page"; request: TryoutsPageSaveRequest }
  | { kind: "delete"; key: string; request: TryoutsPageSaveRequest };

export function eventFromSnapshot(row: DBTryout): EventDraft {
  return { ...tryoutToDraft(row), clientKey: row.id, signUp: {
    hidden: row.hidden === true,
    stays_open_after_date: row.stays_open_after_date === true,
    sign_up_by_contact: row.sign_up_by_contact === true,
  } };
}

export function orderedEvents(events: EventDraft[]): EventDraft[] {
  return events.map((event, sortOrder) => ({ ...event, sortOrder }));
}

export function pageCommand(
  revision: string, page: TryoutsPageDraft, pageDirty: boolean,
  events: EventDraft[], operationId: string,
): TryoutsCommand {
  return { kind: "page", request: {
    operationId, expectedRevision: revision,
    page: pageDirty ? buildTryoutsPageMutationPayload(page) as Exclude<TryoutsPageSaveRequest["page"], null> : null,
    events: events.map((event, sort_order) => ({
      ...buildTryoutMutationPayload({ ...event, sortOrder: sort_order }), id: event.id, sort_order,
    })) as TryoutsPageSaveRequest["events"],
    deletedIds: [],
  } };
}

export function deletionCommand(
  saved: TryoutsSnapshot, event: EventDraft, operationId: string,
): Extract<TryoutsCommand, { kind: "delete" }> {
  if (!event.id || !saved.events.some((row) => row.id === event.id)) {
    throw new Error("Reload the saved event before deleting it.");
  }
  return { kind: "delete", key: event.clientKey, request: {
    operationId, expectedRevision: saved.revision, page: null,
    events: saved.events.filter((row) => row.id !== event.id).map((row, sort_order) => ({
      id: row.id, program_id: row.program_id, status: row.status as TryoutDraft["status"],
      eyebrow: row.eyebrow, headline: row.headline, intro: row.intro,
      hero_media_asset_id: row.hero_media_asset_id,
      eligibility_copy: row.eligibility_copy, what_to_expect_copy: row.what_to_expect_copy,
      preparation_copy: row.preparation_copy, event_date: row.event_date,
      location: row.location, cost_text: row.cost_text, cta_label: row.cta_label,
      registration_href: row.registration_href, registration_form_id: row.registration_form_id,
      closed_message: row.closed_message, sort_order,
    })),
    deletedIds: [event.id],
  } };
}

function sameDraft(left: EventDraft, right: EventDraft) {
  return (Object.keys(left) as (keyof EventDraft)[])
    .filter((key) => key !== "clientKey" && key !== "heroMediaPreviewUrl" && key !== "signUp")
    .every((key) => left[key] === right[key]);
}

export function reconcileDeletedEvent(
  saved: TryoutsSnapshot, current: EventDraft[], key: string, pageDirty: boolean,
): { events: EventDraft[]; dirty: boolean } {
  const events = orderedEvents(current.filter((event) => event.clientKey !== key));
  const baseline = saved.events.map(eventFromSnapshot);
  return { events, dirty: pageDirty || events.length !== baseline.length ||
    events.some((event, index) => !sameDraft(event, baseline[index])) };
}
