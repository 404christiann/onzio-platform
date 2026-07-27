import type { MatchLogRow } from "@/lib/queries";
import type { FieldStats, GoalkeeperStats } from "@/lib/data";

export { coerceRating } from "@/lib/db-utils";

export type RadarData = {
  labels:  string[];
  player:  number[];
  posAvg:  number[];
};

function norm(val: number, max: number): number {
  return Math.round(Math.min(100, (val / Math.max(max, 1)) * 100));
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function discipline(yellow: number, red: number): number {
  return Math.max(0, 100 - yellow * 15 - red * 30);
}

/**
 * Returns true when at least `min` rows have a non-null rating.
 * Gates the scatter plot — only render once there is enough data.
 */
export function hasEnoughRatings(rows: MatchLogRow[], min = 3): boolean {
  return rows.filter((r) => r.rating !== null).length >= min;
}

/**
 * Normalises a field player's season stats (0–100) relative to their
 * position cohort. Axes: Scoring, Creativity, Defending, Stamina, Discipline.
 */
export function buildFieldRadarData(player: FieldStats, peers: FieldStats[]): RadarData {
  const mxG = Math.max(...peers.map((p) => p.goals),   1);
  const mxA = Math.max(...peers.map((p) => p.assists),  1);
  const mxT = Math.max(...peers.map((p) => p.tackles),  1);
  const mxM = Math.max(...peers.map((p) => p.mins),     1);
  const disc = (p: FieldStats) => discipline(p.yellow, p.red);

  return {
    labels: ["Scoring", "Creativity", "Defending", "Stamina", "Discipline"],
    player: [
      norm(player.goals,   mxG),
      norm(player.assists, mxA),
      norm(player.tackles, mxT),
      norm(player.mins,    mxM),
      disc(player),
    ],
    posAvg: [
      norm(avg(peers.map((p) => p.goals)),   mxG),
      norm(avg(peers.map((p) => p.assists)),  mxA),
      norm(avg(peers.map((p) => p.tackles)),  mxT),
      norm(avg(peers.map((p) => p.mins)),     mxM),
      Math.round(avg(peers.map(disc))),
    ],
  };
}

/**
 * Normalises a goalkeeper's season stats (0–100) relative to their GK cohort.
 * Axes: Reflexes, Clean Sheets, Availability, Discipline, Starts.
 */
export function buildGKRadarData(gk: GoalkeeperStats, peers: GoalkeeperStats[]): RadarData {
  const mxSaves = Math.max(...peers.map((p) => p.saves),       1);
  const mxCS    = Math.max(...peers.map((p) => p.cleanSheets), 1);
  const mxMins  = Math.max(...peers.map((p) => p.mins),        1);
  const mxStart = Math.max(...peers.map((p) => p.starts),      1);
  const disc = (p: GoalkeeperStats) => discipline(p.yellow, p.red);

  return {
    labels: ["Reflexes", "Clean Sheets", "Availability", "Discipline", "Starts"],
    player: [
      norm(gk.saves,       mxSaves),
      norm(gk.cleanSheets, mxCS),
      norm(gk.mins,        mxMins),
      disc(gk),
      norm(gk.starts,      mxStart),
    ],
    posAvg: [
      norm(avg(peers.map((p) => p.saves)),       mxSaves),
      norm(avg(peers.map((p) => p.cleanSheets)), mxCS),
      norm(avg(peers.map((p) => p.mins)),        mxMins),
      Math.round(avg(peers.map(disc))),
      norm(avg(peers.map((p) => p.starts)),      mxStart),
    ],
  };
}
