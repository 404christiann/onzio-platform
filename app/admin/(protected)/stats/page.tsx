"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import AdminLoading, { AdminLoadingDots } from "@/components/admin/AdminLoading";
import SeasonSelect from "@/components/admin/SeasonSelect";
import StatInput from "@/components/admin/StatInput";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createClient } from "@/lib/admin-client";
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
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading]     = useState(false);
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
    setHasChanges(false);
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

  // Update a single field in a player's stat row
  function updateStat(
    playerId: string,
    field: string,
    value: number | boolean
  ) {
    setHasChanges(true);
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
      setHasChanges(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  const selectedMatchData = matches.find((m) => m.id === selectedMatch);
  const seasonMatches = matches.filter((match) => match.season_id === selectedSeasonId);

  if (isEditorialTemplate) return null;

  return (
    <div className="max-w-5xl mx-auto">
      <AdminSaveFeedback saving={saving} saved={saved} />

      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase text-foreground leading-none"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Match Stats
        </h1>
        <p className="font-body mt-1 text-muted-foreground" style={{ fontSize: "1rem" }}>
          Select a match to enter or update player statistics.
        </p>
      </div>

      {/* Match selector */}
      <div className="mb-8 flex flex-col gap-4">
        <SeasonSelect
          seasons={seasons}
          value={selectedSeasonId}
          onChange={setSelectedSeasonId}
          label="Season"
          disabled={seasonsLoading}
          className="w-full"
        />
        <label
          className="block font-display tracking-widest uppercase mb-2 text-muted-foreground"
          style={{ fontSize: "0.9rem" }}
        >
          Match
        </label>
        <div className="max-w-[560px]">
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
        </div>

        {!seasonsLoading && selectedSeasonId && seasonMatches.length === 0 && (
          <p className="font-body text-sm text-muted-foreground">
            No matches are assigned to this season.
          </p>
        )}

      </div>

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
              />
            );
          })}


          {/* Error */}
          {error && (
            <p className="font-body text-sm mb-4 text-destructive">
              Error saving: {error}
            </p>
          )}

          {/* Save button */}
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-8 py-3 rounded-lg font-display font-black uppercase tracking-widest text-brand-foreground bg-brand transition-opacity duration-200 hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontSize: "1.1rem" }}
            >
              {saving && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving…" : "Save All Stats"}
            </button>

          </div>
        </>
      )}

      {/* Loading state */}
      {loading && (
        <AdminLoading label="Loading players" className="font-display text-sm tracking-widest uppercase" />
      )}
    </div>
  );
}

// ── Collapsible position group ────────────────

function PositionGroup({
  pos,
  group,
  isGK,
  stats,
  updateStat,
}: {
  pos: string;
  group: Player[];
  isGK: boolean;
  stats: StatsMap;
  updateStat: (playerId: string, field: string, value: number | boolean) => void;
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
        <span
          className="font-display font-black uppercase tracking-widest text-foreground/90"
          style={{ fontSize: "1.1rem" }}
        >
          {pos}s &nbsp;
          <span className="font-normal text-muted-foreground/60">
            {group.length}
          </span>
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
                    className="w-5 h-5 rounded cursor-pointer accent-brand"
                  />
                </div>

                {/* Mins */}
                <StatInput
                  value={row.mins}
                  onChange={(v) => updateStat(p.id, "mins", v)}
                />

                {isGK && isGKRow(row) ? (
                  <>
                    <StatInput value={row.goals_against} onChange={(v) => updateStat(p.id, "goals_against", v)} />
                    <StatInput value={row.saves}         onChange={(v) => updateStat(p.id, "saves", v)} />
                    <StatInput value={row.clean_sheets}  onChange={(v) => updateStat(p.id, "clean_sheets", v)} />
                    <StatInput value={row.yellow}        onChange={(v) => updateStat(p.id, "yellow", v)} />
                    <StatInput value={row.red}           onChange={(v) => updateStat(p.id, "red", v)} />
                  </>
                ) : !isGKRow(row) ? (
                  <>
                    <StatInput value={row.goals}          onChange={(v) => updateStat(p.id, "goals", v)} />
                    <StatInput value={row.assists}         onChange={(v) => updateStat(p.id, "assists", v)} />
                    <StatInput value={row.tackles}         onChange={(v) => updateStat(p.id, "tackles", v)} />
                    <StatInput value={row.offsides}        onChange={(v) => updateStat(p.id, "offsides", v)} />
                    <StatInput value={row.fouls}           onChange={(v) => updateStat(p.id, "fouls", v)} />
                    <StatInput value={row.fouls_suffered}  onChange={(v) => updateStat(p.id, "fouls_suffered", v)} />
                    <StatInput value={row.yellow}          onChange={(v) => updateStat(p.id, "yellow", v)} />
                    <StatInput value={row.red}             onChange={(v) => updateStat(p.id, "red", v)} />
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
