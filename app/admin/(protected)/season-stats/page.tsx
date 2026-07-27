"use client";

import { useEffect, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { createClient } from "@/lib/admin-client";
import { useSeasons } from "@/lib/use-seasons";

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

  return (
    <div className="max-w-5xl mx-auto">
      <AdminSaveFeedback saving={saving} saved={saved} />
      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1
            className="font-display font-black uppercase text-white leading-none"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
          >
            Season Stats
          </h1>
          <p className="font-body mt-1" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}>
            Edit season totals for each player. Changes apply to the public roster page.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4 flex-shrink-0">
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
            className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-white"
            style={{ fontSize: "1.1rem", backgroundColor: "#dc2626", opacity: saving || !hasChanges || !selectedSeasonId ? 0.4 : 1, cursor: saving || !hasChanges || !selectedSeasonId ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>

      {error && (
        <p className="font-body text-sm mb-4" style={{ color: "#dc2626" }}>Error: {error}</p>
      )}

      {loading || seasonsLoading ? (
        <p className="font-display text-sm tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading…
        </p>
      ) : !selectedSeasonId ? (
        <p className="font-body text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Create a season before editing season stats.
        </p>
      ) : players.length === 0 ? (
        <p className="font-body text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          No players are assigned to this season.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {POSITIONS.map((pos) => {
            const group = players.filter((p) => p.position === pos);
            if (group.length === 0) return null;
            const isGKPos = pos === "Goalkeeper";
            const headers = isGKPos
              ? ["#", "Name", "GA", "Saves", "CS", "Starts", "Y", "R", "Mins"]
              : ["#", "Name", "Goals", "Ast", "Tackles", "OFF", "F", "FS", "Starts", "Y", "R", "Mins"];
            const gridCols = isGKPos
              ? "48px 1fr 64px 64px 64px 64px 52px 52px 72px"
              : "48px 1fr 64px 64px 72px 56px 56px 56px 64px 52px 52px 72px";

            return (
              <div key={pos} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                {/* Position header */}
                <div className="px-4 py-3" style={{ backgroundColor: "#161616" }}>
                  <span className="font-display font-black uppercase tracking-widest" style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.9)" }}>
                    {pos}s{" "}
                    <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>{group.length}</span>
                  </span>
                </div>

                {/* Horizontally scrollable on mobile */}
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ minWidth: 600 }}>

                {/* Column headers */}
                <div
                  className="grid gap-2 px-4 py-2"
                  style={{ gridTemplateColumns: gridCols, backgroundColor: "#111111", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {headers.map((h) => (
                    <span
                      key={h}
                      className="font-display font-bold uppercase text-center"
                      style={{ fontSize: "0.75rem", letterSpacing: "0.08em", color: "rgba(255,255,255,0.9)" }}
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
                      className="grid gap-2 items-center px-4 py-2"
                      style={{
                        gridTemplateColumns: gridCols,
                        backgroundColor: i % 2 === 0 ? "#0f0f0f" : "#111111",
                        borderBottom: i < group.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      {/* # */}
                      <span className="font-display font-bold text-center" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}>
                        {p.number}
                      </span>

                      {/* Name */}
                      <span className="font-body truncate" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.85)" }}>
                        {p.name}
                      </span>

                      {/* Stat inputs */}
                      {isGKPos && isGK(s) ? (
                        <>
                          <StatInput value={s.goals_against} onChange={(v) => updateStat(p.id, "goals_against", v)} />
                          <StatInput value={s.saves}         onChange={(v) => updateStat(p.id, "saves", v)} />
                          <StatInput value={s.clean_sheets}  onChange={(v) => updateStat(p.id, "clean_sheets", v)} />
                          <StatInput value={s.starts}        onChange={(v) => updateStat(p.id, "starts", v)} />
                          <StatInput value={s.yellow}        onChange={(v) => updateStat(p.id, "yellow", v)} />
                          <StatInput value={s.red}           onChange={(v) => updateStat(p.id, "red", v)} />
                          <StatInput value={s.mins}          onChange={(v) => updateStat(p.id, "mins", v)} />
                        </>
                      ) : !isGK(s) ? (
                        <>
                          <StatInput value={s.goals}          onChange={(v) => updateStat(p.id, "goals", v)} />
                          <StatInput value={s.assists}         onChange={(v) => updateStat(p.id, "assists", v)} />
                          <StatInput value={s.tackles}         onChange={(v) => updateStat(p.id, "tackles", v)} />
                          <StatInput value={s.offsides}        onChange={(v) => updateStat(p.id, "offsides", v)} />
                          <StatInput value={s.fouls}           onChange={(v) => updateStat(p.id, "fouls", v)} />
                          <StatInput value={s.fouls_suffered}  onChange={(v) => updateStat(p.id, "fouls_suffered", v)} />
                          <StatInput value={s.starts}          onChange={(v) => updateStat(p.id, "starts", v)} />
                          <StatInput value={s.yellow}          onChange={(v) => updateStat(p.id, "yellow", v)} />
                          <StatInput value={s.red}             onChange={(v) => updateStat(p.id, "red", v)} />
                          <StatInput value={s.mins}            onChange={(v) => updateStat(p.id, "mins", v)} />
                        </>
                      ) : null}
                    </div>
                  );
                })}
                  </div> {/* end minWidth */}
                </div> {/* end overflow-x */}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stat input ────────────────────────────────

function StatInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      className="w-full rounded text-center font-display font-bold text-white outline-none"
      style={{
        fontSize: "1rem",
        backgroundColor: "#0e0e0e",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "6px 2px",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(220,38,38,0.5)")}
      onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
    />
  );
}
