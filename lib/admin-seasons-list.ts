import type { SupabaseClient } from "@supabase/supabase-js";
import { newestSeasonFirst } from "@/lib/season-label";

// RC-ADMIN-4b-seasons: what Rose City's Seasons list shows. The same numbers and the same four delete-guard
// sentences as the classic page (components/admin/ClassicSeasonsPage.tsx), read on the server so the list is
// in the first paint (no loading state, so nothing on the page moves after it loads). Reads use the signed-in
// person's own client and are scoped to the club; nothing here selects a personal detail.

export type SeasonListItem = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  active: boolean;
};

export type SeasonDeleteState = { deletable: boolean; reason: string; matchCount: number; statRowCount: number };

export type SeasonsListData =
  | { status: "error" }
  | { status: "ready"; seasons: SeasonListItem[]; deleteStates: Record<string, SeasonDeleteState> };

/** True when a stat row has any figure other than zero (the ids do not count). */
export function rowHasNonZeroStats(row: Record<string, unknown>): boolean {
  return Object.entries(row).some(
    ([key, value]) => key !== "player_id" && key !== "season_id" && Number(value ?? 0) !== 0,
  );
}

/** The classic page's delete guard: a season is deletable only with no matches and no non-zero stats. */
export function seasonDeleteState(
  matchCount: number,
  fieldRows: readonly Record<string, unknown>[],
  keeperRows: readonly Record<string, unknown>[],
): SeasonDeleteState {
  const statRowCount = fieldRows.length + keeperRows.length;
  if (matchCount > 0) {
    return { deletable: false, reason: "This season has matches and cannot be deleted.", matchCount, statRowCount };
  }
  if (fieldRows.some(rowHasNonZeroStats)) {
    return { deletable: false, reason: "This season has field player stats and cannot be deleted.", matchCount, statRowCount };
  }
  if (keeperRows.some(rowHasNonZeroStats)) {
    return { deletable: false, reason: "This season has goalkeeper stats and cannot be deleted.", matchCount, statRowCount };
  }
  return { deletable: true, reason: "No matches or recorded stats. This season can be deleted.", matchCount, statRowCount };
}

export const FIELD_TOTAL_COLUMNS =
  "player_id, season_id, goals, assists, tackles, offsides, fouls, fouls_suffered, starts, yellow, red, mins";
export const KEEPER_TOTAL_COLUMNS = "player_id, season_id, goals_against, saves, clean_sheets, starts, yellow, red, mins";

/** Newest first, with Fall ahead of Spring of the same year, so "Create next season" follows the latest one. */
export function sortSeasonList<T extends SeasonListItem & { created_at?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    newestSeasonFirst(
      { label: a.label, start_year: a.start_year, end_year: a.end_year, created_at: a.created_at ?? "" },
      { label: b.label, start_year: b.start_year, end_year: b.end_year, created_at: b.created_at ?? "" },
    ),
  );
}

type SeasonRow = SeasonListItem & { created_at: string };

export async function loadSeasonsList(supabase: SupabaseClient, clubId: string): Promise<SeasonsListData> {
  try {
    const onzio = supabase.schema("onzio");
    const seasonsResult = await onzio
      .from("seasons")
      .select("id,label,start_year,end_year,active,created_at")
      .eq("club_id", clubId);
    if (seasonsResult.error) return { status: "error" };

    const rows = sortSeasonList((seasonsResult.data ?? []) as SeasonRow[]);
    const states = await Promise.all(
      rows.map(async (season) => {
        const [matches, field, keepers] = await Promise.all([
          onzio.from("matches").select("id", { count: "exact", head: true }).eq("club_id", clubId).eq("season_id", season.id),
          onzio.from("player_season_totals").select(FIELD_TOTAL_COLUMNS).eq("club_id", clubId).eq("season_id", season.id),
          onzio.from("goalkeeper_season_totals").select(KEEPER_TOTAL_COLUMNS).eq("club_id", clubId).eq("season_id", season.id),
        ]);
        if (matches.error || field.error || keepers.error) throw new Error("seasons guard");
        return [
          season.id,
          seasonDeleteState(
            matches.count ?? 0,
            (field.data ?? []) as unknown as Record<string, unknown>[],
            (keepers.data ?? []) as unknown as Record<string, unknown>[],
          ),
        ] as const;
      }),
    );
    return {
      status: "ready",
      seasons: rows.map(({ id, label, start_year, end_year, active }) => ({ id, label, start_year, end_year, active })),
      deleteStates: Object.fromEntries(states),
    };
  } catch {
    return { status: "error" };
  }
}
