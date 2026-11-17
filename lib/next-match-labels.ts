import type { Fixture } from "@/lib/data";

/**
 * ADMIN-RE-22: the two small labels the academy Next Match card shows under
 * "VS". The competition belongs to the game itself (a league game, a cup tie, a
 * friendly), so a game saved without one shows no competition line. Home or
 * away comes from the same game.
 */
export function nextMatchLabels(fixture: Pick<Fixture, "competition" | "home">): {
  competition: string;
  homeAway: "Home" | "Away";
} {
  return {
    competition: fixture.competition?.trim() ?? "",
    homeAway: fixture.home ? "Home" : "Away",
  };
}
