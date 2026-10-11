export type StatsPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
export const STATS_POSITIONS: StatsPosition[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
export type StatsPlayer = { id: string; number: number; name: string; position: StatsPosition };
export type StatsValue = number | boolean;
export type StatsValues = Record<string, StatsValue>;
export type StatsField = {
  key: string;
  label: string;
  /** Retained input name, after the player's name and colon. */
  ariaLabel: string;
  hint?: string;
  kind?: "number" | "boolean";
  /** Optional existing domain limit; omitted for unrestricted season totals. */
  max?: number;
};
export type StatsFieldGroup = { id: string; label: string; fields: StatsField[] };
