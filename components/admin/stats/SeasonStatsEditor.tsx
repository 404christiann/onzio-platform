"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import { AdminPageToolbar } from "@/components/admin/AdminPage";
import { StatsWorkspace } from "@/components/admin/stats/StatsWorkspace";
import type { StatsEditorProps, StatsFieldGroup, StatsPlayer, StatsValue } from "@/components/admin/stats/types";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";
import { saveSeasonTotals } from "@/lib/season-totals-save";

// ── Types ─────────────────────────────────────

type Player = StatsPlayer;

type FieldStats = {
  goals: number;
  assists: number;
  tackles: number;
  offsides: number;
  fouls: number;
  fouls_suffered: number;
  starts: number;
  yellow: number;
  red: number;
  mins: number;
};

type GKStats = {
  goals_against: number;
  saves: number;
  clean_sheets: number;
  starts: number;
  yellow: number;
  red: number;
  mins: number;
};

type StatsMap = Record<string, FieldStats | GKStats>;

function defaultField(): FieldStats {
  return { goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, starts: 0, yellow: 0, red: 0, mins: 0 };
}
function defaultGK(): GKStats {
  return { goals_against: 0, saves: 0, clean_sheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 };
}
function isGK(s: FieldStats | GKStats): s is GKStats {
  return "saves" in s;
}

// ── Main component ────────────────────────────

export function SeasonStatsEditor({ seasonState, selectedPlayerId, onSelectedPlayerChange, showPlayerDetail, onShowPlayerDetailChange, onViewChange, controlsRef, onSavingChange, onSaveStateChange }: StatsEditorProps) {
  const {
    seasons,
    activeSeasonId,
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = seasonState;
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats]         = useState<StatsMap>({});
  const [baselineStats, setBaselineStats] = useState<StatsMap>({});
  const saveLock = useRef(false);
  const dirtyPlayerIds = useMemo(() => new Set(players.filter(player => JSON.stringify(stats[player.id]) !== JSON.stringify(baselineStats[player.id])).map(player => player.id)), [players, stats, baselineStats]);
  const hasChanges = dirtyPlayerIds.size > 0;
  const [loading, setLoading] = useState(true);
  const [loadedSeasonId, setLoadedSeasonId] = useState<string | null>(null);
  const statsPending = seasonsLoading || loading || Boolean(selectedSeasonId && loadedSeasonId !== selectedSeasonId);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [seasonRowIds, setSeasonRowIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedSeasonId) {
      if (!seasonsLoading) setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      // ADMIN-RE-11c: what shows is the totals as visitors see them, the season's
      // match stats added up plus what was added by hand.
      const [playersResult, fieldResult, gkResult] = await Promise.all([
        supabase.from("players").select("id, number, name, position, active").order("number"),
        supabase.from("player_season_totals").select("*").eq("season_id", selectedSeasonId),
        supabase.from("goalkeeper_season_totals").select("*").eq("season_id", selectedSeasonId),
      ]);

      if (cancelled) return;
      setLoadedSeasonId(selectedSeasonId);
      const queryError = playersResult.error ?? fieldResult.error ?? gkResult.error;
      if (queryError) {
        setError(queryError.message);
        setPlayers([]);
        setStats({});
        setLoading(false);
        return;
      }

      const fieldRows = fieldResult.data ?? [];
      const gkRows = gkResult.data ?? [];
      const seasonPlayerIds = new Set([
        ...fieldRows.map((row: Record<string, unknown>) => row.player_id as string),
        ...gkRows.map((row: Record<string, unknown>) => row.player_id as string),
      ]);
      const isActiveSeason = selectedSeasonId === activeSeasonId;
      const ps = ((playersResult.data ?? []) as (Player & { active: boolean })[])
        .filter((player) => seasonPlayerIds.has(player.id) || (isActiveSeason && player.active))
        .map(({ active: _active, ...player }) => player);
      setPlayers(ps);

      const map: StatsMap = {};
      ps.forEach((p) => {
        map[p.id] = p.position === "Goalkeeper" ? defaultGK() : defaultField();
      });

      (fieldRows ?? []).forEach((r: Record<string, unknown>) => {
        map[r.player_id as string] = {
          goals:          Number(r.goals),
          assists:        Number(r.assists),
          tackles:        Number(r.tackles),
          offsides:       Number(r.offsides ?? 0),
          fouls:          Number(r.fouls ?? 0),
          fouls_suffered: Number(r.fouls_suffered ?? 0),
          starts:         Number(r.starts),
          yellow:         Number(r.yellow),
          red:            Number(r.red),
          mins:           Number(r.mins),
        } as FieldStats;
      });

      (gkRows ?? []).forEach((r: Record<string, unknown>) => {
        map[r.player_id as string] = {
          goals_against: Number(r.goals_against),
          saves:         Number(r.saves),
          clean_sheets:  Number(r.clean_sheets),
          starts:        Number(r.starts),
          yellow:        Number(r.yellow),
          red:           Number(r.red),
          mins:          Number(r.mins),
        } as GKStats;
      });

      setStats(map);
      setBaselineStats(map);
      setSeasonRowIds(seasonPlayerIds);
      setLoading(false);
    }
    load().catch((loadError: unknown) => {
      if (cancelled) return;
      setLoadedSeasonId(selectedSeasonId);
      setPlayers([]);
      setStats({});
      setError(loadError instanceof Error ? loadError.message : "Failed to load season stats");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSeasonId, selectedSeasonId, seasonsLoading]);

  function updateStat(playerId: string, field: string, value: StatsValue) {
    if (saving || saveLock.current || statsPending || typeof value !== "number") return;
    setStats((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, value) },
    }));
  }

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  async function handleSave(): Promise<boolean> {
    if (statsPending || saving || saveLock.current || !hasChanges || !selectedSeasonId) return false;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const dirty = players.filter((p) => dirtyPlayerIds.has(p.id) && stats[p.id]);
      const problem = await saveSeasonTotals(createClient(), selectedSeasonId, dirty.map((p) => ({
        playerId: p.id,
        name: p.name,
        keeper: p.position === "Goalkeeper",
        typed: stats[p.id] as Record<string, number>,
        inSeason: seasonRowIds.has(p.id),
      })), players
        .filter((p) => !seasonRowIds.has(p.id) && !dirtyPlayerIds.has(p.id))
        .map((p) => ({ playerId: p.id, keeper: p.position === "Goalkeeper" })));
      if (problem) {
        setError(problem);
        return false;
      }
      setSeasonRowIds(new Set(players.map((p) => p.id)));
      setBaselineStats(stats);
      return true;
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save season stats. Your changes are still here.");
      return false;
    } finally { saveLock.current = false; setSaving(false); }
  }

  type Scope = { kind: "season"; id: string } | { kind: "view"; view: "match" };
  function applyScope(next: Scope) {
    setError(null);
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
  const requestNavigation = useUnsavedGuard({ dirty: hasChanges, edited: `season totals for ${seasonLabel}`, onSave: handleSave, onDiscard: () => setStats(baselineStats) });
  useImperativeHandle(controlsRef, () => ({
    changeSeason: (id: string) => requestScope({ kind: "season", id }),
    changeView: () => requestScope({ kind: "view", view: "match" }),
    save: () => { void save.save().catch(() => undefined); },
  }));
  useEffect(() => { onSaveStateChange(save.state); }, [save.state, onSaveStateChange]);
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error && <p role="alert" className="font-body mb-4 text-sm text-destructive">Error: {error}</p>}
      <AdminPageToolbar className="items-start sm:items-center"><p className="font-body text-sm text-muted-foreground">These season totals appear on the public roster. They add up from match stats; change a total to add the rest by hand.</p>
        {statsPending ? <AdminSkeletonRegion label="Loading player count"><Skeleton className="h-4 w-16" /></AdminSkeletonRegion> : <span className="font-body text-sm text-muted-foreground">{players.length} player{players.length === 1 ? "" : "s"}</span>}
      </AdminPageToolbar>
      {statsPending ? <AdminStatsGroupsSkeleton label="Loading season stats" /> : !selectedSeasonId ? <p className="font-body mt-6 text-sm text-muted-foreground">Create a season before editing season stats.</p> : error && players.length === 0 ? null : players.length === 0 ? <p className="font-body mt-6 text-sm text-muted-foreground">No players are assigned to this season.</p> :
        <StatsWorkspace key={selectedSeasonId} players={players} values={stats} selectedPlayerId={selectedPlayerId} onSelectedPlayerChange={onSelectedPlayerChange}
        showPlayerDetail={showPlayerDetail} onShowPlayerDetailChange={onShowPlayerDetailChange}
        dirtyPlayerIds={dirtyPlayerIds} groupsForPlayer={seasonFieldGroups} onChange={updateStat} disabled={saving} positionGroupIdPrefix="season-stats" contextLabel={`${seasonLabel} season`} description="This player’s season totals: match stats added up, plus anything added by hand." />}
    </div>
  );
}

