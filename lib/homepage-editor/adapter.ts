import { resolveHomepageCapabilities, type HomepageRenderer } from "./capabilities";
import { homepageSaveRequestSchema, type HomepageSaveRequest } from "./contract";
import { getDirtyHomepageSections, type HomepageEditorState } from "./model";
import type { HomepageSnapshot } from "./server";

export type HomepageEditorSnapshot = HomepageSnapshot & {
  design: HomepageRenderer;
  videoSource: string;
  operationId?: string;
};

export function buildHomepageSaveRequest(state: HomepageEditorState, renderer: HomepageRenderer, operationId: string): HomepageSaveRequest {
  const capabilities = resolveHomepageCapabilities(renderer);
  const draft = state.submitted?.snapshot ?? state.draft;
  const sections: HomepageSaveRequest["sections"] = {};
  for (const section of getDirtyHomepageSections({ ...state, draft })) {
    if (!capabilities.editableSections.includes(section)) continue;
    if (section === "hero") {
      sections.hero = Object.fromEntries(capabilities.heroEditableFields.map(field => [field, draft.hero[field]]));
    } else if (section === "photos") {
      sections.photos = {
        ...(capabilities.photoCaptionEditable ? { seasonLabel: draft.photos.seasonLabel } : {}),
        items: draft.photos.items.map(({ clientId, rowId, assetId, alt }, order) => ({ clientId, rowId, assetId, alt, order })),
      };
    } else sections[section] = draft[section] as never;
  }
  return homepageSaveRequestSchema.parse({
    operationId: state.submitted?.operationId ?? operationId,
    expectedRevision: state.baseRevision, designRevision: state.designRevision, sections,
  });
}
