"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/admin-client";
import { saveSeasonTotals } from "@/lib/season-totals-save";
import { FIELD_STAT_DEFAULTS, KEEPER_STAT_DEFAULTS } from "./rose-city-roster-save";

export type RosterSeason = { id: string; label: string; start_year: number; end_year: number; active: boolean };

/**
 * One player's season totals for the dialog's Season stats section. It lives in the dialog, not in the section,
 * because the kit dialog mounts only the open section. It reads and writes exactly what the classic editor's
 * SeasonStatsPanel does (same tables, same saveSeasonTotals call); Save player writes it together with the player.
 */
export function useRosterSeasonStats({ playerId, keeper }: { playerId: string | undefined; keeper: boolean }) {
  const [seasons, setSeasons] = useState<RosterSeason[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(Boolean(playerId));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [inSeason, setInSeason] = useState(false);
  const version = useRef(0);
  const keeperRef = useRef(keeper);
  keeperRef.current = keeper;

  const loadStats = useCallback(async (id: string, seasonId: string) => {
    version.current += 1;
    const defaults = keeperRef.current ? KEEPER_STAT_DEFAULTS : FIELD_STAT_DEFAULTS;
    const table = keeperRef.current ? "goalkeeper_season_totals" : "player_season_totals";
    const { data, error: problem } = await createClient().from(table).select(Object.keys(defaults).join(","))
      .eq("player_id", id).eq("season_id", seasonId).maybeSingle();
    if (problem) {
      setError(problem.message);
      setStats({ ...defaults });
      setInSeason(false);
      return;
    }
    setStats(data ? { ...defaults, ...(data as unknown as Record<string, number>) } : { ...defaults });
    setInSeason(Boolean(data));
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!playerId) return;
    let live = true;
    (async () => {
      const { data, error: problem } = await createClient().from("seasons").select("*").order("start_year", { ascending: false });
      if (!live) return;
      if (problem) { setError(problem.message); setLoading(false); return; }
      const list = (data ?? []) as RosterSeason[];
      setSeasons(list);
      const active = list.find(season => season.active) ?? list[0];
      if (active) { setSelectedId(active.id); await loadStats(playerId, active.id); }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [playerId, loadStats]);

  async function changeSeason(seasonId: string) {
    if (!playerId) return;
    setSelectedId(seasonId);
    setLoading(true);
    await loadStats(playerId, seasonId);
    setLoading(false);
  }

  function setStat(key: string, value: number) {
    version.current += 1;
    setStats(current => ({ ...current, [key]: value }));
    setDirty(true);
  }

  /** Saves the typed totals. Returns false (with the message in `error`) when they were not saved. */
  async function save(): Promise<boolean> {
    if (!playerId) return true;
    setError(null);
    const submitted = version.current;
    try {
      const problem = await saveSeasonTotals(createClient(), selectedId, [
        { playerId, name: "This player", keeper, typed: stats, inSeason },
      ]);
      if (problem) { setError(problem); return false; }
      if (version.current === submitted) { setInSeason(true); setDirty(false); }
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Season stats were not saved.");
      return false;
    }
  }

  return { seasons, selectedId, stats, loading, error, dirty, setStat, changeSeason, save };
}

export type RosterSeasonStats = ReturnType<typeof useRosterSeasonStats>;