function seasonFieldGroups(player: StatsPlayer): StatsFieldGroup[] {
  const time: StatsFieldGroup = { id: "time", label: "Playing time", fields: [
    { key: "starts", label: "Starts", ariaLabel: "starts", hint: "Matches started" },
    { key: "mins", label: "Minutes played", ariaLabel: "minutes", hint: "Total time on the pitch" },
  ] };
  const discipline: StatsFieldGroup = { id: "discipline", label: "Discipline", fields: [
    { key: "yellow", label: "Yellow cards", ariaLabel: "yellow cards" },
    { key: "red", label: "Red cards", ariaLabel: "red cards" },
  ] };
  if (player.position === "Goalkeeper") return [time, { id: "keeper", label: "Goalkeeping", fields: [
    { key: "goals_against", label: "Goals conceded", ariaLabel: "goals against", hint: "Goals allowed" },
    { key: "saves", label: "Saves", ariaLabel: "saves", hint: "Shots stopped" },
    { key: "clean_sheets", label: "Clean sheets", ariaLabel: "clean sheets", hint: "Matches with no goals conceded" },
  ] }, discipline];
  return [time, { id: "attack", label: "Goals & assists", fields: [
    { key: "goals", label: "Goals", ariaLabel: "goals", hint: "Scored this season" },
    { key: "assists", label: "Assists", ariaLabel: "assists", hint: "Goals you helped create" },
  ] }, { id: "defending", label: "Defending", fields: [
    { key: "tackles", label: "Tackles", ariaLabel: "tackles" },
    { key: "offsides", label: "Offsides", ariaLabel: "offsides" },
    { key: "fouls", label: "Fouls committed", ariaLabel: "fouls" },
    { key: "fouls_suffered", label: "Fouls suffered", ariaLabel: "fouls suffered", hint: "Fouls won by this player" },
  ] }, discipline];
}

