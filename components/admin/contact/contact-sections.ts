import {
  CONTACT_ACTIONS, cinematicContactContentSchema, starterCinematicContactContent,
  type CinematicContactContent, type CinematicContactSave, type CinematicContactSnapshot, type ContactAction,
} from "@/lib/cinematic-contact-content";
import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";

/** The six cards of the Contact editor: the page heading, then the five fixed rows in the order of the public page. */
export type ContactSectionId = "heading" | ContactAction;

const ROW_TITLES: Record<ContactAction, string> = { media: "Media", tryouts: "Tryouts", tickets: "Tickets", information: "Information", partnerships: "Partnerships" };

export const CONTACT_SECTIONS: readonly { id: ContactSectionId; title: string }[] = [
  { id: "heading", title: "Page heading" },
  ...CONTACT_ACTIONS.map(id => ({ id, title: ROW_TITLES[id] })),
];

export const contactSectionTitle = (id: ContactSectionId) => CONTACT_SECTIONS.find(section => section.id === id)!.title;

/** The part of the draft one card edits. The unsaved dot and the summary depend on nothing else. */
export function contactSectionSlice(content: CinematicContactContent, id: ContactSectionId): string {
  if (id === "heading") return JSON.stringify([content.title, content.subtitle]);
  return JSON.stringify(id === "information" ? [content.rows.information, content.informationHref] : [content.rows[id]]);
}

export function changedContactSections(draft: CinematicContactContent, saved: CinematicContactContent | null): ContactSectionId[] {
  const base = saved ?? starterCinematicContactContent();
  return CONTACT_SECTIONS.filter(section => contactSectionSlice(draft, section.id) !== contactSectionSlice(base, section.id)).map(section => section.id);
}

/** One short line under the card title. Information says so while its destination is still blank, as the public page does. */
export function contactSectionSummary(content: CinematicContactContent, id: ContactSectionId): string {
  if (id === "heading") return `${content.title || "No title"} · ${content.subtitle || "No subtitle"}`;
  const row = content.rows[id];
  const line = `${row.prompt || "No row text"} → ${row.action || "No button text"}`;
  return id === "information" && !content.informationHref.trim() ? `${line} · Link pending` : line;
}

/** Field messages, keyed by the field's path in the content ("title", "rows.media.prompt", "informationHref"). They are the zod strings the save has always checked. */
export function contactFieldErrors(draft: CinematicContactContent): Record<string, string> {
  const parsed = cinematicContactContentSchema.safeParse(draft);
  const errors: Record<string, string> = {};
  if (parsed.success) return errors;
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join(".");
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

export function contactSectionOfPath(path: string): ContactSectionId {
  if (path === "title" || path === "subtitle") return "heading";
  if (path === "informationHref") return "information";
  const row = path.split(".")[1];
  return (CONTACT_ACTIONS as readonly string[]).includes(row) ? (row as ContactAction) : "heading";
}

/** The first section, in card order, that has a message. */
export function firstContactErrorSection(errors: Record<string, string>): ContactSectionId | null {
  const bad = new Set(Object.keys(errors).map(contactSectionOfPath));
  return CONTACT_SECTIONS.find(section => bad.has(section.id))?.id ?? null;
}

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildContactSaveInput(args: {
  pending: CinematicContactSave | null; operationId: string; snapshot: Pick<CinematicContactSnapshot, "revision" | "designRevision">; draft: CinematicContactContent;
}) {
  return args.pending ?? { operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, content: args.draft };
}

/** What the Save button shows. A running save wins over every failure. */
export function contactPageState(args: { base: SaveState; busy: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  return derivePageSaveState(args.base, failure);
}
