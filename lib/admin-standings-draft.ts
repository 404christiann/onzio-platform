import type { DBLeagueStandingRow, DBLeagueStandingsSettings } from "@/lib/db-types";
import { DEFAULT_STANDINGS_SETTINGS, teamAbbreviation } from "@/lib/standings-content";

export type StandingDraftRow = DBLeagueStandingRow & { isNew?: boolean };
export type StandingsDraft = { settings: DBLeagueStandingsSettings; rows: StandingDraftRow[] };
type Payload = Record<string, unknown>;
export type StandingsStep = {
  table: "league_standings" | "league_standings_settings";
  operation: "upsert" | "insert" | "delete";
  payload?: Payload[];
  ids?: string[];
};
export type StandingsCommand = {
  submitted: StandingsDraft;
  confirmed: StandingsDraft;
  steps: StandingsStep[];
  cursor: number;
  uncertain: boolean;
  droppedLogos: string[];
};

export function standingsDraftKey(draft: StandingsDraft): string {
  return JSON.stringify({
    settings: [draft.settings.eyebrow, draft.settings.title, draft.settings.intro],
    rows: draft.rows.map((row) => [
      row.id, row.team_name, row.team_abbreviation, row.logo_url,
      row.played, row.wins, row.draws, row.losses, row.goal_difference, row.points, row.is_club,
    ]),
  });
}

export function newStandingRow(index: number): StandingDraftRow {
  return {
    id: crypto.randomUUID(), team_name: "", team_abbreviation: "", logo_url: null,
    played: 0, wins: 0, draws: 0, losses: 0, goal_difference: 0, points: 0,
    is_club: false, sort_order: index, created_at: "", updated_at: "", isNew: true,
  };
}

export function prepareStandingsCommand(
  draft: StandingsDraft,
  original: StandingsDraft,
  seasonId: string,
  droppedLogos: readonly string[],
  now = new Date().toISOString(),
): StandingsCommand {
  // Stable IDs belong to this immutable save, including sample/default rows.
  // A lost insert response can be confirmed by ID without inserting a second team.
  const submitted = structuredClone(draft);
  const settings = {
    ...submitted.settings, id: 1,
    eyebrow: submitted.settings.eyebrow.trim() || DEFAULT_STANDINGS_SETTINGS.eyebrow,
    title: submitted.settings.title.trim(), intro: submitted.settings.intro.trim(), updated_at: now,
  };
  const rows = submitted.rows.filter((row) => row.team_name.trim()).map((row, index) => ({
    id: row.id.startsWith("default-") || row.id.startsWith("draft-") ? crypto.randomUUID() : row.id,
    season_id: seasonId,
    team_name: row.team_name.trim(),
    team_abbreviation: row.team_abbreviation?.trim().toUpperCase() || teamAbbreviation(row.team_name),
    logo_url: row.is_club ? null : row.logo_url,
    played: Math.max(0, Number(row.played) || 0), wins: Math.max(0, Number(row.wins) || 0),
    draws: Math.max(0, Number(row.draws) || 0), losses: Math.max(0, Number(row.losses) || 0),
    goal_difference: Number(row.goal_difference) || 0, points: Math.max(0, Number(row.points) || 0),
    is_club: row.is_club, sort_order: index, updated_at: now,
    created_at: row.created_at,
  }));
  const persisted = (row: StandingDraftRow) => !row.isNew && !row.id.startsWith("default-") && !row.id.startsWith("draft-");
  const existingIds = new Set(submitted.rows.filter(persisted).map((row) => row.id));
  const deletedIds = original.rows.filter(persisted).map((row) => row.id).filter((id) => !existingIds.has(id));
  const originalById = new Map(submitted.rows.filter(persisted).map((row) => [row.id, row]));
  const payload = rows.map(({ created_at, ...row }) => row);
  const existing = payload.filter((row) => originalById.has(row.id));
  const added = payload.filter((row) => !originalById.has(row.id));
  const steps: StandingsStep[] = [{ table: "league_standings_settings", operation: "upsert", payload: [settings] }];
  if (deletedIds.length) steps.push({ table: "league_standings", operation: "delete", ids: deletedIds });
  if (existing.length) steps.push({ table: "league_standings", operation: "upsert", payload: existing });
  if (added.length) steps.push({ table: "league_standings", operation: "insert", payload: added });
  return {
    submitted, confirmed: { settings, rows }, steps, cursor: 0, uncertain: false,
    droppedLogos: [...new Set(droppedLogos)],
  };
}

export function reconcileStandingsDraft(
  current: StandingsDraft,
  command: StandingsCommand,
  fresh: StandingsDraft,
): StandingsDraft {
  if (standingsDraftKey(current) === standingsDraftKey(command.submitted)) return structuredClone(fresh);
  const submittedRows = command.submitted.rows.filter((row) => row.team_name.trim());
  const idMap = new Map(submittedRows.map((row, i) => [row.id, command.confirmed.rows[i]?.id ?? row.id]));
  return {
    ...current,
    rows: current.rows.map((row) => {
      const id = idMap.get(row.id) ?? row.id;
      const confirmed = fresh.rows.find((item) => item.id === id);
      return confirmed ? { ...row, id, isNew: false, created_at: confirmed.created_at } : row;
    }),
  };
}

export function insertedRowsMatch(step: StandingsStep, rows: Record<string, unknown>[], clubId?: string): "missing" | "confirmed" | "conflict" {
  const payload = step.payload ?? [];
  if (!rows.length) return "missing";
  if (rows.length !== payload.length) return "conflict";
  return payload.every((expected) => {
    const actual = rows.find((row) => row.id === expected.id);
    return actual && (!clubId || actual.club_id === clubId) && Object.entries(expected).every(([key, value]) =>
      // Media references may resolve their published URL on reads; all authored
      // scalar values and identity still have to agree before confirming an insert.
      key === "updated_at" ? Date.parse(String(actual[key])) === Date.parse(String(value)) : actual[key] === value,
    );
  }) ? "confirmed" : "conflict";
}
