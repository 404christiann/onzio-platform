import {
  emptyRobinsonContent,
  type RobinsonContent, type RobinsonImageSlot, type RobinsonSaveRequest, type RobinsonSnapshot,
} from "@/lib/cinematic-robinson-content";
import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import { unusedUploads } from "@/lib/cinematic-robinson-editor";

/** The nine page sections, in the fixed order of the public page. Each id is also the key of its `visible` flag in RobinsonContent. */
export type RobinsonSectionId = Exclude<keyof RobinsonContent, "images">;

export const ROBINSON_SECTIONS: readonly { id: RobinsonSectionId; title: string }[] = [
  { id: "heading", title: "Page heading" },
  { id: "seating", title: "Seating map" },
  { id: "story", title: "Story" },
  { id: "info", title: "Stadium Info" },
  { id: "match", title: "Next home match" },
  { id: "lockers", title: "Lockers image" },
  { id: "food", title: "Food & Beverage" },
  { id: "route", title: "Road to the Match" },
  { id: "directions", title: "Directions" },
];

/** Image slots whose picture belongs to each section. */
export const ROBINSON_SECTION_IMAGES: Record<RobinsonSectionId, readonly RobinsonImageSlot[]> = {
  heading: [], seating: ["seating"], story: [], info: [], match: ["partner"], lockers: ["lockers"],
  food: ["mealPass", "step1", "step2", "step3"], route: ["bus", "routeMap"], directions: [],
};

export const robinsonSectionTitle = (id: RobinsonSectionId) => ROBINSON_SECTIONS.find(section => section.id === id)!.title;

/** The one slice of the draft a section's preview and unsaved dot depend on (its fields, flag and pictures). */
export function robinsonSectionSlice(content: RobinsonContent, id: RobinsonSectionId): string {
  return JSON.stringify([content[id], ROBINSON_SECTION_IMAGES[id].map(slot => content.images[slot])]);
}

export function changedRobinsonSections(draft: RobinsonContent, saved: RobinsonContent | null): RobinsonSectionId[] {
  const base = saved ?? emptyRobinsonContent();
  return ROBINSON_SECTIONS.filter(section => robinsonSectionSlice(draft, section.id) !== robinsonSectionSlice(base, section.id)).map(section => section.id);
}

/** The draft with only one section switched on, so the real public page component renders just that section. */
export function robinsonSectionOnly(content: RobinsonContent, id: RobinsonSectionId): RobinsonContent {
  const next = { ...content } as RobinsonContent;
  for (const section of ROBINSON_SECTIONS) (next as Record<string, unknown>)[section.id] = { ...content[section.id], visible: section.id === id };
  return next;
}

export function robinsonSectionSummary(content: RobinsonContent, id: RobinsonSectionId): string {
  switch (id) {
    case "heading": return [content.heading.title, content.heading.subtitle].filter(Boolean).join(" · ") || "No heading";
    case "seating": return content.seating.caption || "No caption";
    case "story": return `${content.story.paragraphs.length} paragraphs${content.story.quote ? ", 1 quote" : ""}`;
    case "info": return `${content.info.rows.length} rows · ${content.info.rows.filter(row => !row.available).length} marked No`;
    case "match": return "Partner logo under the match";
    case "lockers": return "Decorative image";
    case "food": return content.food.heading || "No heading";
    case "route": return content.route.subheading || content.route.heading || "No heading";
    case "directions": return `${content.directions.blocks.length} sections`;
  }
}


/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildRobinsonSaveInput(args: {
  pending: RobinsonSaveRequest | null; operationId: string; snapshot: Pick<RobinsonSnapshot, "revision" | "designRevision">;
  draft: RobinsonContent; uploads: string[];
}) {
  return args.pending ?? {
    operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision,
    content: args.draft, retiredMediaAssetIds: unusedUploads(args.uploads, args.draft),
  };
}

/**
 * What the Save button shows. "Retry same save" and Save both go through useSaveState, so a save that
 * succeeds always passes saving then saved, retried or not. A running save wins over every failure.
 */
export function robinsonPageState(args: { base: SaveState; busy: boolean; uploading: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  const base: SaveState = args.uploading && args.base === "dirty" ? "clean" : args.base;
  return derivePageSaveState(base, failure);
}
