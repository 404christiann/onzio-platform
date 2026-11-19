import type { Ref } from "react";
import type { useSeasons } from "@/lib/use-seasons";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import type { StatsEditorControls } from "../types";

export type RoseCityStatsControls = StatsEditorControls & {
  /** Back to the saved numbers. The page asks first when there are unsaved edits. */
  discard: () => void;
};

export type RoseCityStatsViewProps = {
  seasonState: ReturnType<typeof useSeasons>;
  selectedMatchId?: string | null;
  onSelectedMatchChange?: (id: string | null) => void;
  onViewChange: (view: "match" | "season") => void;
  controlsRef: Ref<RoseCityStatsControls>;
  onSavingChange: (saving: boolean) => void;
  onSaveStateChange: (state: SaveState) => void;
  /** True after a save that did not complete, until the next edit or a good save. Drives the Save button's error state. */
  onFailureChange: (failed: boolean) => void;
};
