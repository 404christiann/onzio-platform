import { playerAgeError } from "@/lib/roster-player-age";
import type { Player, PlayerForm, Position } from "../roster-model";

/** Goalkeepers first, as the classic admin orders its groups (Christian, 2026-11-19). The public page lists Defenders first; the admin does not. */
export const ROSTER_POSITIONS: readonly Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
export const ROSTER_POSITION_ABBR: Readonly<Record<Position, string>> = { Goalkeeper: "GK", Defender: "DF", Midfielder: "MF", Forward: "FW" };

export type PlayerField = "name" | "number" | "nationality" | "hometown" | "height" | "weight" | "age";
export type PlayerProblems = Partial<Record<PlayerField, string>>;

/** The dialog sections a field lives in, so a problem can point at its section. */
export const FIELD_SECTION: Readonly<Record<PlayerField, "basics" | "details">> = {
  name: "basics", number: "basics", nationality: "basics",
  hometown: "details", height: "details", weight: "details", age: "details",
};

export function playerToForm(player: Player): PlayerForm {
  return {
    number: player.number, name: player.name, caption: player.caption ?? "",
    nationality: player.nationality, position: player.position, height: player.height,
    weight: player.weight, hometown: player.hometown, age: player.age,
    school: player.school ?? "", previous_club: player.previous_club ?? "",
    photo_url: player.photo_url, bio: player.bio ?? "",
    pronunciation: player.pronunciation ?? "", foot: player.foot ?? "",
  };
}

/** The classic editor's checks and messages, in its order. The first one is what the classic editor reports. */
export function validatePlayer(form: PlayerForm): PlayerProblems {
  const problems: PlayerProblems = {};
  if (!form.name.trim()) problems.name = "Enter the player's name.";
  if (!Number.isInteger(form.number) || form.number < 0 || form.number > 99) problems.number = "Use 0 to 99.";
  if (!form.nationality.trim()) problems.nationality = "Nationality is required.";
  if (!form.hometown.trim()) problems.hometown = "Hometown is required.";
  if (!form.height.trim()) problems.height = "Height is required.";
  if (!form.weight.trim()) problems.weight = "Weight is required.";
  const ageError = playerAgeError(form.age);
  if (ageError) problems.age = ageError;
  return problems;
}

const PROBLEM_ORDER: readonly PlayerField[] = ["name", "number", "nationality", "hometown", "height", "weight", "age"];

export function firstProblemField(problems: PlayerProblems): PlayerField | null {
  return PROBLEM_ORDER.find(field => problems[field]) ?? null;
}

export function firstProblem(problems: PlayerProblems): string | null {
  const field = firstProblemField(problems);
  return field ? problems[field] as string : null;
}

/** The row the classic editor writes: the form, the stored photo address, and blank optional text saved as null. */
export function buildPlayerPayload(form: PlayerForm, photoUrl: string) {
  return {
    ...form, photo_url: photoUrl,
    caption: form.caption?.trim() || null,
    school: form.school?.trim() || null,
    previous_club: form.previous_club?.trim() || null,
    bio: form.bio?.trim() || null,
    pronunciation: form.pronunciation?.trim() || null,
    foot: form.foot?.trim() || null,
  };
}

export type RosterFilters = { query: string; position: "All" | Position; status: "all" | "active" | "hidden" };
export const DEFAULT_ROSTER_FILTERS: RosterFilters = { query: "", position: "All", status: "all" };

export function playerMatches(player: Player, filters: RosterFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  return (filters.position === "All" || player.position === filters.position)
    && (filters.status === "all" || (filters.status === "active" ? player.active : !player.active))
    && (!query || player.name.toLowerCase().includes(query) || String(player.number).includes(query));
}

export type RosterGroup = { position: Position; players: Player[] };

/** Groups in ROSTER_POSITIONS order (Goalkeepers first); inside a group, by jersey number then name like the public page. Empty groups are left out. */
export function groupPlayers(players: readonly Player[], filters: RosterFilters = DEFAULT_ROSTER_FILTERS): RosterGroup[] {
  const shown = players.filter(player => playerMatches(player, filters));
  return ROSTER_POSITIONS
    .map(position => ({
      position,
      players: shown.filter(player => player.position === position)
        .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name)),
    }))
    .filter(group => group.players.length > 0);
}

export type SeasonLine = { goals?: number; assists?: number; saves?: number; clean_sheets?: number; mins?: number };

/** The three numbers the public card shows: Goals, Assists, Mins for a field player; Saves, Clean sheets, Mins for a keeper. */
export function cardStats(player: Player, totals: SeasonLine | undefined): Array<[string, number]> {
  const line = totals ?? {};
  return player.position === "Goalkeeper"
    ? [["Saves", line.saves ?? 0], ["Clean sheets", line.clean_sheets ?? 0], ["Mins", line.mins ?? 0]]
    : [["Goals", line.goals ?? 0], ["Assists", line.assists ?? 0], ["Mins", line.mins ?? 0]];
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export const FIELD_STAT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["goals", "Goals"], ["assists", "Assists"], ["tackles", "Tackles"], ["offsides", "Offsides"], ["fouls", "Fouls"],
  ["fouls_suffered", "Fouls Suffered"], ["starts", "Starts"], ["yellow", "Yellow Cards"], ["red", "Red Cards"], ["mins", "Minutes"],
];
export const KEEPER_STAT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["goals_against", "Goals Against"], ["saves", "Saves"], ["clean_sheets", "Clean Sheets"], ["starts", "Starts"],
  ["yellow", "Yellow Cards"], ["red", "Red Cards"], ["mins", "Minutes"],
];
