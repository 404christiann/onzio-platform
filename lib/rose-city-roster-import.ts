/** Local-only rehearsal plan. No database or storage side effects. */
export type RosterRow = Record<string, string | number | boolean | null>;
export type RoseCityRosterSource = {
  version: number;
  clubId: string;
  sourceProject: string;
  players: RosterRow[];
  seasons: RosterRow[];
  fieldStats: RosterRow[];
  goalkeeperStats: RosterRow[];
  photos: RosterRow[];
  media: RosterRow[];
};

export function buildRoseCityRosterImport(source: RoseCityRosterSource, localOrigin: string, seasonId: string) {
  const endpoint = new URL(localOrigin);
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.port !== "55321") throw new Error("Expected isolated local API.");
  if (source.version !== 1 || source.clubId !== "32ceba0b-4e25-52c2-bb6b-d82fb87637a7") throw new Error("Unexpected roster source.");
  const lists = [source.players, source.seasons, source.fieldStats, source.goalkeeperStats, source.photos, source.media];
  if (lists.some((rows) => !Array.isArray(rows) || rows.some((row) => row.club_id !== source.clubId))) throw new Error("Cross-tenant roster source.");
  if (source.players.length !== 33 || source.players.filter((p) => p.active === true).length !== 27 || new Set(source.players.map((p) => p.id)).size !== 33) throw new Error("Expected 33 profiles and 27 active players.");
  if (source.seasons.length !== 1 || source.seasons[0].label !== "2025–26" || source.fieldStats.length !== 30 || source.goalkeeperStats.length !== 3 || source.photos.length !== 2 || source.media.length !== 41) throw new Error("Unexpected historical roster or media counts.");
  const oldId = source.seasons[0].id;
  const playersById = new Map(source.players.map((player) => [player.id, player]));
  if (source.players.some((player) => !["Goalkeeper", "Defender", "Midfielder", "Forward"].includes(String(player.position)) || typeof player.active !== "boolean")) throw new Error("Invalid player position or active status.");
  if (new Set([...source.fieldStats, ...source.goalkeeperStats].map((row) => row.player_id)).size !== 33) throw new Error("Duplicate or missing historical player membership.");
  for (const [rows, goalkeeper] of [[source.fieldStats, false], [source.goalkeeperStats, true]] as const) {
    for (const row of rows) {
      const player = playersById.get(row.player_id);
      if (row.season_id !== oldId || !player || (player.position === "Goalkeeper") !== goalkeeper) throw new Error("Historical stats relationship mismatch.");
    }
  }
  const mediaById = new Map(source.media.map((asset) => [asset.id, asset]));
  if (mediaById.size !== 41) throw new Error("Duplicate media identity.");
  for (const asset of source.media) {
    if (asset.status !== "published" || asset.deleted_at !== null || asset.storage_bucket !== "onzio-media" || !/^[0-9a-f]{64}$/.test(String(asset.checksum_sha256)) || !["roster", "flags"].includes(String(asset.surface))) throw new Error("Invalid published roster media.");
    const pattern = new RegExp(`^${source.clubId}/(roster|flags)/[0-9a-f-]{36}\\.(webp|png|jpg|jpeg)$`);
    if (!pattern.test(String(asset.storage_path))) throw new Error("Invalid roster media path.");
  }
  function url(assetId: RosterRow[string]) {
    const media = mediaById.get(assetId);
    if (!media) throw new Error("Missing player photo asset.");
    return `${endpoint.origin}/storage/v1/object/public/onzio-media/${media.storage_path}`;
  }
  const profiles: RosterRow[] = source.players.map((player) => ({ ...player, photo_url: url(player.photo_asset_id) }));
  const photos: RosterRow[] = source.photos.map((photo) => {
    if (!playersById.has(photo.player_id)) throw new Error("Unknown action-photo player.");
    return { ...photo, url: url(photo.media_asset_id) };
  });
  const active = profiles.filter((player) => player.active === true);
  const fieldPlayers = active.filter((player) => player.position !== "Goalkeeper");
  const goalkeepers = active.filter((player) => player.position === "Goalkeeper");
  if (fieldPlayers.length !== 24 || goalkeepers.length !== 3) throw new Error("Unexpected active position counts.");
  const common = { club_id: source.clubId, season_id: seasonId, starts: 0, mins: 0, yellow: 0, red: 0 };
  return {
    profiles, photos,
    history: {
      seasons: source.seasons.map((season) => ({ ...season, active: false })),
      fieldStats: source.fieldStats.map((row) => ({ ...row })),
      goalkeeperStats: source.goalkeeperStats.map((row) => ({ ...row })),
    },
    season: { id: seasonId, club_id: source.clubId, label: "2027", start_year: 2027, end_year: 2027, active: true },
    fieldStats: fieldPlayers.map((player) => ({ ...common, player_id: player.id, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0 })),
    goalkeeperStats: goalkeepers.map((player) => ({ ...common, player_id: player.id, goals_against: 0, saves: 0, clean_sheets: 0 })),
  };
}
