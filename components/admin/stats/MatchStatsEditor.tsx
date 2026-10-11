"use client";

import { IconCaretDown as AdminSelectChevron } from "@/components/admin/icons";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminPageToolbar } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { StatsWorkspace } from "@/components/admin/stats/StatsWorkspace";
import { StatsSaveBar } from "@/components/admin/stats/StatsSaveBar";
import { StatsScopeSwitchDialog } from "@/components/admin/stats/StatsScopeSwitchDialog";
import type { StatsEditorProps, StatsFieldGroup, StatsPlayer, StatsValue } from "@/components/admin/stats/types";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";

// ── Types ─────────────────────────────────────

type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  home: boolean;
  season_id: string;
};

type Player = StatsPlayer;
type PendingScope = { kind: "season"; id: string } | { kind: "match"; id: string | null } | { kind: "view"; view: "season" };

type FieldRow = {
  starts: boolean;
  mins: number;
  goals: number;
  assists: number;
  tackles: number;
  offsides: number;
  fouls: number;
  fouls_suffered: number;
  yellow: number;
  red: number;
};

type GKRow = {
  starts: boolean;
  mins: number;
  goals_against: number;
  saves: number;
  clean_sheets: number;
  yellow: number;
  red: number;
};

type StatsMap = Record<string, FieldRow | GKRow>;

// ── Defaults ──────────────────────────────────

function defaultField(): FieldRow {
  return { starts: false, mins: 0, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0 };
}
function defaultGK(): GKRow {
  return { starts: false, mins: 0, goals_against: 0, saves: 0, clean_sheets: 0, yellow: 0, red: 0 };
}

// ── Helpers ───────────────────────────────────

function isGKRow(row: FieldRow | GKRow): row is GKRow {
  return "saves" in row;
}

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;

// ── Main component ────────────────────────────

