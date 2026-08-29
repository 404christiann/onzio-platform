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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/admin-client";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import { useSeasons } from "@/lib/use-seasons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────

type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  home: boolean;
  season_id: string;
};

type Player = {
  id: string;
  number: number;
  name: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
};

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

export default function StatsPage() {
  const club = useClubContext();
  const router = useRouter();
  // editorial@1 (Lions) doesn't need Match Stats -- the nav item is already
  // hidden in AdminShell.tsx, this blocks direct URL access too.
  const isEditorialTemplate = club.presentationTemplateKey === "editorial@1";
  useEffect(() => {
    if (isEditorialTemplate) router.replace("/admin");
  }, [isEditorialTemplate, router]);
  const {
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = useSeasons();
  const [matches, setMatches]     = useState<Match[]>([]);
  const [players, setPlayers]     = useState<Player[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [stats, setStats]         = useState<StatsMap>({});
  // Per-position-group dirty tracking, mirroring the Homepage admin page's
  // dirtySections pattern: a Set of dirty group ids, tagged by each field
  // change handler, with overall-dirty derived as set.size > 0. Save remains
  // a single action for the whole match (see handleSave) — this state never
  // splits it into per-group saves, it only drives the per-group indicator.
  const [dirtyGroups, setDirtyGroups] = useState<Set<Player["position"]>>(new Set());
  const hasChanges = dirtyGroups.size > 0;
  const [loading, setLoading]     = useState(false);
  const showFullLoader = useDelayedLoading(loading, 400);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Load matches on mount. The player cohort is loaded separately per season.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("matches")
      .select("id, date, time, opponent, home, season_id")
      .order("date")
      .order("time")
      .then(({ data, error: matchesError }) => {
        if (matchesError) {
          setError(matchesError.message);
          return;
        }
        setMatches((data ?? []) as Match[]);
      });
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
    const supabase = createClient();
    Promise.all([
      supabase.from("players").select("id, number, name, position").order("number"),
      supabase.from("player_season_stats").select("player_id").eq("season_id", selectedSeasonId),
      supabase.from("goalkeeper_season_stats").select("player_id").eq("season_id", selectedSeasonId),
    ]).then(([playersResult, fieldResult, goalkeeperResult]) => {
      if (cancelled) return;
      const queryError = playersResult.error ?? fieldResult.error ?? goalkeeperResult.error;
      if (queryError) {
        setError(queryError.message);
        setPlayers([]);
        return;
      }

      const seasonPlayerIds = new Set([
        ...(fieldResult.data ?? []).map((row: { player_id: string }) => row.player_id),
        ...(goalkeeperResult.data ?? []).map((row: { player_id: string }) => row.player_id),
      ]);
      setPlayers(((playersResult.data ?? []) as Player[]).filter((player) => seasonPlayerIds.has(player.id)));
    });

    return () => { cancelled = true; };
  }, [selectedSeasonId]);

  useEffect(() => {
    setSelectedMatch((current) => {
      if (!current) return null;
      return matches.some((match) => match.id === current && match.season_id === selectedSeasonId)
        ? current
        : null;
    });
  }, [matches, selectedSeasonId]);

  // When match is selected, load existing stats
  useEffect(() => {
    if (!selectedMatch || players.length === 0) {
      setStats({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    setDirtyGroups(new Set());
    setError(null);

    const supabase = createClient();
    Promise.all([
      supabase.from("player_match_stats").select("*").eq("match_id", selectedMatch),
      supabase.from("goalkeeper_match_stats").select("*").eq("match_id", selectedMatch),
    ]).then(([fieldResult, goalkeeperResult]) => {
      if (cancelled) return;
      const queryError = fieldResult.error ?? goalkeeperResult.error;
      if (queryError) {
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
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedMatch, players]);

  // Tag a position group as having unsaved edits.
  function markGroupDirty(position: Player["position"]) {
    setDirtyGroups((current) => {
      if (current.has(position)) return current;
      const next = new Set(current);
      next.add(position);
      return next;
    });
  }

  // Update a single field in a player's stat row
  function updateStat(
    playerId: string,
    field: string,
    value: number | boolean
  ) {
    const player = players.find((p) => p.id === playerId);
    if (player) markGroupDirty(player.position);
    setStats((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: value },
    }));
  }

  // Save all stats
  async function handleSave() {
    if (!selectedMatch || !hasChanges) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const fieldRows: Record<string, unknown>[] = [];
    const gkRows:    Record<string, unknown>[] = [];

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
    } else {
      setDirtyGroups(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  const selectedMatchData = matches.find((m) => m.id === selectedMatch);
  const seasonMatches = matches.filter((match) => match.season_id === selectedSeasonId);

  if (isEditorialTemplate) return null;

  return (
    <AdminPage className="max-w-5xl">
      <AdminSaveFeedback saving={saving} saved={saved} />

      <AdminPageHeader
        title="Match Stats"
        description="Select a match to enter or update player statistics."
      />

      {/* Match selector — Save All Stats + the unsaved-changes pill live in this
          same pinned toolbar row (far right), never below the position groups. */}
      <AdminPageToolbar className="items-stretch sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-end">
          <SeasonSelect
            seasons={seasons}
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            label="Season"
            disabled={seasonsLoading}
            className="w-full"
          />
          <label className="block min-w-0 flex-1 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className="mb-2 block">Match</span>
            <NativeSelect
              value={selectedMatch ?? ""}
              onChange={(e) => setSelectedMatch(e.target.value || null)}
              disabled={seasonsLoading || !selectedSeasonId}
            >
              <NativeSelectOption value="">— Select a match —</NativeSelectOption>
              {seasonMatches
                .slice()
                .sort((a, b) => new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime())
                .map((m) => (
                  <NativeSelectOption key={m.id} value={m.id.toString()}>
                    {m.date} · {m.home ? "vs" : "@"} {m.opponent}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-end gap-3">
          {hasChanges && (
            <span className="rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !selectedMatch}
            className="whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-display text-sm font-bold text-primary-foreground transition-opacity duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <AdminLoadingDots className="mr-2" />}
            {saving ? "Saving…" : "Save All Stats"}
          </button>
        </div>
      </AdminPageToolbar>

      {!seasonsLoading && selectedSeasonId && seasonMatches.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">
          No matches are assigned to this season.
        </p>
      )}

      {/* Stats form */}
      {selectedMatch && !loading && (
        <>
          {/* Match label */}
          {selectedMatchData && (
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="font-display text-xs tracking-widest uppercase text-muted-foreground">
                {selectedMatchData.date} · {selectedMatchData.home ? "vs" : "@"} {selectedMatchData.opponent}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Player rows by position group */}
          {POSITIONS.map((pos) => {
            const group = players.filter((p) => p.position === pos);
            if (group.length === 0) return null;
            const isGK = pos === "Goalkeeper";

            return (
              <PositionGroup
                key={pos}
                pos={pos}
                group={group}
                isGK={isGK}
                stats={stats}
                updateStat={updateStat}
                dirty={dirtyGroups.has(pos)}
              />
            );
          })}


          {/* Error */}
          {error && (
            <p className="font-body text-sm mb-4 text-destructive">
              Error saving: {error}
            </p>
          )}
        </>
      )}

      {/* Loading state */}
      {(loading || showFullLoader) && (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading players" />
        ) : (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading players">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        )
      )}
    </AdminPage>
  );
}

// ── Collapsible position group ────────────────

// Zero/untouched stat values render in the muted-foreground token so fields
// the user has actually entered stand out visually. `--muted-foreground` is
// an existing .admin-theme token (see styles/globals.css) — no new color.
function zeroValueClass(value: number): string | undefined {
  return value === 0 ? "text-muted-foreground" : undefined;
}

function PositionGroup({
  pos,
  group,
  isGK,
  stats,
  updateStat,
  dirty,
}: {
  pos: string;
  group: Player[];
  isGK: boolean;
  stats: StatsMap;
  updateStat: (playerId: string, field: string, value: number | boolean) => void;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(true);

  const fieldHeaders = ["#", "Name", "Start", "Mins", "Goals", "Ast", "Tackles", "OFF", "F", "FS", "Y", "R"];
  const gkHeaders    = ["#", "Name", "Start", "Mins", "GA", "Saves", "CS", "Y", "R"];
  const headers = isGK ? gkHeaders : fieldHeaders;

  // Grid template: number col, name col, then stat cols
  const gridCols = isGK
    ? "48px 1fr 60px 72px 60px 60px 60px 52px 52px"
    : "48px 1fr 60px 72px 60px 60px 72px 56px 56px 56px 52px 52px";

  return (
    <div className="mb-4 rounded-xl overflow-hidden border border-border">
      {/* Position header / toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-card px-4 py-3 transition-colors duration-150 hover:bg-accent/60"
      >
        <span className="flex items-center gap-2">
          <span
            className="font-display font-black uppercase tracking-widest text-foreground/90"
            style={{ fontSize: "1.1rem" }}
          >
            {pos}s &nbsp;
            <span className="font-normal text-muted-foreground/60">
              {group.length}
            </span>
          </span>
          {dirty && (
            <span
              aria-label="Unsaved changes"
              title="Unsaved changes"
              className="h-1.5 w-1.5 flex-none rounded-full bg-warning"
            />
          )}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="text-muted-foreground/60"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s ease",
          }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Animated content */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          {/* Horizontally scrollable wrapper */}
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
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Player rows */}
          {group.map((p, i) => {
            const row = stats[p.id];
            if (!row) return null;

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
                <span
                  className="font-display font-bold text-center text-muted-foreground/70"
                  style={{ fontSize: "1rem" }}
                >
                  {p.number}
                </span>

                {/* Name */}
                <span
                  className="font-body truncate text-foreground/85"
                  style={{ fontSize: "1rem" }}
                >
                  {p.name}
                </span>

                {/* Start checkbox */}
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={row.starts}
                    onChange={(e) => updateStat(p.id, "starts", e.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded accent-primary"
                  />
                </div>

                {/* Mins */}
                <StatInput
                  value={row.mins}
                  onChange={(v) => updateStat(p.id, "mins", v)}
                  className={zeroValueClass(row.mins)}
                />

                {isGK && isGKRow(row) ? (
                  <>
                    <StatInput value={row.goals_against} onChange={(v) => updateStat(p.id, "goals_against", v)} className={zeroValueClass(row.goals_against)} />
                    <StatInput value={row.saves}         onChange={(v) => updateStat(p.id, "saves", v)} className={zeroValueClass(row.saves)} />
                    <StatInput value={row.clean_sheets}  onChange={(v) => updateStat(p.id, "clean_sheets", v)} className={zeroValueClass(row.clean_sheets)} />
                    <StatInput value={row.yellow}        onChange={(v) => updateStat(p.id, "yellow", v)} className={zeroValueClass(row.yellow)} />
                    <StatInput value={row.red}           onChange={(v) => updateStat(p.id, "red", v)} className={zeroValueClass(row.red)} />
                  </>
                ) : !isGKRow(row) ? (
                  <>
                    <StatInput value={row.goals}          onChange={(v) => updateStat(p.id, "goals", v)} className={zeroValueClass(row.goals)} />
                    <StatInput value={row.assists}         onChange={(v) => updateStat(p.id, "assists", v)} className={zeroValueClass(row.assists)} />
                    <StatInput value={row.tackles}         onChange={(v) => updateStat(p.id, "tackles", v)} className={zeroValueClass(row.tackles)} />
                    <StatInput value={row.offsides}        onChange={(v) => updateStat(p.id, "offsides", v)} className={zeroValueClass(row.offsides)} />
                    <StatInput value={row.fouls}           onChange={(v) => updateStat(p.id, "fouls", v)} className={zeroValueClass(row.fouls)} />
                    <StatInput value={row.fouls_suffered}  onChange={(v) => updateStat(p.id, "fouls_suffered", v)} className={zeroValueClass(row.fouls_suffered)} />
                    <StatInput value={row.yellow}          onChange={(v) => updateStat(p.id, "yellow", v)} className={zeroValueClass(row.yellow)} />
                    <StatInput value={row.red}             onChange={(v) => updateStat(p.id, "red", v)} className={zeroValueClass(row.red)} />
                  </>
                ) : null}
              </div>
            );
          })}
            </div> {/* end minWidth wrapper */}
          </div> {/* end overflow-x scroll */}
        </div>
      </div>
    </div>
  );
}
