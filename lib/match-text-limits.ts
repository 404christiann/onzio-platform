// ADMIN-RE-07: the longest text a club can save on a game (break-ui gaps).
// Zod enforces them in lib/admin-data-contract.ts's matchesMutation, and the
// forms cap their inputs at the same numbers, on every write. The database
// holds the same limits (20261109120000_matches_text_and_score_checks.sql,
// ADMIN-RE-07c). Kept apart from the contract so a browser form can read them
// without pulling in Zod.
export const MATCH_TEXT_LIMITS = {
  opponent: 80,
  opponent_short_name: 20,
  venue: 120,
  competition: 80,
  address: 120,
  city: 80,
  state: 40,
} as const;
