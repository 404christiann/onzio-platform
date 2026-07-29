export function withoutClientTenantIdentity(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const row = { ...value };
  delete row.club_id;
  delete row.clubId;
  return row;
}
