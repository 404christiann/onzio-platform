"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";
import { loadSeasonGames, saveSeasonTotals, type SeasonGames } from "@/lib/season-totals-save";
import type { StatsPlayer } from "../types";
import { StatsPlayerDialog } from "./StatsPlayerDialog";
import { StatsTables, StatsTablesSkeleton } from "./StatsTables";
import { changedSince, dirtyPlayers, keepEditsOver, seasonRowsFromData, seasonSaveInput, versionsFrom, type SeasonRow, type SeasonRows, type Versions } from "./stats-model";
import type { RoseCityStatsViewProps } from "./types";
import styles from "./rose-city-stats.module.css";

type Scope = { kind: "season"; id: string } | { kind: "view"; view: "match" };

/**
 * A season's totals: the match stats added up plus what is added by hand. The load and the save are the
 * classic Season stats editor's; the only addition is one read of the season's saved matches, so the dialog
 * can show how a typed total splits.
 */
export function RoseCitySeasonStats({ seasonState, onViewChange, controlsRef, onSavingChange, onSaveStateChange, onFailureChange }: RoseCityStatsViewProps) {
  const { seasons, activeSeasonId, selectedSeasonId, setSelectedSeasonId, loading: seasonsLoading } = seasonState;
  const [players, setPlayers] = useState<StatsPlayer[]>([]);
  const [stats, setStats] = useState<SeasonRows>({});
  const [baselineStats, setBaselineStats] = useState<SeasonRows>({});
  const [games, setGames] = useState<SeasonGames | null>(null);
  /** When each player's hand-added numbers last changed, as loaded. Null once unknown (a refresh after a save failed): the next save then skips the check. */
  const [versions, setVersions] = useState<Versions | null>({});
  const [loading, setLoading] = useState(true);
  const [loadedSeasonId, setLoadedSeasonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasonRowIds, setSeasonRowIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const saveLock = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const dirtyIds = useMemo(() => dirtyPlayers(players, stats, baselineStats), [players, stats, baselineStats]);
  const hasChanges = dirtyIds.size > 0;
  const statsPending = seasonsLoading || loading || Boolean(selectedSeasonId && loadedSeasonId !== selectedSeasonId);

  /** The season as saved now: who is shown, their totals, the added-up games and when each hand-added row last changed. */
  async function fetchSeason(seasonId: string) {
    const supabase = createClient();
    const [playersResult, fieldResult, keeperResult, seasonGames, fieldAdjustments, keeperAdjustments] = await Promise.all([
      supabase.from("players").select("id, number, name, position, active").order("number"),
      supabase.from("player_season_totals").select("*").eq("season_id", seasonId),
      supabase.from("goalkeeper_season_totals").select("*").eq("season_id", seasonId),
      loadSeasonGames(supabase, seasonId),
      supabase.from("player_season_adjustments").select("player_id, updated_at").eq("season_id", seasonId),
      supabase.from("goalkeeper_season_adjustments").select("player_id, updated_at").eq("season_id", seasonId),
    ]);
    const queryError = playersResult.error ?? fieldResult.error ?? keeperResult.error ?? fieldAdjustments.error ?? keeperAdjustments.error;
    if (queryError) throw new Error(queryError.message);
    const fieldRows = (fieldResult.data ?? []) as Record<string, unknown>[];
    const keeperRows = (keeperResult.data ?? []) as Record<string, unknown>[];
    const inSeason = new Set([...fieldRows.map(row => row.player_id as string), ...keeperRows.map(row => row.player_id as string)]);
    const isActiveSeason = seasonId === activeSeasonId;
    const shown = ((playersResult.data ?? []) as (StatsPlayer & { active: boolean })[])
      .filter(player => inSeason.has(player.id) || (isActiveSeason && player.active))
      .map(({ active: _active, ...player }) => player);
    return {
      shown, inSeason, games: seasonGames, rows: seasonRowsFromData(shown, fieldRows, keeperRows),
      versions: versionsFrom((fieldAdjustments.data ?? []) as Record<string, unknown>[], (keeperAdjustments.data ?? []) as Record<string, unknown>[]),
    };
  }

  useEffect(() => {
    if (!selectedSeasonId) {
      if (!seasonsLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSeason(selectedSeasonId).then(season => {
      if (cancelled) return;
      setLoadedSeasonId(selectedSeasonId);
      setPlayers(season.shown); setStats(season.rows); setBaselineStats(season.rows); setSeasonRowIds(season.inSeason);
      setGames(season.games); setVersions(season.versions); setLoading(false);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setLoadedSeasonId(selectedSeasonId); setPlayers([]); setStats({}); setGames(null); setLoading(false);
      setError(loadError instanceof Error ? loadError.message : "Failed to load season stats");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSeason only reads the ids below
  }, [activeSeasonId, selectedSeasonId, seasonsLoading]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  const setFailure = onFailureChange;

  function changeRow(playerId: string, row: Record<string, number | boolean>) {
    if (saving || saveLock.current || statsPending) return;
    setStats(previous => ({ ...previous, [playerId]: row as SeasonRow }));
    setFailure(null);
  }
  function openDialog(playerId: string, event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setEditing(playerId);
  }
  function closeDialog() {
    setEditing(null);
    const target = opener.current;
    if (target) setTimeout(() => { if (target.isConnected && target.offsetParent) target.focus(); }, 0);
  }

  async function handleSave(): Promise<boolean> {
    if (statsPending || saving || saveLock.current || !hasChanges || !selectedSeasonId) return false;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    let wrote = false;
    try {
      if (versions) {
        const latest = await readVersions(selectedSeasonId).catch((checkError: unknown) => { throw new Error(checkError instanceof Error ? `Could not check for newer changes: ${checkError.message}` : "Could not check for newer changes. Your changes are still here."); });
        if (changedSince(dirtyIds, versions, latest).length > 0) {
          setFailure({ kind: "conflict", message: `Someone changed these season totals after you opened this page. Load the latest numbers and keep your edits, or reload the saved numbers.` });
          return false;
        }
      }
      wrote = true;
      const { entries, join } = seasonSaveInput(players, stats, dirtyIds, seasonRowIds);
      const problem = await saveSeasonTotals(createClient(), selectedSeasonId, entries, join);
      if (problem) {
        setFailure({ kind: "error", message: problem });
        // The field and keeper writes are separate: one may have landed and moved its rows' `updated_at`. Learn the versions as they are now, or Try again would call our own partial write a conflict.
        readVersions(selectedSeasonId).then(setVersions, () => setVersions(null));
        return false;
      }
      setSeasonRowIds(new Set(players.map(player => player.id)));
      setBaselineStats(stats);
      setFailure(null);
      // The save moved the written rows' `updated_at`; learn the new ones so the next save does not mistake this one for someone else's.
      readVersions(selectedSeasonId).then(setVersions, () => setVersions(null));
      return true;
    } catch (saveError: unknown) {
      if (wrote) readVersions(selectedSeasonId).then(setVersions, () => setVersions(null));
      setFailure({ kind: "error", message: saveError instanceof Error ? saveError.message : "Failed to save season stats. Your changes are still here." });
      return false;
    } finally { saveLock.current = false; setSaving(false); }
  }

  async function readVersions(seasonId: string): Promise<Versions> {
    const supabase = createClient();
    const [field, keeper] = await Promise.all([
      supabase.from("player_season_adjustments").select("player_id, updated_at").eq("season_id", seasonId),
      supabase.from("goalkeeper_season_adjustments").select("player_id, updated_at").eq("season_id", seasonId),
    ]);
    const queryError = field.error ?? keeper.error;
    if (queryError) throw new Error(queryError.message);
    return versionsFrom((field.data ?? []) as Record<string, unknown>[], (keeper.data ?? []) as Record<string, unknown>[]);
  }

  /** Conflict resolution: take the saved totals as the new base. With keepEdits the players the person edited keep their edit. */
  async function loadLatest(keepEdits: boolean) {
    if (!selectedSeasonId || saving || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const season = await fetchSeason(selectedSeasonId);
      setPlayers(season.shown);
      setStats(keepEdits ? keepEditsOver(season.shown, season.rows, stats, baselineStats) : season.rows);
      setBaselineStats(season.rows); setSeasonRowIds(season.inSeason); setGames(season.games); setVersions(season.versions);
      setError(null);
      setFailure(null);
    } catch (loadError: unknown) {
      setFailure({ kind: "conflict", message: loadError instanceof Error ? `Could not load the latest numbers: ${loadError.message}` : "Could not load the latest numbers." });
    } finally { saveLock.current = false; setSaving(false); }
  }

  function applyScope(next: Scope) {
    setError(null);
    setFailure(null);
    if (next.kind === "season") setSelectedSeasonId(next.id);
    else onViewChange(next.view);
  }
  function requestScope(next: Scope) {
    if (saving || saveLock.current || (next.kind === "season" && next.id === selectedSeasonId)) return;
    const target = next.kind === "season" ? seasons.find(season => season.id === next.id)?.label ?? "another season" : "Match stats";
    requestNavigation({ kind: "switch", label: target, continue: () => applyScope(next) });
  }
  const save = useSaveState({ isDirty: !statsPending && hasChanges && Boolean(selectedSeasonId), onSave: async () => { if (!(await handleSave())) throw new Error("Season totals were not saved"); } });
  const seasonLabel = seasons.find(season => season.id === selectedSeasonId)?.label ?? "this season";
  const requestNavigation = useUnsavedGuard({ dirty: hasChanges, edited: `season totals for ${seasonLabel}`, onSave: handleSave, onDiscard: () => { setStats(baselineStats); setFailure(null); } });
  useImperativeHandle(controlsRef, () => ({
    changeSeason: (id: string) => requestScope({ kind: "season", id }),
    changeView: () => requestScope({ kind: "view", view: "match" }),
    save: () => { void save.save().catch(() => undefined); },
    discard: () => { setStats(baselineStats); setError(null); setFailure(null); },
    loadLatest: (keepEdits: boolean) => { void loadLatest(keepEdits); },
  }));
  useEffect(() => { onSaveStateChange(save.state); }, [save.state, onSaveStateChange]);
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);

  const editingPlayer = players.find(player => player.id === editing) ?? null;

  return <div className="flex min-w-0 flex-col gap-6">
    {error && <p role="alert" className={styles.error}>Error: {error}</p>}
    <div className={styles.bar}>
      <p className={styles.intro}>These season totals appear on the public roster. They add up from match stats; change a total to add the rest by hand.</p>
      {statsPending ? <AdminSkeletonRegion label="Loading player count"><Skeleton className="h-4 w-16" /></AdminSkeletonRegion> : <span className={styles.status}>{players.length} player{players.length === 1 ? "" : "s"}</span>}
    </div>
    {statsPending ? <StatsTablesSkeleton label="Loading season stats" /> : !selectedSeasonId ? <p className={styles.empty}>Create a season before editing season stats.</p>
      : error && players.length === 0 ? null : players.length === 0 ? <p className={styles.empty}>No players are assigned to this season.</p>
      : <StatsTables key={selectedSeasonId} mode="season" players={players} values={stats} dirtyIds={dirtyIds} disabled={saving} onEdit={openDialog} />}
    <StatsPlayerDialog mode="season" player={editingPlayer} open={editingPlayer !== null} row={editingPlayer ? stats[editingPlayer.id] as unknown as Record<string, number | boolean> : undefined}
      context={`${seasonLabel} season`} games={games} returnFocusRef={opener} onClose={closeDialog} onChange={changeRow} />
  </div>;
}
