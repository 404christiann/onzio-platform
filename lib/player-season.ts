export type PlayerPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export function getPlayerSeasonSeed(position: PlayerPosition): {
  table: "player_season_stats" | "goalkeeper_season_stats";
  stats: Record<string, number>;
} {
  if (position === "Goalkeeper") {
    return {
      table: "goalkeeper_season_stats",
      stats: {
        goals_against: 0,
        saves: 0,
        clean_sheets: 0,
        starts: 0,
        yellow: 0,
        red: 0,
        mins: 0,
      },
    };
  }

  return {
    table: "player_season_stats",
    stats: {
      goals: 0,
      assists: 0,
      tackles: 0,
      starts: 0,
      yellow: 0,
      red: 0,
      mins: 0,
      offsides: 0,
      fouls: 0,
      fouls_suffered: 0,
    },
  };
}
