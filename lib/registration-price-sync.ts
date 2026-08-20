/**
 * Gives every persisted price a collision-free temporary position before a
 * form builder changes final positions. Removed prices remain as inactive
 * historical rows so registrations retain their foreign-key reference.
 */
export function planRegistrationPricePositionSync(
  historicalIds: readonly string[],
  retainedIds: ReadonlySet<string>,
) {
  const stage = historicalIds.map((id, index) => ({ id, position: 1_000_000 + index }));
  const deactivate = historicalIds
    .filter((id) => !retainedIds.has(id))
    .map((id, index) => ({ id, position: 1_100_000 + index }));
  return { stage, deactivate };
}
