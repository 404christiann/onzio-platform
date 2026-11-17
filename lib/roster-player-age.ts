/** Mirrors the CHECK on onzio.players.age (one adult-and-older squad). */
export const PLAYER_MIN_AGE = 14;
export const PLAYER_MAX_AGE = 80;

/**
 * Returns the message the roster form shows for an age the database would
 * refuse, or null when the age can be saved. Younger players need youth teams,
 * which the platform does not have yet, so the form says so up front instead
 * of failing at save.
 */
export function playerAgeError(age: number): string | null {
  if (!Number.isFinite(age) || age < PLAYER_MIN_AGE) {
    return `Players under ${PLAYER_MIN_AGE} aren't supported yet. The roster is one squad of players aged ${PLAYER_MIN_AGE} to ${PLAYER_MAX_AGE}.`;
  }
  if (age > PLAYER_MAX_AGE) {
    return `Age must be ${PLAYER_MAX_AGE} or younger.`;
  }
  return null;
}
