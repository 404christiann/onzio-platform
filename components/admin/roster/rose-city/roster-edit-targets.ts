import type { MouseEvent as ReactMouseEvent } from "react";
import { editTarget, editTargetRowId, resolveEditTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import { editTargetHitAt } from "@/components/admin/ui/editor-kit/editTargets";
import type { PlayerSectionId } from "./RosterPlayerFields";

/**
 * Click-to-field for the Rose City Roster (UI-PREVIEW-CLICK-ROSTER). The ids are declared in EDIT_TARGET_REGISTRY
 * (`roseCityRoster`, lib/edit-targets/roster.ts): the sections are the player dialog's sections and every field is keyed by
 * the player's row uuid. RosterPlayerCard stamps these ids on its own elements (it is admin markup, not a public component, so
 * they are written straight onto the nodes), and RosterPlayerFields / RosterStatsSection stamp the same ids on the dialog's controls.
 */
export type RosterField =
  | "photo" | "name" | "number" | "position" | "nationality" | "pronunciation"
  | "height" | "weight" | "age" | "hometown" | "foot" | "captain"
  | "school" | "previousClub" | "bio"
  | "goals" | "assists" | "tackles" | "offsides" | "fouls" | "foulsSuffered" | "starts" | "yellow" | "red" | "mins" | "goalsAgainst" | "saves" | "cleanSheets"
  | "visible";

/** The dialog section each field lives in. A click opens that section, not always Basics. */
export const ROSTER_FIELD_SECTION: Readonly<Record<RosterField, PlayerSectionId>> = {
  photo: "basics", name: "basics", number: "basics", position: "basics", nationality: "basics", pronunciation: "basics",
  height: "details", weight: "details", age: "details", hometown: "details", foot: "details", captain: "details",
  school: "background", previousClub: "background", bio: "background",
  goals: "stats", assists: "stats", tackles: "stats", offsides: "stats", fouls: "stats", foulsSuffered: "stats", starts: "stats",
  yellow: "stats", red: "stats", mins: "stats", goalsAgainst: "stats", saves: "stats", cleanSheets: "stats",
  visible: "visibility",
};

export const rosterTarget = (playerId: string, field: RosterField): EditTargetId => editTarget("roseCityRoster", ROSTER_FIELD_SECTION[field], field, playerId);

/** The stat field for a season-stats key (`fouls_suffered` -> `foulsSuffered`). */
export const statField = (key: string): RosterField => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) as RosterField;

/** The stat a card's strip label shows: the label is constant per stat, so the strip matches by it, never by position. Unknown label: not editable here. */
const CARD_STAT_FIELD: Readonly<Record<string, RosterField>> = {
  Goals: "goals", Assists: "assists", Saves: "saves", "Clean sheets": "cleanSheets", Mins: "mins",
};
export const cardStatField = (label: string): RosterField | null => CARD_STAT_FIELD[label] ?? null;

/**
 * The dialog section a declared target opens, or undefined (no target, another editor's, or another player's: the dialog
 * opens on Basics with nothing focused, as the Edit button does).
 */
export function rosterSectionOf(target: string | undefined, playerId: string): PlayerSectionId | undefined {
  const resolved = resolveEditTarget(target);
  if (!resolved || resolved.editor !== "roseCityRoster" || resolved.row !== editTargetRowId(playerId)) return undefined;
  return resolved.section as PlayerSectionId;
}

/** The player's own field under a viewport point inside its card, or null. Fields of any other player are ignored. */
export function rosterFieldAt(card: HTMLElement, playerId: string, x: number, y: number) {
  const hit = editTargetHitAt(card, x, y);
  return hit && rosterSectionOf(hit.id, playerId) ? hit : null;
}

/** The target a pointer click opens: only a real pointer click (detail > 0) picks a field; Enter and Space (detail 0) open the player as before. */
export function clickTarget(event: Pick<ReactMouseEvent<HTMLElement>, "detail" | "clientX" | "clientY" | "currentTarget">, playerId: string): EditTargetId | undefined {
  if (event.detail <= 0) return undefined;
  const card = event.currentTarget.closest<HTMLElement>("[data-player-id]");
  return card ? rosterFieldAt(card, playerId, event.clientX, event.clientY)?.id : undefined;
}

/** The hover outline is moved directly (no React state), so moving the mouse never re-renders the cards. */
export function showFieldHover(card: HTMLElement, playerId: string, x: number, y: number) {
  const outline = card.querySelector<HTMLElement>(":scope > [data-field-hover]");
  if (!outline) return;
  const hit = rosterFieldAt(card, playerId, x, y);
  if (!hit) { hideFieldHover(card); return; }
  const box = card.getBoundingClientRect();
  outline.style.left = `${hit.rect.left - box.left - card.clientLeft}px`;
  outline.style.top = `${hit.rect.top - box.top - card.clientTop}px`;
  outline.style.width = `${hit.rect.width}px`;
  outline.style.height = `${hit.rect.height}px`;
  outline.dataset.target = hit.id;
  outline.hidden = false;
}

export function hideFieldHover(card: HTMLElement) {
  const outline = card.querySelector<HTMLElement>(":scope > [data-field-hover]");
  if (outline) { outline.hidden = true; delete outline.dataset.target; }
}
