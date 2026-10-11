"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import { useRouter } from "next/navigation";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { AdminStatsGroupsSkeleton } from "@/components/admin/AdminCompetitionSkeletons";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminPage, AdminPageHeader, AdminPageToolbar } from "@/components/admin/AdminPage";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { StatsWorkspace } from "@/components/admin/stats/StatsWorkspace";
import { StatsSaveBar } from "@/components/admin/stats/StatsSaveBar";
import { StatsScopeSwitchDialog } from "@/components/admin/stats/StatsScopeSwitchDialog";
import type { StatsFieldGroup, StatsPlayer, StatsValue } from "@/components/admin/stats/types";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";
import { useSeasons } from "@/lib/use-seasons";

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

export default function SeasonStatsPage() {
  const club = useClubContext();
  const router = useRouter();
  // editorial@1 (Lions) doesn't need Season Stats -- the nav item is already
  // hidden in AdminShell.tsx, this blocks direct URL access too.
  const isEditorialTemplate = club.presentationTemplateKey === "editorial@1";
  useEffect(() => {
    if (isEditorialTemplate) router.replace("/admin");
  }, [isEditorialTemplate, router]);
  const {
    seasons,
    activeSeasonId,
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = useSeasons();
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats]         = useState<StatsMap>({});
  const [baselineStats, setBaselineStats] = useState<StatsMap>({});
  const [pendingSeasonId, setPendingSeasonId] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyPlayerIds = useMemo(() => new Set(players.filter(player => JSON.stringify(stats[player.id]) !== JSON.stringify(baselineStats[player.id])).map(player => player.id)), [players, stats, baselineStats]);
  const hasChanges = dirtyPlayerIds.size > 0;
  const [loading, setLoading] = useState(true);
  const [loadedSeasonId, setLoadedSeasonId] = useState<string | null>(null);
  const statsPending = seasonsLoading || loading || Boolean(selectedSeasonId && loadedSeasonId !== selectedSeasonId);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSeasonId) {
      if (!seasonsLoading) setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSaved(false);
      const supabase = createClient();
      const [playersResult, fieldResult, gkResult] = await Promise.all([
        supabase.from("players").select("id, number, name, position, active").order("number"),
        supabase.from("player_season_stats").select("*").eq("season_id", selectedSeasonId),
        supabase.from("goalkeeper_season_stats").select("*").eq("season_id", selectedSeasonId),
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
    if (saving || statsPending || typeof value !== "number") return;
    setSaved(false);
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
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  async function handleSave(): Promise<boolean> {
    if (statsPending || saving || !hasChanges || !selectedSeasonId) return false;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const fieldRows: Record<string, unknown>[] = [];
      const gkRows: Record<string, unknown>[] = [];
      players.forEach((p) => {
        const s = stats[p.id];
        if (!s) return;
        if (p.position === "Goalkeeper" && isGK(s)) {
          gkRows.push({ player_id: p.id, season_id: selectedSeasonId, ...s });
        } else if (!isGK(s)) {
          fieldRows.push({ player_id: p.id, season_id: selectedSeasonId, ...s });
        }
      });
      const [{ error: fe }, { error: ge }] = await Promise.all([
        fieldRows.length > 0
          ? supabase.from("player_season_stats").upsert(fieldRows, { onConflict: "player_id,season_id" })
          : Promise.resolve({ error: null }),
        gkRows.length > 0
          ? supabase.from("goalkeeper_season_stats").upsert(gkRows, { onConflict: "player_id,season_id" })
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
      setError(saveError instanceof Error ? saveError.message : "Failed to save season stats. Your changes are still here.");
      return false;
    } finally { setSaving(false); }
  }

  function requestSeason(seasonId: string) {
    if (seasonId === selectedSeasonId || saving) return;
    if (hasChanges) setPendingSeasonId(seasonId);
    else setSelectedSeasonId(seasonId);
  }
  function switchSeason() {
    if (!pendingSeasonId || saving) return;
    setStats(baselineStats);
    setError(null);
    setSelectedSeasonId(pendingSeasonId);
    setPendingSeasonId(null);
  }
  async function saveAndSwitch() {
    const next = pendingSeasonId;
    if (next && await handleSave()) { setSelectedSeasonId(next); setPendingSeasonId(null); }
  }

  if (isEditorialTemplate) return null;

  const seasonLabel = seasons.find(season => season.id === selectedSeasonId)?.label ?? "this season";
  const saveDisabled = saving || statsPending || !hasChanges || !selectedSeasonId;

  return (
    <AdminPage className="max-w-6xl">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader title="Season Stats" description="Every player. Everything in one place."
        actions={<SeasonSelect seasons={seasons} loading={seasonsLoading} value={selectedSeasonId} onChange={requestSeason} label="Season" disabled={seasonsLoading || saving} />}
      />
      {error && pendingSeasonId === null && <p role="alert" className="font-body mb-4 text-sm text-destructive">Error: {error}</p>}
      <AdminPageToolbar className="items-start sm:items-center"><p className="font-body text-sm text-muted-foreground">These totals are what visitors see on the roster page — they are not calculated from Match Stats.</p>
        {statsPending ? <AdminSkeletonRegion label="Loading player count"><Skeleton className="h-4 w-16" /></AdminSkeletonRegion> : <span className="font-body text-sm text-muted-foreground">{players.length} player{players.length === 1 ? "" : "s"}</span>}
      </AdminPageToolbar>
      {statsPending ? <AdminStatsGroupsSkeleton label="Loading season stats" /> : !selectedSeasonId ? <p className="font-body mt-6 text-sm text-muted-foreground">Create a season before editing season stats.</p> : error && players.length === 0 ? null : players.length === 0 ? <p className="font-body mt-6 text-sm text-muted-foreground">No players are assigned to this season.</p> :
        <StatsWorkspace key={selectedSeasonId} players={players} values={stats} dirtyPlayerIds={dirtyPlayerIds} groupsForPlayer={seasonFieldGroups} onChange={updateStat} disabled={saving} positionGroupIdPrefix="season-stats" contextLabel={`${seasonLabel} season`} description="Enter this player’s season totals." />}
      <StatsSaveBar label="Save All" saving={saving} disabled={saveDisabled} dirtyCount={dirtyPlayerIds.size} onSave={() => void handleSave()} contextLabel={`Season totals for ${seasonLabel}. Save to update the public roster.`} />
      <StatsScopeSwitchDialog open={pendingSeasonId !== null} currentLabel={`${seasonLabel} season`} busy={saving} error={error} onCancel={() => setPendingSeasonId(null)} onDiscard={switchSeason} onSaveAndSwitch={() => void saveAndSwitch()} />
    </AdminPage>
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
