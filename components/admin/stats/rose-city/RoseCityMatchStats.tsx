"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent } from "react";
import { IconCaretDown as AdminSelectChevron } from "@/components/admin/icons";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { createClient } from "@/lib/admin-client";
import type { StatsPlayer } from "../types";
import { StatsPlayerDialog } from "./StatsPlayerDialog";
import { StatsTables, StatsTablesSkeleton } from "./StatsTables";
import { buildMatchSaveRows, changedSince, dirtyPlayers, keepEditsOver, matchRowsFromData, versionsFrom, type MatchRow, type MatchRows, type Versions } from "./stats-model";
import type { RoseCityStatsViewProps } from "./types";
import styles from "./rose-city-stats.module.css";

type Match = { id: string; date: string; time: string; opponent: string; home: boolean; season_id: string };
type PendingScope = { kind: "season"; id: string } | { kind: "match"; id: string | null } | { kind: "view"; view: "season" };

const describeMatch = (match: Match) => `${match.date} · ${match.home ? "vs" : "@"} ${match.opponent}`;

/** One match, one row per player. The load and the save are the classic Match stats editor's, query for query. */
export function RoseCityMatchStats({ seasonState, selectedMatchId, onSelectedMatchChange, onViewChange, controlsRef, onSavingChange, onSaveStateChange, onFailureChange }: RoseCityStatsViewProps) {
  const { selectedSeasonId, setSelectedSeasonId, loading: seasonsLoading } = seasonState;
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [playersLoadFailed, setPlayersLoadFailed] = useState(false);
  const [statsLoadFailed, setStatsLoadFailed] = useState(false);
  const [loadedPlayersSeasonId, setLoadedPlayersSeasonId] = useState<string | null>(null);
  const [loadedMatchId, setLoadedMatchId] = useState<string | null>(null);
  const [players, setPlayers] = useState<StatsPlayer[]>([]);
  const selectedMatch = selectedMatchId ?? null;
  const [stats, setStats] = useState<MatchRows>({});
  const [baselineStats, setBaselineStats] = useState<MatchRows>({});
  /** When each player's saved row last changed, as loaded. Null once unknown (a refresh after a save failed): the next save then skips the check. */
  const [versions, setVersions] = useState<Versions | null>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const saveLock = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const dirtyIds = useMemo(() => dirtyPlayers(players, stats, baselineStats), [players, stats, baselineStats]);
  const hasChanges = dirtyIds.size > 0;
  const playersPending = seasonsLoading || Boolean(selectedSeasonId && loadedPlayersSeasonId !== selectedSeasonId);
  const matchBelongsToSeason = matches.some(match => match.id === selectedMatch && match.season_id === selectedSeasonId);
  const statsPending = Boolean(selectedMatch && matchBelongsToSeason && (playersPending || loading || loadedMatchId !== selectedMatch));
  const statsReady = Boolean(selectedMatch && matchBelongsToSeason && !statsPending && !statsLoadFailed);

  useEffect(() => {
    let cancelled = false;
    createClient().from("matches").select("id, date, time, opponent, home, season_id").order("date").order("time")
      .then(({ data, error: matchesQueryError }) => {
        if (cancelled) return;
        setMatchesLoading(false);
        if (matchesQueryError) { setMatchesError(matchesQueryError.message); return; }
        setMatches((data ?? []) as Match[]);
      }, (loadError: unknown) => {
        if (cancelled) return;
        setMatchesError(loadError instanceof Error ? loadError.message : "Failed to load matches");
        setMatchesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Season-stat rows define who is in the season, so players who left stay editable on old matches.
  useEffect(() => {
    if (!selectedSeasonId) { setPlayers([]); return; }
    let cancelled = false;
    setError(null);
    setPlayersLoadFailed(false);
    const supabase = createClient();
    Promise.all([
      supabase.from("players").select("id, number, name, position").order("number"),
      supabase.from("player_season_stats").select("player_id").eq("season_id", selectedSeasonId),
      supabase.from("goalkeeper_season_stats").select("player_id").eq("season_id", selectedSeasonId),
    ]).then(([playersResult, fieldResult, keeperResult]) => {
      if (cancelled) return;
      setLoadedPlayersSeasonId(selectedSeasonId);
      const queryError = playersResult.error ?? fieldResult.error ?? keeperResult.error;
      if (queryError) { setPlayersLoadFailed(true); setError(queryError.message); setPlayers([]); return; }
      const inSeason = new Set([
        ...(fieldResult.data ?? []).map((row: { player_id: string }) => row.player_id),
        ...(keeperResult.data ?? []).map((row: { player_id: string }) => row.player_id),
      ]);
      setPlayers(((playersResult.data ?? []) as StatsPlayer[]).filter(player => inSeason.has(player.id)));
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setLoadedPlayersSeasonId(selectedSeasonId);
      setPlayersLoadFailed(true);
      setPlayers([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load players");
    });
    return () => { cancelled = true; };
  }, [selectedSeasonId]);

  useEffect(() => {
    if (matchesLoading || !selectedMatch) return;
    if (!matches.some(match => match.id === selectedMatch && match.season_id === selectedSeasonId)) onSelectedMatchChange?.(null);
  }, [matches, matchesLoading, selectedSeasonId, selectedMatch, onSelectedMatchChange]);

  useEffect(() => {
    if (!selectedMatch || !matchBelongsToSeason || playersPending) {
      setStatsLoadFailed(false); setStats({}); setBaselineStats({}); setVersions({}); setLoading(false); setLoadedMatchId(null);
      return;
    }
    if (players.length === 0) {
      setStatsLoadFailed(false); setLoadedMatchId(selectedMatch); setStats({}); setBaselineStats({}); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setStatsLoadFailed(false); setStats({}); setBaselineStats({}); setError(null);
    const supabase = createClient();
    Promise.all([
      supabase.from("player_match_stats").select("*").eq("match_id", selectedMatch),
      supabase.from("goalkeeper_match_stats").select("*").eq("match_id", selectedMatch),
    ]).then(([fieldResult, keeperResult]) => {
      if (cancelled) return;
      setLoadedMatchId(selectedMatch);
      const queryError = fieldResult.error ?? keeperResult.error;
      if (queryError) { setStatsLoadFailed(true); setError(queryError.message); setLoading(false); return; }
      const fieldData = (fieldResult.data ?? []) as Record<string, unknown>[], keeperData = (keeperResult.data ?? []) as Record<string, unknown>[];
      const map = matchRowsFromData(players, fieldData, keeperData);
      setStats(map); setBaselineStats(map); setVersions(versionsFrom(fieldData, keeperData)); setLoading(false);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setLoadedMatchId(selectedMatch); setStatsLoadFailed(true); setLoading(false);
      setError(loadError instanceof Error ? loadError.message : "Failed to load match stats");
    });
    return () => { cancelled = true; };
  }, [selectedMatch, players, matchBelongsToSeason, playersPending]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  
  const setFailure = onFailureChange;

  function changeRow(playerId: string, row: Record<string, number | boolean>) {
    if (saving || saveLock.current || !statsReady) return;
    setStats(previous => ({ ...previous, [playerId]: row as MatchRow }));
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

  /** The saved rows of this match as they are now: full rows, and when each last changed. */
  async function fetchLatest(matchId: string) {
    const supabase = createClient();
    const [fieldResult, keeperResult] = await Promise.all([
      supabase.from("player_match_stats").select("*").eq("match_id", matchId),
      supabase.from("goalkeeper_match_stats").select("*").eq("match_id", matchId),
    ]);
    const queryError = fieldResult.error ?? keeperResult.error;
    if (queryError) throw new Error(queryError.message);
    const fieldData = (fieldResult.data ?? []) as Record<string, unknown>[], keeperData = (keeperResult.data ?? []) as Record<string, unknown>[];
    return { rows: matchRowsFromData(players, fieldData, keeperData), versions: versionsFrom(fieldData, keeperData) };
  }

  /** Whole-match save: a row for every player, like the classic editor. Before writing, it checks nobody saved this match since the page loaded. */
  async function handleSave(): Promise<boolean> {
    if (!statsReady || saving || saveLock.current || !selectedMatch || !hasChanges) return false;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      if (versions) {
        const latest = await fetchLatest(selectedMatch).catch((checkError: unknown) => { throw new Error(checkError instanceof Error ? `Could not check for newer changes: ${checkError.message}` : "Could not check for newer changes. Your changes are still here."); });
        if (changedSince(players.map(player => player.id), versions, latest.versions).length > 0) {
          setFailure({ kind: "conflict", message: `Someone saved stats for ${matchLabel} after you opened this page. Load the latest numbers and keep your edits, or reload the saved numbers.` });
          return false;
        }
      }
      const supabase = createClient();
      const { fieldRows, keeperRows } = buildMatchSaveRows(players, stats, selectedMatch);
      const [{ error: fieldError }, { error: keeperError }] = await Promise.all([
        fieldRows.length > 0 ? supabase.from("player_match_stats").upsert(fieldRows, { onConflict: "player_id,match_id" }) : Promise.resolve({ error: null }),
        keeperRows.length > 0 ? supabase.from("goalkeeper_match_stats").upsert(keeperRows, { onConflict: "player_id,match_id" }) : Promise.resolve({ error: null }),
      ]);
      if (fieldError || keeperError) { setFailure({ kind: "error", message: fieldError?.message ?? keeperError?.message ?? "Unknown error" }); return false; }
      setBaselineStats(stats);
      setFailure(null);
      // The save moved every row's `updated_at`; learn the new ones so the next save does not mistake this one for someone else's.
      fetchLatest(selectedMatch).then(latest => setVersions(latest.versions), () => setVersions(null));
      return true;
    } catch (saveError: unknown) {
      setFailure({ kind: "error", message: saveError instanceof Error ? saveError.message : "Failed to save match stats. Your changes are still here." });
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  /** Conflict resolution: take the saved numbers as the new base. With keepEdits the players the person edited keep their edit. */
  async function loadLatest(keepEdits: boolean) {
    if (!selectedMatch || saving || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const latest = await fetchLatest(selectedMatch);
      setStats(keepEdits ? keepEditsOver(players, latest.rows, stats, baselineStats) : latest.rows);
      setBaselineStats(latest.rows);
      setVersions(latest.versions);
      setError(null);
      setFailure(null);
    } catch (loadError: unknown) {
      setFailure({ kind: "conflict", message: loadError instanceof Error ? `Could not load the latest numbers: ${loadError.message}` : "Could not load the latest numbers." });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const selectedMatchData = matches.find(match => match.id === selectedMatch);
  const matchLabel = selectedMatchData ? describeMatch(selectedMatchData) : "this match";

  function applyScope(next: PendingScope) {
    if (next.kind === "view") { onViewChange(next.view); return; }
    setError(null); setStats({}); setBaselineStats({}); setLoadedMatchId(null); setFailure(null);
    if (next.kind === "season") { setSelectedSeasonId(next.id); onSelectedMatchChange?.(null); }
    else onSelectedMatchChange?.(next.id);
  }
  function requestScope(next: PendingScope) {
    if (saving || saveLock.current) return;
    if (next.kind === "season" ? next.id === selectedSeasonId : next.kind === "match" ? next.id === selectedMatch : false) return;
    const nextMatch = next.kind === "match" ? matches.find(match => match.id === next.id) : undefined;
    const target = next.kind === "season" ? seasonState.seasons.find(season => season.id === next.id)?.label ?? "another season"
      : next.kind === "match" ? (nextMatch ? describeMatch(nextMatch) : "no match") : "Season stats";
    requestNavigation({ kind: "switch", label: target, continue: () => applyScope(next) });
  }
  const save = useSaveState({ isDirty: statsReady && hasChanges, onSave: async () => { if (!(await handleSave())) throw new Error("Match stats were not saved"); } });
  const requestNavigation = useUnsavedGuard({ dirty: hasChanges, edited: `match stats for ${matchLabel}`, onSave: handleSave, onDiscard: () => { setStats(baselineStats); setFailure(null); } });

  useImperativeHandle(controlsRef, () => ({
    changeSeason: (id: string) => requestScope({ kind: "season", id }),
    changeView: () => requestScope({ kind: "view", view: "season" }),
    save: () => { void save.save().catch(() => undefined); },
    discard: () => { setStats(baselineStats); setError(null); setFailure(null); },
    loadLatest: (keepEdits: boolean) => { void loadLatest(keepEdits); },
  }));
  useEffect(() => { onSaveStateChange(save.state); }, [save.state, onSaveStateChange]);
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);

  const seasonMatches = matches.filter(match => match.season_id === selectedSeasonId)
    .sort((a, b) => new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime());
  const editingPlayer = players.find(player => player.id === editing) ?? null;

  return <div className="flex min-w-0 flex-col gap-6">
    <div className={styles.bar}>
      <label>
        <span>Match</span>
        {matchesLoading ? <AdminSkeletonRegion label="Loading matches"><Skeleton className="h-10 w-full" /></AdminSkeletonRegion> :
          <NativeSelect chevronIcon={AdminSelectChevron} className={ADMIN_INPUT_CLASS} value={matchBelongsToSeason ? selectedMatch ?? "" : ""}
            onChange={event => requestScope({ kind: "match", id: event.target.value || null })}
            disabled={saving || playersPending || playersLoadFailed || Boolean(matchesError) || !selectedSeasonId}>
            <NativeSelectOption value="">— Select a match —</NativeSelectOption>
            {seasonMatches.map(match => <NativeSelectOption key={match.id} value={match.id.toString()}>{describeMatch(match)}</NativeSelectOption>)}
          </NativeSelect>}
      </label>
      <p className={styles.hint}>Statistics for one game. Save writes this match for every player listed.</p>
    </div>
    {!seasonsLoading && !matchesLoading && !matchesError && !error && selectedSeasonId && seasonMatches.length === 0 && <p className={styles.empty}>No matches are assigned to this season.</p>}
    {statsReady && players.length > 0 && <StatsTables mode="match" players={players} values={stats} dirtyIds={dirtyIds} disabled={saving} onEdit={openDialog} />}
    {(error || matchesError) && <p role="alert" className={styles.error}>Error: {error || matchesError}</p>}
    {statsReady && !error && players.length === 0 && <p className={styles.empty}>No players are assigned to this season.</p>}
    {statsPending && <StatsTablesSkeleton label="Loading match stats" />}
    <StatsPlayerDialog mode="match" player={editingPlayer} open={editingPlayer !== null} row={editingPlayer ? stats[editingPlayer.id] as unknown as Record<string, number | boolean> : undefined}
      context={matchLabel} games={null} returnFocusRef={opener} onClose={closeDialog} onChange={changeRow} />
  </div>;
}
