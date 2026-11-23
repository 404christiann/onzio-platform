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

import { SCHEDULE_EDIT_TARGETS } from "@/lib/edit-targets/schedule";
import { ROSE_CITY_ROSTER_EDIT_TARGETS } from "@/lib/edit-targets/roster";
import { ABOUT_CONTACT_POLICIES_TARGETS } from "./edit-targets/about-contact-policies";

export const EDIT_TARGET_ATTRIBUTE = "data-edit-target";
export const EDIT_TARGET_SELECTOR = `[${EDIT_TARGET_ATTRIBUTE}]`;

/** A declared target id. Build one with `editTarget()`; never write the string by hand. */
export type EditTargetId = string & { readonly __editTarget: unique symbol };

export type EditTargetSection = {
  /** The section's name as the editor shows it (Homepage Overview: the part button, dialog section and part list). */
  label?: string;
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
  ...ABOUT_CONTACT_POLICIES_TARGETS,
  /**
   * Rose City (cinematic@2) Homepage Overview. Sections are the Overview's part ids, in page order, and each `label` is that
   * part's name everywhere (components/admin/homepage/homepage-parts.ts reads it; no part title is written anywhere else).
   */
  homepage: {
    route: "/admin/homepage",
    sections: {
      menu: { label: "Menu and footer" },
      hero: { label: "Top of the page", fields: ["eyebrow", "intro", "headlineLineOne", "headlineLineTwo", "primaryCtaLabel", "secondaryCtaLabel"] },
      raffle: { label: "Raffle", fields: ["imageAlt"] },
      match: { label: "Next home match", fields: ["heading", "buttonLabel", "emptyMessage"] },
      prices: { label: "Ticket prices", fields: ["heading", "footnote"], rowFields: ["label", "price", "description", "note"] },
      ticket: { label: "Ticket and map", fields: ["imageAlt"] },
      photos: { label: "Photo slideshow" },
      championship: { label: "Championship", fields: ["league", "year", "title", "body", "imageAlt"] },
      video: { label: "Behind the Rose video", fields: ["eyebrow", "title", "description"] },
      sponsors: { label: "Partners strip", fields: ["heading"] },
      forms: { label: "External forms" },
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
  /**
   * Rose City (cinematic@2) Foothill Transit (/admin/foothill-transit). Sections are FOOTHILL_SECTIONS ids. Benefits are keyed by
   * position; page sections by their stable id (`<sectionId>` for heading, body and note, `<sectionId>-b<n>` for bullets).
   * The Phone map card edits only a layout choice and crop numbers, none of which is text on the page, so it declares nothing.
   */
  foothill: {
    route: "/admin/foothill-transit",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      images: { fields: ["busImageAlt", "mapImageAlt"] },
      map: {},
      match: { fields: ["partnerImageAlt"] },
      benefits: { fields: ["heading", "footnote"], rowFields: ["title", "detail"] },
      sections: { rowFields: ["heading", "body", "note", "bullet"] },
    },
  },
  /** Rose City (cinematic@2) Chick-fil-A (/admin/chick-fil-a). Sections are CHICK_FIL_A_CARDS ids; the three steps are keyed by position. */
  chickFilA: {
    route: "/admin/chick-fil-a",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      details: { fields: ["heading", "body", "mealPassImageAlt"] },
      steps: { rowFields: ["label", "number", "iconAlt"] },
      map: { fields: ["imageAlt"] },
      match: { fields: ["partnerImageAlt"] },
      restaurant: { fields: ["imageAlt"] },
      background: { fields: ["imageAlt"] },
    },
  },
  /** Rose City (cinematic@2) Tickets (/admin/tickets). Sections are TICKETS_SECTIONS ids; perks and benefits are keyed by position. */
  tickets: {
    route: "/admin/tickets",
    sections: {
      page: { fields: ["title", "subtitle", "purchaseUrl", "missingPurchaseLabel", "bannerImageAlt", "partnerImageAlt"] },
      perks: { fields: ["heading"], rowFields: ["label"] },
      includes: { fields: ["heading", "footnote"], rowFields: ["title", "detail"] },
      transit: { fields: ["heading", "subtitle", "busImageAlt", "mapImageAlt"] },
      directions: { fields: ["directionsHeading", "directionsBody", "parkingHeading", "parkingBody", "parkingNote"] },
    },
  },
  /**
   * Rose City (cinematic@2) Season Ticket Membership (/admin/season-membership). Sections are SEASON_SECTIONS ids. Price rows
   * and benefits are keyed by the row's stable id; the three price columns and the intro's two string lists by position
   * (`row:<n>.column`, `row:<n>.highlight`, `row:<n>.include`).
   */
  seasonMembership: {
    route: "/admin/season-membership",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      intro: { fields: ["text", "includesHeading"], rowFields: ["highlight", "include"] },
      pricing: { fields: ["sectionLabel", "footnote"], rowFields: ["column", "name", "price0", "price1", "price2", "badgeAlt"] },
      button: { fields: ["label", "href"] },
      benefits: { fields: ["heading"], rowFields: ["label", "iconAlt"] },
      closing: { fields: ["heading", "ticketImageAlt"] },
    },
  },
  /** Rose City (cinematic@2) Know Before You Go (/admin/know-before-you-go). Sections are KBYG_SECTIONS ids; match-day tiles are keyed by the tile's stable id. */
  knowBeforeYouGo: {
    route: "/admin/know-before-you-go",
    sections: {
      heading: { fields: ["title", "subtitle"] },
      match: { fields: ["competition", "watchLabel", "watchHref", "youtubeImageAlt"] },
      facts: { rowFields: ["label", "iconAlt"] },
      raffle: { fields: ["heading", "subheading", "imageAlt", "body"] },
      donor: { fields: ["heading", "name", "imageAlt", "body", "buttonLabel", "buttonHref"] },
    },
  },
  /**
   * Rose City (cinematic@2) Partners (/admin/partners). The dialog ids are `page:partners`, `page:opportunities` and
   * `partner:<uuid>`; a target id cannot contain a colon, so the two pages are the sections `partners` and `opportunities`
   * and every partner is the one section `partner` with its fields keyed by the partner's row uuid
   * (`partners.partner.row:<uuid>.name`): the registry is static, a partner's section id is not.
   */
  partners: {
    route: "/admin/partners",
    sections: {
      partners: { fields: ["title", "subtitle", "intro", "ctaPrompt", "ctaLabel"] },
      opportunities: { fields: ["title", "subtitle", "intro", "ctaPrompt", "ctaLabel", "ctaHref"] },
      partner: { rowFields: ["name", "role", "logo", "tone"] },
    },
  },
  /**
   * Rose City (cinematic@2) Injury Report (/admin/injury-report). `presenter` and `rehab` are the page-part cards; every
   * injury is the one section `entry` (dialog id `entry:<uuid>`) with its fields keyed by the entry's row uuid. The player's
   * name, number, position and photo belong to Roster and declare nothing.
   */
  injuryReport: {
    route: "/admin/injury-report",
    sections: {
      presenter: { fields: ["name", "logo"] },
      rehab: { fields: ["band", "bandAlt", "heading", "quote", "quoteAttribution", "videoUrl"] },
      entry: { rowFields: ["injury", "timeline", "note"] },
    },
  },
  /**
   * Rose City (cinematic@2) News (/admin/news). Sections are NEWS_SECTIONS ids (the dialog edits one article at a time);
   * every field is keyed by the article's id (a saved article's uuid, or `new-N` for an unsaved one), because the registry is
   * static and the article is not. The article's card on the page shows its card heading, title, cover photo and category band;
   * the other fields (date, subtitle, photo description, article text, button) are only on the article page.
   */
  news: {
    route: "/admin/news",
    sections: {
      details: { rowFields: ["category", "cardHeading", "publishedLocal", "title", "subtitle"] },
      photo: { rowFields: ["cover", "coverAlt"] },
      article: { rowFields: ["body", "actionLabel", "actionHref"] },
    },
  },
  /**
   * Rose City (cinematic@2) Sponsors (/admin/sponsors). The one section is the homepage carousel card (`carousel`, the sponsor
   * place id); each sponsor's fields are keyed by its stable draft key (a saved sponsor's uuid, or the key a new upload gets).
   * The strip draws only the logo pictures: the name is the picture's description and the website is its link, so those two
   * have a control and no node on the preview. The strip's heading is the Homepage's (`homepage.sponsors.heading`).
   */
  sponsors: {
    route: "/admin/sponsors",
    sections: {
      carousel: { rowFields: ["name", "website", "logo"] },
    },
  },
  /**
   * Shop (/admin/shop): Rose City (cinematic@2, the kit EditorDialog) and Diverse City (classic, AdminDialog) share the one
   * editor id because the fields and ids are the same data. Sections are RoseCityShopFields' ShopSectionId values; Diverse City's
   * one dialog per region uses `kitText` (kit text) and `purchase`. The dialog edits one kit at a time, so every kit field is keyed
   * by the kit (`home`, `away`, `third`); jersey options are keyed by their kit too (option i is kit i). Detail cards and Jersey
   * details tiles and size chart measurements are keyed by position (a measurement's `value<n>` is its cell under size n), because the dialog and the public page both list every one of them in order.
   * The kit photos and the photo row declare nothing: they hold photos only, so a click on them opens the list as it always has.
   */
  shop: {
    route: "/admin/shop",
    sections: {
      editions: { fields: ["heading"], rowFields: ["label", "price", "line", "link"] },
      kitText: { rowFields: ["eyebrow", "title", "description", "bullets", "storeNote", "buttonLabel", "buyLink"] },
      purchase: { fields: ["heading", "footerLabel", "footerText", "buttonLabel", "buttonLink"], rowFields: ["label", "title", "body", "icon"] },
      details: { fields: ["heading"], rowFields: ["photoAlt", "title", "text"] },
      care: { fields: ["care"] },
      sizes: { fields: ["heading", "sizes", "note"], rowFields: ["label", "value0", "value1", "value2", "value3", "value4", "value5", "value6", "value7"] },
      map: { fields: ["visible", "heading", "description", "wholeImage", "crop"] },
      partners: { fields: ["visible", "heading"] },
      labels: { fields: ["homeLabel", "awayLabel", "photoRowLabel", "emptyMessage", "imageWidth", "imageTop"] },
    },
  },
  ...SCHEDULE_EDIT_TARGETS,
  ...ROSE_CITY_ROSTER_EDIT_TARGETS,
};

const shared = createEditTargets(EDIT_TARGET_REGISTRY);
export const resolveEditTarget = shared.resolve;
export const editTarget = shared.target;
export const allEditTargets = shared.all;

/** Spread onto a control or a preview node: `<input {...editTargetProps(id)} />`. */
export function editTargetProps(id: EditTargetId | null | undefined): { [EDIT_TARGET_ATTRIBUTE]?: string } {
  return id ? { [EDIT_TARGET_ATTRIBUTE]: id } : {};
}
