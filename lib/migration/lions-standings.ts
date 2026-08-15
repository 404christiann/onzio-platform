// Single source of truth for Lions FC's league table.
//
// Extracted from scripts/seed-lions-standings-local.ts so the loopback seeder
// and the production seeder cannot drift apart. That drift is not
// hypothetical: this session found local and hosted staging already carrying
// different Lions content (media_assets 11 vs 21, shop_kit_photos 3 vs 4)
// because later work landed on one and not the other. Two copies of nine
// hand-maintained rows would go the same way.
//
// The numbers are real Spring 2026 Ohio Valley Division data.
import { deterministicUuid } from "@/lib/migration/rose-city-plan";

export type LionsStandingRow = {
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goal_difference: number;
  points: number;
  is_club: boolean;
};

/**
 * Updated 2026-08-15 to match what Christian had already set through
 * /admin/standings on production. The previous values ("League standings" /
 * "Ohio Valley Division" / "Current table for Lions Football Club's 2026
 * campaign.") were inherited from the original hardcoded
 * EditorialStandingsTable copy and were stale: the league is the Ohio/Indy
 * Conference, which is also the name consistent with the table below
 * containing Indy Gladiators SC.
 *
 * CONSUMED BY THE LOOPBACK SEEDER ONLY. The production seeder deliberately
 * does not import this block at all: writing club-editable copy from a script
 * reverts the club's own admin edits on every run, which is exactly what
 * happened on the first production seed. Production heading copy is owned by
 * /admin/standings. These values are kept in step with what the club
 * publishes so a fresh local database looks like production, not because
 * anything hosted reads them.
 */
export const LIONS_STANDINGS_SETTINGS = {
  eyebrow: "2026 Spring Season",
  title: "Ohio/Indy Conference Standings",
  intro: "League standings and team statistics for the 2026 Spring season.",
} as const;

/**
 * In the league's published order. `sort_order` is the array index, and
 * EditorialStandingsTable renders by `sort_order` rather than re-deriving
 * positions: the three 5-point sides are separated by the league's own
 * criteria, not by goal difference, so recomputing would reorder them wrongly.
 *
 * NOTE on Manu Ledesma Academy: 4 wins and 2 draws is 14 points under 3-1-0,
 * but the published table shows 8. Every other row's arithmetic is exact.
 * This is carried across verbatim from the original hardcoded component data
 * rather than "corrected", because an unexplained 6-point delta is far more
 * likely to be a real league points deduction than an arithmetic slip in an
 * otherwise consistent table — and silently rewriting a customer's published
 * league position would be worse than reproducing it. Flagged for Christian
 * 2026-08-15; if it is a typo, fix it here and both seeders pick it up.
 * Either way the position is unchanged: at 14 points it would still sit below
 * Indy Gladiators on goal difference (9 vs 10).
 */
export const LIONS_STANDINGS: readonly LionsStandingRow[] = [
  { team_name: "Lions Football Club", played: 10, wins: 7, draws: 3, losses: 0, goal_difference: 21, points: 24, is_club: true },
  { team_name: "Leal United FC", played: 10, wins: 5, draws: 4, losses: 1, goal_difference: 11, points: 19, is_club: false },
  { team_name: "Columbus Astray", played: 10, wins: 6, draws: 1, losses: 3, goal_difference: 7, points: 19, is_club: false },
  { team_name: "Fut Ohio SC", played: 10, wins: 4, draws: 5, losses: 1, goal_difference: 27, points: 17, is_club: false },
  { team_name: "Indy Gladiators SC", played: 10, wins: 3, draws: 5, losses: 2, goal_difference: 10, points: 14, is_club: false },
  { team_name: "Manu Ledesma Academy", played: 10, wins: 4, draws: 2, losses: 4, goal_difference: 9, points: 8, is_club: false },
  { team_name: "Ohio International FC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -30, points: 5, is_club: false },
  { team_name: "Lightning SC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -27, points: 5, is_club: false },
  { team_name: "Mahoning Trumbull United SC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -28, points: 5, is_club: false },
];

export function teamSeedSlug(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Derived from the team name, not the tenant, so the same team carries the
 * same id on local, staging and production. That is what makes a re-run an
 * upsert instead of a duplicate — and it is why renaming a team creates a new
 * row and strands the old one, which the seeders handle by pruning any row
 * for this club that is not in the current set.
 */
export function lionsStandingRowId(teamName: string): string {
  return deterministicUuid(`onzio:lions:standing:${teamSeedSlug(teamName)}`);
}