export function MatchStatsEditor({ seasonState, selectedPlayerId, onSelectedPlayerChange, showPlayerDetail, onShowPlayerDetailChange, onViewChange, controlsRef, onSavingChange, selectedMatchId, onSelectedMatchChange }: StatsEditorProps) {
  const {
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = seasonState;
  const [matches, setMatches]     = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [statsLoadFailed, setStatsLoadFailed] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [playersLoadFailed, setPlayersLoadFailed] = useState(false);
  const [loadedPlayersSeasonId, setLoadedPlayersSeasonId] = useState<string | null>(null);
  const [loadedMatchId, setLoadedMatchId] = useState<string | null>(null);
  const [players, setPlayers]     = useState<Player[]>([]);
  const selectedMatch = selectedMatchId ?? null;
  const setSelectedMatch = onSelectedMatchChange;
  const [stats, setStats]         = useState<StatsMap>({});
  const [baselineStats, setBaselineStats] = useState<StatsMap>({});
  const [pendingScope, setPendingScope] = useState<PendingScope | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLock = useRef(false);
  const dirtyPlayerIds = useMemo(() => new Set(players.filter(player => JSON.stringify(stats[player.id]) !== JSON.stringify(baselineStats[player.id])).map(player => player.id)), [players, stats, baselineStats]);
  // Position indicators describe the draft; saving remains one whole-match action.
  const dirtyGroups = useMemo(() => new Set(players.filter(player => dirtyPlayerIds.has(player.id)).map(player => player.position)), [players, dirtyPlayerIds]);
  const hasChanges = dirtyGroups.size > 0;
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const playersPending = seasonsLoading || Boolean(selectedSeasonId && loadedPlayersSeasonId !== selectedSeasonId);
  const matchBelongsToSeason = matches.some((match) => match.id === selectedMatch && match.season_id === selectedSeasonId);
  const statsPending = Boolean(selectedMatch && matchBelongsToSeason && (playersPending || loading || loadedMatchId !== selectedMatch));
  const statsReady = Boolean(selectedMatch && matchBelongsToSeason && !statsPending && !statsLoadFailed);

  // Load matches on mount. The player cohort is loaded separately per season.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("matches")
      .select("id, date, time, opponent, home, season_id")
      .order("date")
      .order("time")
      .then(({ data, error: matchesError }) => {
        if (cancelled) return;
        setMatchesLoading(false);
        if (matchesError) {
          setMatchesError(matchesError.message);
          return;
        }
        setMatches((data ?? []) as Match[]);
      }, (loadError: unknown) => {
        if (cancelled) return;
        setMatchesError(loadError instanceof Error ? loadError.message : "Failed to load matches");
        setMatchesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Season-stat rows define season membership. This keeps departed players
  // editable on historical matches without adding them back to the live roster.
  useEffect(() => {
    if (!selectedSeasonId) {
      setPlayers([]);
      return;
    }

    let cancelled = false;
    setError(null);
    setPlayersLoadFailed(false);
    const supabase = createClient();
    Promise.all([
      supabase.from("players").select("id, number, name, position").order("number"),
      supabase.from("player_season_stats").select("player_id").eq("season_id", selectedSeasonId),
      supabase.from("goalkeeper_season_stats").select("player_id").eq("season_id", selectedSeasonId),
    ]).then(([playersResult, fieldResult, goalkeeperResult]) => {
      if (cancelled) return;
      setLoadedPlayersSeasonId(selectedSeasonId);
      const queryError = playersResult.error ?? fieldResult.error ?? goalkeeperResult.error;
      if (queryError) {
        setPlayersLoadFailed(true);
        setError(queryError.message);
        setPlayers([]);
        return;
      }

      const seasonPlayerIds = new Set([
        ...(fieldResult.data ?? []).map((row: { player_id: string }) => row.player_id),
        ...(goalkeeperResult.data ?? []).map((row: { player_id: string }) => row.player_id),
      ]);
      setPlayers(((playersResult.data ?? []) as Player[]).filter((player) => seasonPlayerIds.has(player.id)));
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
    if (!matches.some((match) => match.id === selectedMatch && match.season_id === selectedSeasonId)) setSelectedMatch?.(null);
  }, [matches, matchesLoading, selectedSeasonId, selectedMatch, setSelectedMatch]);

  // When match is selected, load existing stats
  useEffect(() => {
    if (!selectedMatch || !matchBelongsToSeason || playersPending) {
      setStatsLoadFailed(false);
      setStats({});
      setBaselineStats({});
      setLoading(false);
      setLoadedMatchId(null);
      return;
    }
    if (players.length === 0) {
      setStatsLoadFailed(false);
      setLoadedMatchId(selectedMatch);
      setStats({});
      setBaselineStats({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStatsLoadFailed(false);
    setStats({});
    setBaselineStats({});
    setSaved(false);
    setError(null);

    const supabase = createClient();
    Promise.all([
      supabase.from("player_match_stats").select("*").eq("match_id", selectedMatch),
      supabase.from("goalkeeper_match_stats").select("*").eq("match_id", selectedMatch),
    ]).then(([fieldResult, goalkeeperResult]) => {
      if (cancelled) return;
      setLoadedMatchId(selectedMatch);
      const queryError = fieldResult.error ?? goalkeeperResult.error;
      if (queryError) {
        setStatsLoadFailed(true);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const fieldData = fieldResult.data;
      const gkData = goalkeeperResult.data;
      const map: StatsMap = {};

      // Initialise all players with defaults first
      players.forEach((p) => {
        map[p.id] = p.position === "Goalkeeper" ? defaultGK() : defaultField();
      });

      // Overlay existing field stats
      (fieldData ?? []).forEach((r: Record<string, unknown>) => {
        map[r.player_id as number] = {
          starts:         Boolean(r.starts),
          mins:           Number(r.mins),
          goals:          Number(r.goals),
          assists:        Number(r.assists),
          tackles:        Number(r.tackles),
          offsides:       Number(r.offsides ?? 0),
          fouls:          Number(r.fouls ?? 0),
          fouls_suffered: Number(r.fouls_suffered ?? 0),
          yellow:         Number(r.yellow),
          red:            Number(r.red),
        } as FieldRow;
      });

      // Overlay existing GK stats
      (gkData ?? []).forEach((r: Record<string, unknown>) => {
        map[r.player_id as number] = {
          starts:       Boolean(r.starts),
          mins:         Number(r.mins),
          goals_against: Number(r.goals_against),
          saves:        Number(r.saves),
          clean_sheets: Number(r.clean_sheets),
          yellow:       Number(r.yellow),
          red:          Number(r.red),
        } as GKRow;
      });

      setStats(map);
      setBaselineStats(map);
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setLoadedMatchId(selectedMatch);
      setStatsLoadFailed(true);
      setError(loadError instanceof Error ? loadError.message : "Failed to load match stats");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedMatch, players, matchBelongsToSeason, playersPending]);

  // Selection, search and collapsed groups never change this page-owned draft.
  function updateStat(playerId: string, field: string, value: StatsValue) {
    if (saving || saveLock.current || !statsReady) return;
    setSaved(false);
    setStats(previous => ({ ...previous, [playerId]: { ...previous[playerId], [field]: value } }));
  }

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  async function handleSave(): Promise<boolean> {
    if (!statsReady || saving || saveLock.current || !selectedMatch || !hasChanges) return false;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const fieldRows: Record<string, unknown>[] = [];
      const gkRows: Record<string, unknown>[] = [];
      players.forEach((p) => {
        const row = stats[p.id];
        if (!row) return;
        if (p.position === "Goalkeeper" && isGKRow(row)) {
          gkRows.push({ player_id: p.id, match_id: selectedMatch, ...row });
        } else if (!isGKRow(row)) {
          fieldRows.push({ player_id: p.id, match_id: selectedMatch, ...row });
        }
      });
      const [{ error: fe }, { error: ge }] = await Promise.all([
        fieldRows.length > 0
          ? supabase.from("player_match_stats").upsert(fieldRows, { onConflict: "player_id,match_id" })
          : Promise.resolve({ error: null }),
        gkRows.length > 0
          ? supabase.from("goalkeeper_match_stats").upsert(gkRows, { onConflict: "player_id,match_id" })
          : Promise.resolve({ error: null }),
      ]);
      if (fe || ge) {
        setError(fe?.message ?? ge?.message ?? "Unknown error");
        return false;
      }
      setBaselineStats(stats);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
      return true;
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save match stats. Your changes are still here.");
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function applyScope(next: PendingScope) {
    if (next.kind === "view") { onViewChange(next.view); setPendingScope(null); return; }
    setError(null);
    setSaved(false);
    setStats({});
    setBaselineStats({});
    setLoadedMatchId(null);
    if (next.kind === "season") {
      setSelectedSeasonId(next.id);
      setSelectedMatch?.(null);
    } else setSelectedMatch?.(next.id);
    setPendingScope(null);
  }
  function requestScope(next: PendingScope) {
    if (saving || saveLock.current) return;
    if (next.kind === "season" ? next.id === selectedSeasonId : next.kind === "match" ? next.id === selectedMatch : false) return;
    if (hasChanges) setPendingScope(next);
    else applyScope(next);
  }
  function discardAndSwitch() {
    if (pendingScope && !saving && !saveLock.current) applyScope(pendingScope);
  }
  async function saveAndSwitch() {
    const next = pendingScope;
    if (next && await handleSave()) applyScope(next);
  }

  useImperativeHandle(controlsRef, () => ({
    changeSeason: (id: string) => requestScope({ kind: "season", id }),
    changeView: () => requestScope({ kind: "view", view: "season" }),
  }));
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);

  const selectedMatchData = matches.find((m) => m.id === selectedMatch);
  const seasonMatches = matches.filter((match) => match.season_id === selectedSeasonId);

  const matchLabel = selectedMatchData ? `${selectedMatchData.date} · ${selectedMatchData.home ? "vs" : "@"} ${selectedMatchData.opponent}` : "this match";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageToolbar className="items-stretch sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 font-body text-sm font-medium text-foreground">
            <span className="mb-2 block">Match</span>
            {matchesLoading ? <AdminSkeletonRegion label="Loading matches"><Skeleton className="h-10 w-full" /></AdminSkeletonRegion> :
              <NativeSelect chevronIcon={AdminSelectChevron} className={ADMIN_INPUT_CLASS}
                value={matchBelongsToSeason ? selectedMatch ?? "" : ""}
                onChange={event => requestScope({ kind: "match", id: event.target.value || null })}
                disabled={saving || playersPending || playersLoadFailed || Boolean(matchesError) || !selectedSeasonId}>
                <NativeSelectOption value="">— Select a match —</NativeSelectOption>
                {seasonMatches.slice().sort((a, b) => new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime()).map(match =>
                  <NativeSelectOption key={match.id} value={match.id.toString()}>{match.date} · {match.home ? "vs" : "@"} {match.opponent}</NativeSelectOption>)}
              </NativeSelect>}
          </label>
        </div>
      </AdminPageToolbar>
      {!seasonsLoading && !matchesLoading && !matchesError && !error && selectedSeasonId && seasonMatches.length === 0 &&
        <p className="font-body text-sm text-muted-foreground">No matches are assigned to this season.</p>}
      {statsReady && players.length > 0 && <StatsWorkspace key={selectedMatch} players={players} values={stats}
        selectedPlayerId={selectedPlayerId} onSelectedPlayerChange={onSelectedPlayerChange}
        showPlayerDetail={showPlayerDetail} onShowPlayerDetailChange={onShowPlayerDetailChange}
        dirtyPlayerIds={dirtyPlayerIds} groupsForPlayer={matchFieldGroups} onChange={updateStat} disabled={saving}
        positionGroupIdPrefix="match-stats" contextLabel={matchLabel} description="Enter this player’s statistics for the selected match." />}
      {(error || matchesError) && pendingScope === null && <p role="alert" className="font-body text-sm text-destructive">Error: {error || matchesError}</p>}
      {statsReady && !error && players.length === 0 && <p className="font-body text-sm text-muted-foreground">No players are assigned to this season.</p>}
      {statsPending && <AdminStatsGroupsSkeleton label="Loading match stats"
        groups={playersPending ? undefined : POSITIONS.map(position => players.filter(player => player.position === position).length).filter(Boolean)} />}
      <StatsSaveBar label="Save match stats" saving={saving} disabled={saving || !statsReady || !hasChanges || !selectedMatch}
        dirtyCount={dirtyPlayerIds.size} onSave={() => void handleSave()} contextLabel={selectedMatchData ? `All player stats for ${matchLabel}.` : "Select a match to enter player stats."} />
      <StatsScopeSwitchDialog open={pendingScope !== null} currentLabel={`match stats for ${matchLabel}`} busy={saving} error={error}
        onCancel={() => setPendingScope(null)} onDiscard={discardAndSwitch} onSaveAndSwitch={() => void saveAndSwitch()} />
    </div>
  );
}

function matchFieldGroups(player: StatsPlayer): StatsFieldGroup[] {
  const time: StatsFieldGroup = { id: "time", label: "Playing time", fields: [
    { key: "starts", label: "Started the match", ariaLabel: "started the match", kind: "boolean", hint: "In the starting lineup" },
    { key: "mins", label: "Minutes played", ariaLabel: "minutes", max: 300, hint: "0–300 minutes, including extra time" },
  ] };
  const discipline: StatsFieldGroup = { id: "discipline", label: "Discipline", fields: [
    { key: "yellow", label: "Yellow cards", ariaLabel: "yellow cards" },
    { key: "red", label: "Red cards", ariaLabel: "red cards" },
  ] };
  if (player.position === "Goalkeeper") return [time, { id: "keeper", label: "Goalkeeping", fields: [
    { key: "goals_against", label: "Goals conceded", ariaLabel: "goals against", hint: "Goals allowed" },
    { key: "saves", label: "Saves", ariaLabel: "saves", hint: "Shots stopped" },
    { key: "clean_sheets", label: "Clean sheets", ariaLabel: "clean sheets", hint: "Match with no goals conceded" },
  ] }, discipline];
  return [time, { id: "attack", label: "Goals & assists", fields: [
    { key: "goals", label: "Goals", ariaLabel: "goals", hint: "Scored this match" },
    { key: "assists", label: "Assists", ariaLabel: "assists", hint: "Goals you helped create" },
  ] }, { id: "defending", label: "Defending", fields: [
    { key: "tackles", label: "Tackles", ariaLabel: "tackles" },
    { key: "offsides", label: "Offsides", ariaLabel: "offsides" },
    { key: "fouls", label: "Fouls committed", ariaLabel: "fouls" },
    { key: "fouls_suffered", label: "Fouls suffered", ariaLabel: "fouls suffered", hint: "Fouls won by this player" },
  ] }, discipline];
}
