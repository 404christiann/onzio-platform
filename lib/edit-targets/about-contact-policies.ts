import type { EditTargetRegistry } from "@/lib/admin-edit-targets";

/**
 * Click-to-field targets for Rose City's About, Contact and Policies editors (UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES).
 * Spread into EDIT_TARGET_REGISTRY (lib/admin-edit-targets.ts); this module imports types only, so it cannot form a cycle.
 *
 * about (/admin/about): one editor for both public pages. Sections are SECTIONS ids (hero, story, values, closing on the About
 * page; images, features, colors on the Club Logo page). Story paragraphs are keyed by position (the page draws exactly the
 * paragraphs in the draft). Values, crest features and color cards are keyed by the draft's in-memory card id (`card-<n>`,
 * AboutDraft `_id`): stable while a draft is edited, moved, added to or removed from, new after a save, reload or discard.
 *
 * contact (/admin/contact): sections are CONTACT_SECTIONS ids. The five rows always render, in CONTACT_ACTIONS order. The
 * Information row's destination is the link behind its button, so it has a control and no node of its own.
 *
 * policies (/admin/policies): `page` is the heading card of the page being edited; `row` is every answer row (dialog id
 * `row:<row id>`, a colon, so cards use PreviewCards' ownsTarget). A row's heading is keyed by the row's own id and its answer
 * lines by `<row id>-l<n>` (n is the line's position among the row's lines in the draft).
 */
export const ABOUT_CONTACT_POLICIES_TARGETS: EditTargetRegistry = {
  about: {
    route: "/admin/about",
    sections: {
      hero: { fields: ["heading"] },
      story: { fields: ["image"], rowFields: ["paragraph"] },
      values: { fields: ["heading"], rowFields: ["title", "description"] },
      closing: { fields: ["text", "buttonLabel", "destination"] },
      images: { fields: ["annotated", "map"] },
      features: { rowFields: ["title", "description", "patch", "icon", "iconSize", "iconScale"] },
      colors: { rowFields: ["label", "image"] },
    },
  },
  contact: {
    route: "/admin/contact",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      media: { fields: ["prompt", "action"] },
      tryouts: { fields: ["prompt", "action"] },
      tickets: { fields: ["prompt", "action"] },
      information: { fields: ["prompt", "action", "destination"] },
      partnerships: { fields: ["prompt", "action"] },
    },
  },
  policies: {
    route: "/admin/policies",
    sections: {
      page: { fields: ["title", "subtitle", "heading"] },
      row: { rowFields: ["heading", "line"] },
    },
  },
};
