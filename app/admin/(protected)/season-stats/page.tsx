"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { AdminPage, AdminPageHeader, AdminPageToolbar } from "@/components/admin/AdminPage";
import SeasonSelect from "@/components/admin/SeasonSelect";
import StatInput from "@/components/admin/StatInput";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import { useSeasons } from "@/lib/use-seasons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────

type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
const POSITIONS: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

type Player = {
  id: string;
  number: number;
  name: string;
  position: Position;
};

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
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const showFullLoader = useDelayedLoading(loading || seasonsLoading, 400);

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
      const [playersResult, fieldResult, gkResult] = await Promise.all([
        supabase.from("players").select("id, number, name, position, active").order("number"),
        supabase.from("player_season_stats").select("*").eq("season_id", selectedSeasonId),
        supabase.from("goalkeeper_season_stats").select("*").eq("season_id", selectedSeasonId),
      ]);

      if (cancelled) return;
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
      setHasChanges(false);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [activeSeasonId, selectedSeasonId, seasonsLoading]);

  function updateStat(playerId: string, field: string, value: number) {
    setHasChanges(true);
    setStats((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, value) },
    }));
  }

  async function handleSave() {
    if (!hasChanges || !selectedSeasonId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const fieldRows: Record<string, unknown>[] = [];
    const gkRows:    Record<string, unknown>[] = [];

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
    } else {
      setHasChanges(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (isEditorialTemplate) return null;

  return (
    <AdminPage className="max-w-5xl">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        title="Season Stats"
        description="Edit season totals for each player. Changes apply to the public roster page."
        actions={<div className="flex flex-wrap items-end gap-4">
          <SeasonSelect
            seasons={seasons}
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            label="Season"
            disabled={seasonsLoading || saving}
          />
          <button
            onClick={handleSave}
            disabled={saving || loading || !hasChanges || !selectedSeasonId}
            className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <AdminLoadingDots className="mr-2" />}
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>}
      />

      {error && (
        <p className="font-body text-sm mb-4 text-destructive">Error: {error}</p>
      )}

      {loading || seasonsLoading || showFullLoader ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading season stats" />
        ) : (
          <div className="flex flex-col gap-4" role="status" aria-label="Loading season stats">
            <Skeleton className="h-10 w-full max-w-sm" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          </div>
        )
      ) : !selectedSeasonId ? (
        <p className="font-body text-sm text-muted-foreground">
          Create a season before editing season stats.
        </p>
      ) : players.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">
          No players are assigned to this season.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Status bar: unsaved-changes pill, the "hand-entered, not derived
              from Match Stats" disclaimer, and a player count -- matches the
              toolbar row in the Season Stats mockup that sits between the
              header and the position groups. */}
          <AdminPageToolbar className="items-start sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              {hasChanges && (
                <span className="inline-flex items-center gap-2 self-start whitespace-nowrap rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-warning" aria-hidden="true" />
                  Unsaved changes
                </span>
              )}
              <p className="font-body text-sm text-muted-foreground">
                These totals are what visitors see on the roster page — they are not calculated from Match Stats.
              </p>
            </div>
            <span className="font-body text-sm text-muted-foreground">
              {players.length} player{players.length === 1 ? "" : "s"}
            </span>
          </AdminPageToolbar>

          {POSITIONS.map((pos) => {
            const group = players.filter((p) => p.position === pos);
            if (group.length === 0) return null;
            return (
              <SeasonStatsPositionGroup
                key={pos}
                pos={pos}
                group={group}
                stats={stats}
                updateStat={updateStat}
              />
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}

// ── Collapsible position group ────────────────
//
// Copies Roster's `PlayerPositionGroup` open/closed + chevron pattern
// exactly (same header button, svg chevron rotation, grid-template-rows
// expand/collapse) so Season Stats groups behave and look identical to the
// rest of the admin portal's collapsible sections.

function SeasonStatsPositionGroup({
  pos,
  group,
  stats,
  updateStat,
}: {
  pos: Position;
  group: Player[];
  stats: StatsMap;
  updateStat: (playerId: string, field: string, value: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const isGKPos = pos === "Goalkeeper";
  const headers = isGKPos
    ? ["#", "Name", "GA", "Saves", "CS", "Starts", "Y", "R", "Mins"]
    : ["#", "Name", "Goals", "Ast", "Tackles", "OFF", "F", "FS", "Starts", "Y", "R", "Mins"];
  const gridCols = isGKPos
    ? "48px 1fr 64px 64px 64px 64px 52px 52px 72px"
    : "48px 1fr 64px 64px 72px 56px 56px 56px 64px 52px 52px 72px";

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Position header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-card px-4 py-3 transition-colors hover:bg-accent/60"
      >
        <span className="font-display font-black uppercase tracking-widest text-foreground/90" style={{ fontSize: "1.1rem" }}>
          {pos}s{" "}
          <span className="font-normal text-muted-foreground/60">{group.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          className="text-muted-foreground/60"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Animated content */}
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
        <div style={{ overflow: "hidden" }}>
          {/* Horizontally scrollable on mobile */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ minWidth: 600 }}>

              {/* Column headers */}
              <div
                className="grid gap-2 border-b border-border bg-muted/40 px-4 py-2"
                style={{ gridTemplateColumns: gridCols }}
              >
                {headers.map((h) => (
                  <span
                    key={h}
                    className="font-display font-bold uppercase text-center text-foreground/90"
                    style={{ fontSize: "0.75rem", letterSpacing: "0.08em" }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {/* Player rows */}
              {group.map((p, i) => {
                const s = stats[p.id];
                if (!s) return null;

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "grid gap-2 items-center px-4 py-2 transition-colors hover:bg-accent/40",
                      i % 2 === 1 && "bg-muted/20",
                      i < group.length - 1 && "border-b border-border/40",
                    )}
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    {/* # */}
                    <span className="font-display font-bold text-center text-muted-foreground/70" style={{ fontSize: "1rem" }}>
                      {p.number}
                    </span>

                    {/* Name */}
                    <span className="font-body truncate text-foreground/85" style={{ fontSize: "1rem" }}>
                      {p.name}
                    </span>

                    {/* Stat inputs */}
                    {isGKPos && isGK(s) ? (
                      <>
                        <SeasonStatValueInput value={s.goals_against} onChange={(v) => updateStat(p.id, "goals_against", v)} />
                        <SeasonStatValueInput value={s.saves}         onChange={(v) => updateStat(p.id, "saves", v)} />
                        <SeasonStatValueInput value={s.clean_sheets}  onChange={(v) => updateStat(p.id, "clean_sheets", v)} />
                        <SeasonStatValueInput value={s.starts}        onChange={(v) => updateStat(p.id, "starts", v)} />
                        <SeasonStatValueInput value={s.yellow}        onChange={(v) => updateStat(p.id, "yellow", v)} />
                        <SeasonStatValueInput value={s.red}           onChange={(v) => updateStat(p.id, "red", v)} />
                        <SeasonStatValueInput value={s.mins}          onChange={(v) => updateStat(p.id, "mins", v)} />
                      </>
                    ) : !isGK(s) ? (
                      <>
                        <SeasonStatValueInput value={s.goals}          onChange={(v) => updateStat(p.id, "goals", v)} />
                        <SeasonStatValueInput value={s.assists}         onChange={(v) => updateStat(p.id, "assists", v)} />
                        <SeasonStatValueInput value={s.tackles}         onChange={(v) => updateStat(p.id, "tackles", v)} />
                        <SeasonStatValueInput value={s.offsides}        onChange={(v) => updateStat(p.id, "offsides", v)} />
                        <SeasonStatValueInput value={s.fouls}           onChange={(v) => updateStat(p.id, "fouls", v)} />
                        <SeasonStatValueInput value={s.fouls_suffered}  onChange={(v) => updateStat(p.id, "fouls_suffered", v)} />
                        <SeasonStatValueInput value={s.starts}          onChange={(v) => updateStat(p.id, "starts", v)} />
                        <SeasonStatValueInput value={s.yellow}          onChange={(v) => updateStat(p.id, "yellow", v)} />
                        <SeasonStatValueInput value={s.red}             onChange={(v) => updateStat(p.id, "red", v)} />
                        <SeasonStatValueInput value={s.mins}            onChange={(v) => updateStat(p.id, "mins", v)} />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div> {/* end minWidth */}
          </div> {/* end overflow-x */}
        </div>
      </div>
    </div>
  );
}

// ── Stat value input ──────────────────────────
//
// Thin wrapper around the shared `StatInput` that adds the season-stats
// "receding zeros" treatment: entered (non-zero) values render bold and
// full-strength so they stand out, while untouched zero fields recede to a
// muted tone. Values already render bold via `StatInput`'s own styling;
// this only layers on tabular figures and the zero-value de-emphasis.
// Scoped to this page via `className` (not `StatInput.tsx` itself) so
// Match Stats' input styling is untouched.

function SeasonStatValueInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <StatInput
      value={value}
      onChange={onChange}
      className={cn("tabular-nums", value === 0 && "text-muted-foreground/40")}
    />
  );
}
