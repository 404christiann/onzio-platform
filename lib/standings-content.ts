import type {
  DBLeagueStandingRow,
  DBLeagueStandingsSettings,
} from "@/lib/db-types";

export const DEFAULT_STANDINGS_SETTINGS: DBLeagueStandingsSettings = {
  id: 1,
  eyebrow: "League standings",
  title: "UPSL SoCal North",
  intro:
    "Follow Rose City FC through the current league table. Club staff can update every row from the admin portal.",
  updated_at: "",
};

export const DEFAULT_STANDINGS_ROWS: DBLeagueStandingRow[] = [
  {
    id: "default-rose-city",
    team_name: "Rose City FC",
    team_abbreviation: "RC",
    logo_url: null,
    played: 7,
    wins: 5,
    draws: 1,
    losses: 1,
    goal_difference: 12,
    points: 16,
    is_club: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  },
  {
    id: "default-ocelot",
    team_name: "Ocelot FC",
    team_abbreviation: "OC",
    logo_url: null,
    played: 7,
    wins: 4,
    draws: 2,
    losses: 1,
    goal_difference: 7,
    points: 14,
    is_club: false,
    sort_order: 1,
    created_at: "",
    updated_at: "",
  },
  {
    id: "default-la-sol",
    team_name: "LA Sol Athletics",
    team_abbreviation: "LA",
    logo_url: null,
    played: 7,
    wins: 4,
    draws: 0,
    losses: 3,
    goal_difference: 3,
    points: 12,
    is_club: false,
    sort_order: 2,
    created_at: "",
    updated_at: "",
  },
  {
    id: "default-amsg",
    team_name: "AMSG FC",
    team_abbreviation: "AM",
    logo_url: null,
    played: 7,
    wins: 3,
    draws: 2,
    losses: 2,
    goal_difference: 1,
    points: 11,
    is_club: false,
    sort_order: 3,
    created_at: "",
    updated_at: "",
  },
  {
    id: "default-aysd",
    team_name: "AYSD D1",
    team_abbreviation: "AY",
    logo_url: null,
    played: 7,
    wins: 3,
    draws: 1,
    losses: 3,
    goal_difference: -2,
    points: 10,
    is_club: false,
    sort_order: 4,
    created_at: "",
    updated_at: "",
  },
  {
    id: "default-montclair",
    team_name: "Montclair FC",
    team_abbreviation: "MO",
    logo_url: null,
    played: 7,
    wins: 2,
    draws: 2,
    losses: 3,
    goal_difference: -4,
    points: 8,
    is_club: false,
    sort_order: 5,
    created_at: "",
    updated_at: "",
  },
];

export type StandingsTableContent = {
  settings: DBLeagueStandingsSettings;
  rows: DBLeagueStandingRow[];
};

export function teamAbbreviation(name: string, fallback = "FC"): string {
  const cleaned = name.trim();
  if (!cleaned) return fallback;
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function sortStandingsRows(
  rows: readonly DBLeagueStandingRow[],
): DBLeagueStandingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.wins - a.wins ||
      a.sort_order - b.sort_order ||
      a.team_name.localeCompare(b.team_name),
  );
}

export function normalizeStandingsSettings(
  row: DBLeagueStandingsSettings | null,
): DBLeagueStandingsSettings {
  if (!row) return DEFAULT_STANDINGS_SETTINGS;
  return {
    ...row,
    eyebrow: row.eyebrow?.trim() || DEFAULT_STANDINGS_SETTINGS.eyebrow,
    title: row.title?.trim() || DEFAULT_STANDINGS_SETTINGS.title,
    intro: typeof row.intro === "string" ? row.intro : DEFAULT_STANDINGS_SETTINGS.intro,
  };
}

export function normalizeStandingsRows(
  rows: readonly DBLeagueStandingRow[],
): DBLeagueStandingRow[] {
  const normalized = rows.map((row, index) => ({
    ...row,
    team_name: row.team_name.trim() || `Team ${index + 1}`,
    team_abbreviation:
      row.team_abbreviation?.trim().toUpperCase() ||
      teamAbbreviation(row.team_name, `T${index + 1}`),
    played: Math.max(0, Number(row.played) || 0),
    wins: Math.max(0, Number(row.wins) || 0),
    draws: Math.max(0, Number(row.draws) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    goal_difference: Number(row.goal_difference) || 0,
    points: Math.max(0, Number(row.points) || 0),
    sort_order: Number(row.sort_order) || index,
  }));
  return normalized.length > 0 ? sortStandingsRows(normalized) : DEFAULT_STANDINGS_ROWS;
}
