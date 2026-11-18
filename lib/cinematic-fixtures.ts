// Moved from the retired editorial helper (lib/editorial-fixtures.ts) for cinematic@2.
import type { Fixture } from "@/lib/data";

/**
 * Pure fixture-outcome helper, kept in its own non-JSX module so contract
 * tests can import and exercise it directly.
 */

export type MatchOutcome = "W" | "L" | "D";

/** The club's own result vs the opponent, independent of home/away side. */
export function outcomeForFixture(fixture: Fixture): MatchOutcome | null {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  if (fixture.roseCityScore > fixture.opponentScore) return "W";
  if (fixture.roseCityScore < fixture.opponentScore) return "L";
  return "D";
}
