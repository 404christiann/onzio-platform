/**
 * Click-to-field targets for the classic admin's live previews (UI-PREVIEW-TARGETS).
 *
 * One id names one editable field: `editor.section.field`, or `editor.section.row:<rowId>.field` for a field on a
 * list row. The same id is stamped (`data-edit-target`) on the field's control in the editor dialog and, in the admin
 * preview only, on the public node that shows it. A click on that node opens the dialog on `section` and focuses the
 * control. Every id is declared in EDIT_TARGET_REGISTRY below, the one place that maps a target to its route, dialog
 * section and field; `editTarget()` throws for anything not declared, so a stamp can never point at nothing.
 *
 * Pure module: no React, no DOM. The DOM half lives in components/admin/ui/editor-kit/editTargets.ts.
 */

export const EDIT_TARGET_ATTRIBUTE = "data-edit-target";
export const EDIT_TARGET_SELECTOR = `[${EDIT_TARGET_ATTRIBUTE}]`;

/** A declared target id. Build one with `editTarget()`; never write the string by hand. */
export type EditTargetId = string & { readonly __editTarget: unique symbol };

export type EditTargetSection = {
  /** Fields that appear once in the section. */
  fields?: readonly string[];
  /** Fields that appear on every row of a list in the section (`row:<rowId>.<field>`). */
  rowFields?: readonly string[];
};

export type EditTargetEditor = {
  /** The admin route the editor lives on. */
  route: string;
  /** Dialog section ids (the ids `useEditorDialog().openSection` takes) and their fields. */
  sections: Readonly<Record<string, EditTargetSection>>;
};

export type EditTargetRegistry = Readonly<Record<string, EditTargetEditor>>;

export type ParsedEditTarget = { editor: string; section: string; field: string; row?: string };
export type ResolvedEditTarget = ParsedEditTarget & { id: EditTargetId; route: string };

const SEGMENT = /^[a-z][a-zA-Z0-9-]*$/;
const ROW_ID = /^[A-Za-z0-9_-]+$/;
const ROW_PREFIX = "row:";

/** Splits an id into its parts, or null when it is not shaped like a target. Does not check the registry. */
export function parseEditTarget(id: string): ParsedEditTarget | null {
  const parts = id.split(".");
  if (parts.length === 3) {
    const [editor, section, field] = parts;
    return [editor, section, field].every(part => SEGMENT.test(part)) ? { editor, section, field } : null;
  }
  if (parts.length === 4) {
    const [editor, section, rowPart, field] = parts;
    if (![editor, section, field].every(part => SEGMENT.test(part)) || !rowPart.startsWith(ROW_PREFIX)) return null;
    const row = rowPart.slice(ROW_PREFIX.length);
    return ROW_ID.test(row) ? { editor, section, field, row } : null;
  }
  return null;
}

/** Turns any row key (a uuid, a draft key, a list index) into a row id the target grammar accepts. */
export function editTargetRowId(key: string | number): string {
  const text = String(key).replace(/[^A-Za-z0-9_-]/g, "_");
  return text.length ? text : "_";
}

export function createEditTargets(registry: EditTargetRegistry) {
  function lookup(parsed: ParsedEditTarget) {
    const editor = registry[parsed.editor];
    const section = editor && Object.hasOwn(editor.sections, parsed.section) ? editor.sections[parsed.section] : undefined;
    if (!editor || !section) return null;
    const declared = parsed.row === undefined ? section.fields : section.rowFields;
    return declared?.includes(parsed.field) ? editor : null;
  }

  /** The declared target, or null for an id that is malformed or not in the registry. */
  function resolve(id: string | null | undefined): ResolvedEditTarget | null {
    if (!id) return null;
    const parsed = parseEditTarget(id);
    const editor = parsed && lookup(parsed);
    return parsed && editor ? { ...parsed, id: id as EditTargetId, route: editor.route } : null;
  }

  /**
   * Builds a declared id. Throws for a target the registry does not declare, so a control or preview node stamped
   * with a typo fails its render test instead of silently doing nothing in the browser.
   */
  function target(editor: string, section: string, field: string, row?: string | number): EditTargetId {
    const id = row === undefined ? `${editor}.${section}.${field}` : `${editor}.${section}.${ROW_PREFIX}${editTargetRowId(row)}.${field}`;
    if (!resolve(id)) throw new Error(`Unknown edit target "${id}": declare it in EDIT_TARGET_REGISTRY (lib/admin-edit-targets.ts).`);
    return id as EditTargetId;
  }

  /** Every single-field id the registry declares (row fields need a row id, so they are listed per section instead). */
  function all(): EditTargetId[] {
    return Object.entries(registry).flatMap(([editor, spec]) =>
      Object.entries(spec.sections).flatMap(([section, fields]) =>
        (fields.fields ?? []).map(field => `${editor}.${section}.${field}` as EditTargetId)));
  }

  return { registry, resolve, target, all };
}

/**
 * The registry. Each rollout PR (C onwards) adds its editor here, stamps the same ids on its controls and preview
 * nodes, and adds a render test that every declared field has a stamped control.
 */
export const EDIT_TARGET_REGISTRY: EditTargetRegistry = {
  /** Rose City (cinematic@2) Homepage Overview. Sections are the Overview's part ids (components/admin/homepage/homepage-parts.ts). */
  homepage: {
    route: "/admin/homepage",
    sections: {
      hero: { fields: ["eyebrow", "intro", "headlineLineOne", "headlineLineTwo", "primaryCtaLabel", "secondaryCtaLabel"] },
      raffle: { fields: ["imageAlt"] },
      match: { fields: ["heading", "buttonLabel", "emptyMessage"] },
      prices: { fields: ["heading", "footnote"], rowFields: ["label", "price", "description", "note"] },
      ticket: { fields: ["imageAlt"] },
      championship: { fields: ["league", "year", "title", "body", "imageAlt"] },
      video: { fields: ["eyebrow", "title", "description"] },
      sponsors: { fields: ["heading"] },
    },
  },
  /**
   * Rose City (cinematic@2) Robinson Stadium (/admin/stadium). Sections are ROBINSON_SECTIONS ids. List rows are keyed
   * by position (story paragraphs, info rows, food steps) or, for Directions, by the block's stable id
   * (`<blockId>` for its heading, note and closing line, `<blockId>-p<n>` and `<blockId>-b<n>` for its paragraphs and bullets).
   */
  robinson: {
    route: "/admin/stadium",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      seating: { fields: ["imageAlt", "caption", "expandLabel"] },
      story: { fields: ["quote", "attribution"], rowFields: ["paragraph"] },
      info: { fields: ["heading", "note"], rowFields: ["label", "value"] },
      match: { fields: ["partnerImageAlt"] },
      lockers: { fields: ["imageAlt"] },
      food: { fields: ["heading", "body", "mealPassImageAlt"], rowFields: ["label", "iconAlt"] },
      route: { fields: ["heading", "subheading", "busImageAlt", "mapImageAlt"] },
      directions: { rowFields: ["heading", "note", "closing", "paragraph", "bullet"] },
    },
  },
};

const shared = createEditTargets(EDIT_TARGET_REGISTRY);
export const resolveEditTarget = shared.resolve;
export const editTarget = shared.target;
export const allEditTargets = shared.all;

/** Spread onto a control or a preview node: `<input {...editTargetProps(id)} />`. */
export function editTargetProps(id: EditTargetId | null | undefined): { [EDIT_TARGET_ATTRIBUTE]?: string } {
  return id ? { [EDIT_TARGET_ATTRIBUTE]: id } : {};
}
