// ADMIN-RE-11c: season totals are the season's player numbers added up plus an
// adjustment. Browser fixtures that type totals into *_season_stats call this
// afterwards so the totals stay what they typed, the way the migration kept
// production's totals: adjustment = typed - games.

const FIELD = ["goals", "assists", "tackles", "starts", "yellow", "red", "mins", "offsides", "fouls", "fouls_suffered"];
const KEEPER = ["goals_against", "saves", "clean_sheets", "starts", "yellow", "red", "mins"];

function statement(kind: "player" | "goalkeeper", keys: readonly string[]): string {
  const sums = keys
    .map((key) => (key === "starts" ? "(count(*) filter (where ms.starts))::integer as starts" : `coalesce(sum(ms.${key}), 0)::integer as ${key}`))
    .join(", ");
  return `insert into onzio.${kind}_season_adjustments (club_id, player_id, season_id, ${keys.join(", ")})
    select s.club_id, s.player_id, s.season_id, ${keys.map((key) => `s.${key} - g.${key}`).join(", ")}
    from onzio.${kind}_season_stats s
    cross join lateral (
      select ${sums}
      from onzio.${kind}_match_stats ms
      join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
      where ms.club_id = s.club_id and ms.player_id = s.player_id and m.season_id = s.season_id
    ) g
    where s.club_id = $1::uuid and s.player_id = any($2::uuid[])
    on conflict (club_id, player_id, season_id) do update set ${keys.map((key) => `${key} = excluded.${key}`).join(", ")}`;
}

export const KEEP_TYPED_TOTALS_SQL = [statement("player", FIELD), statement("goalkeeper", KEEPER)] as const;
