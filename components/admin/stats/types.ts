import type { Ref } from "react";
import type { useSeasons } from "@/lib/use-seasons";

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

export type StatsView = "match" | "season";
export type StatsEditorControls = { changeSeason: (id: string) => void; changeView: () => void };
export type StatsEditorProps = {
  seasonState: ReturnType<typeof useSeasons>;
  selectedPlayerId: string | null;
  onSelectedPlayerChange: (id: string) => void;
  showPlayerDetail: boolean;
  onShowPlayerDetailChange: (show: boolean) => void;
  selectedMatchId?: string | null;
  onSelectedMatchChange?: (id: string | null) => void;
  onViewChange: (view: StatsView) => void;
  controlsRef: Ref<StatsEditorControls>;
  onSavingChange: (saving: boolean) => void;
};
