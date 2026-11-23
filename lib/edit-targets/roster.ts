import type { EditTargetRegistry } from "@/lib/admin-edit-targets";

/**
 * Rose City (cinematic@2) Roster player cards (/admin/roster, UI-PREVIEW-CLICK-ROSTER). Sections are the player dialog's
 * section ids (`PlayerSectionId`); every field is a row field keyed by the player's row uuid, because the registry is static and
 * the roster is not (`roseCityRoster.basics.row:<uuid>.name`). Season stats use the dialog's stat keys in camelCase; a field
 * player's dialog shows the field set and a goalkeeper's the keeper set (`goals` / `saves` are never on the same dialog).
 * Action photos are not text on the card, so that section declares nothing. Diverse City's classic Roster is another editor.
 */
export const ROSE_CITY_ROSTER_EDIT_TARGETS: EditTargetRegistry = {
  roseCityRoster: {
    route: "/admin/roster",
    sections: {
      basics: { rowFields: ["photo", "name", "number", "position", "nationality", "pronunciation"] },
      details: { rowFields: ["height", "weight", "age", "hometown", "foot", "captain"] },
      background: { rowFields: ["school", "previousClub", "bio"] },
      stats: {
        rowFields: ["goals", "assists", "tackles", "offsides", "fouls", "foulsSuffered", "starts", "yellow", "red", "mins", "goalsAgainst", "saves", "cleanSheets"],
      },
      photos: {},
      visibility: { rowFields: ["visible"] },
    },
  },
};
