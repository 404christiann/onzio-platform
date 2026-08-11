"use client";

import { useClubId } from "@/components/ClubContextProvider";

import { useEffect, useRef, useState, useMemo } from "react";
import { Chart, registerables } from "chart.js";
import { fetchRoster, fetchPlayerMatchTrend, PlayerMatchTrendPoint } from "@/lib/queries";
import { Player, GoalkeeperStats, FieldStats } from "@/lib/data";
import ResilientNativeImage from "@/components/ResilientNativeImage";

Chart.register(...registerables);

// ── Constants ──────────────────────────────────

type PositionKey = "All" | "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
const POSITIONS: PositionKey[] = ["All", "Goalkeeper", "Defender", "Midfielder", "Forward"];

// ── Chart theme ────────────────────────────────
// Shared chart.js styling for the ComparisonBar and TrendLine charts below.
// chart.js needs concrete CSS color/font values (it can't consume Tailwind
// classes), so every colour here is kept in sync manually with the semantic
// CSS variables in styles/globals.css (`.dark` block); the token each value
// mirrors is noted inline. All DOM styling on this page uses the token
// classes directly.

// Existing chart configs set no font family (chart.js default); resolve the
// admin portal's body font from the DOM so canvas text matches the page.
const CHART_FONT_FAMILY =
  typeof document !== "undefined"
    ? getComputedStyle(document.body).fontFamily || "Arial, sans-serif"
    : "Arial, sans-serif";

const CHART_THEME = {
  accent: "hsl(0 72% 51%)", // = `.dark` --destructive (primary series colour)
  accentFill: "hsl(0 72% 51% / 0.8)", // bar fill for the "player" series
  accentSoft: "hsl(0 72% 51% / 0.09)", // translucent area fill under the trend line
  comparison: "hsl(0 0% 98% / 0.1)", // = --foreground @ 10%; "position average" series
  grid: "hsl(0 0% 98% / 0.06)", // = --foreground @ 6%; horizontal grid lines
  tick: "hsl(0 0% 98% / 0.4)", // = --foreground @ 40%; axis tick/label colour
  font: { family: CHART_FONT_FAMILY, size: 10 },
  tooltip: {
    backgroundColor: "hsl(0 0% 10%)", // = `.dark` --card
    borderColor: "hsl(0 0% 22%)", // = `.dark` --border
    borderWidth: 1,
    titleColor: "hsl(0 0% 98%)", // = `.dark` --foreground
    bodyColor: "hsl(0 0% 98% / 0.7)", // = --foreground @ 70%
  },
};

// Shared axis config — charts spread these and layer chart-specific overrides
// (e.g. tick rotation, step size) on top.
const CHART_AXES = {
  x: {
    ticks: { color: CHART_THEME.tick, font: CHART_THEME.font },
    grid: { display: false },
    border: { display: false },
  },
  y: {
    ticks: { color: CHART_THEME.tick, font: CHART_THEME.font },
    grid: { color: CHART_THEME.grid },
    border: { display: false },
  },
};

// ── Helpers ────────────────────────────────────

function isGK(stats: GoalkeeperStats | FieldStats): stats is GoalkeeperStats {
  return "saves" in stats;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function avgRaw(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Main page ──────────────────────────────────

export default function AnalyticsPage() {
  const clubId = useClubId();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [seasonLabel, setSeasonLabel] = useState("2025–26");
  const [loading, setLoading] = useState(true);
  const [posFilter, setPosFilter] = useState<PositionKey>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoster(undefined, clubId).then(({ goalkeepers, defenders, midfielders, forwards, seasonLabel: sl }) => {
      const all = [...goalkeepers, ...defenders, ...midfielders, ...forwards];
      setAllPlayers(all);
      setSeasonLabel(sl);
      if (all.length > 0) setSelectedId(all[0].id ?? null);
      setLoading(false);
    });
  }, [clubId]);

  const filtered = useMemo(() => {
    if (posFilter === "All") return allPlayers;
    return allPlayers.filter((p) => p.position === posFilter);
  }, [allPlayers, posFilter]);

  // Auto-select first player when filter changes
  useEffect(() => {
    if (filtered.length > 0) setSelectedId(filtered[0].id ?? null);
  }, [posFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const player = filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-display text-sm tracking-widest uppercase text-muted-foreground">
          Loading analytics…
        </p>
      </div>
    );
  }

  if (!allPlayers.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-display text-sm tracking-widest uppercase text-muted-foreground">
          No players found.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase text-foreground leading-none"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Analytics
        </h1>
        <p className="font-body mt-1 text-muted-foreground" style={{ fontSize: "1rem" }}>
          {seasonLabel} · Player performance dashboard
        </p>
      </div>

      {/* Position filter tabs — old style, full names */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`font-display font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border transition-all duration-150 ${
              posFilter === pos
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
            style={{ fontSize: "0.9rem" }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Responsive layout: stacked on mobile, sidebar+main on desktop */}
      <div className="flex flex-col lg:flex-row gap-5" style={{ alignItems: "start" }}>

        {/* Player list — horizontal scroll on mobile, vertical sidebar on desktop */}
        <div className="w-full lg:w-52 flex-shrink-0">
          {/* Mobile: horizontal scrollable strip */}
          <div className="flex lg:hidden overflow-x-auto gap-2 pb-2" style={{ WebkitOverflowScrolling: "touch" }}>
            {filtered.map((p) => {
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id ?? p.name}
                  onClick={() => p.id && setSelectedId(p.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 rounded-xl border transition-all duration-150 ${
                    active
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-border bg-card"
                  }`}
                  style={{ padding: "10px 14px", minWidth: 72 }}
                >
                  <div className={`rounded-full overflow-hidden flex-shrink-0 border-2 ${active ? "border-destructive" : "border-transparent"}`} style={{ width: 48, height: 48 }}>
                    {p.image ? (
                      <ResilientNativeImage src={p.image} alt={p.name} fallbackVariant="person" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center font-display font-black ${active ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`} style={{ fontSize: "0.75rem" }}>
                        {initials(p.name)}
                      </div>
                    )}
                  </div>
                  <span
                    className={`font-display font-black uppercase ${active ? "text-foreground" : "text-muted-foreground"}`}
                    style={{ fontSize: "0.55rem", letterSpacing: "0.05em", whiteSpace: "nowrap" }}
                  >
                    #{p.number}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical pill list */}
          <div className="hidden lg:flex flex-col gap-1.5">
            {filtered.map((p) => {
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id ?? p.name}
                  onClick={() => p.id && setSelectedId(p.id)}
                  className={`flex items-center gap-3 w-full text-left rounded-xl border transition-all duration-150 ${
                    active
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-border bg-transparent"
                  }`}
                  style={{ padding: "10px 12px" }}
                >
                  <div className={`rounded-full overflow-hidden flex-shrink-0 border-2 ${active ? "border-destructive" : "border-border"}`} style={{ width: 48, height: 48 }}>
                    {p.image ? (
                      <ResilientNativeImage src={p.image} alt={p.name} fallbackVariant="person" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center font-display font-black ${active ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`} style={{ fontSize: "0.75rem" }}>
                        {initials(p.name)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-display font-black uppercase truncate leading-none ${active ? "text-foreground" : "text-muted-foreground"}`}
                      style={{ fontSize: "0.9rem" }}
                    >
                      {p.name}
                    </p>
                    <p
                      className={`font-display mt-0.5 ${active ? "text-destructive" : "text-muted-foreground"}`}
                      style={{ fontSize: "0.6rem", letterSpacing: "0.06em" }}
                    >
                      #{p.number} · {p.position.slice(0, 3).toUpperCase()}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main dashboard */}
        <div className="flex-1 min-w-0">
          {player ? (
            <PlayerDashboard
              key={player.id ?? player.name}
              player={player}
              allPlayers={allPlayers}
              seasonLabel={seasonLabel}
              clubId={clubId}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="font-display text-sm tracking-widest uppercase text-muted-foreground">
                Select a player
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Player Dashboard ───────────────────────────

function PlayerDashboard({
  player,
  allPlayers,
  seasonLabel,
  clubId,
}: {
  player: Player;
  allPlayers: Player[];
  seasonLabel: string;
  clubId: string;
}) {
  const gk    = isGK(player.stats);
  const stats = player.stats;

  // Trend data
  const [trend, setTrend]               = useState<PlayerMatchTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    if (!player.id) { setTrend([]); setTrendLoading(false); return; }
    setTrendLoading(true);
    fetchPlayerMatchTrend(player.id, gk, undefined, clubId)
      .then((data) => { setTrend(data); setTrendLoading(false); })
      .catch(() => { setTrend([]); setTrendLoading(false); });
  }, [clubId, player.id, gk]);

  // ── KPIs ──────────────────────────────────────
  const kpis = useMemo(() => {
    if (gk) {
      const s     = stats as GoalkeeperStats;
      const peers = allPlayers.filter((p) => isGK(p.stats)).map((p) => p.stats as GoalkeeperStats);
      const avgSaves = avg(peers.map((p) => p.saves));
      const avgCS    = avg(peers.map((p) => p.cleanSheets));
      return [
        { label: "Saves",         value: s.saves,        delta: s.saves > avgSaves ? `+${s.saves - avgSaves} vs avg` : `Avg: ${avgSaves}` },
        { label: "Clean Sheets",  value: s.cleanSheets,  delta: s.cleanSheets > avgCS ? `+${s.cleanSheets - avgCS} vs avg` : `Avg: ${avgCS}` },
        { label: "Goals Against", value: s.goalsAgainst, delta: `${s.starts} starts` },
        { label: "Minutes",       value: s.mins,         delta: s.starts > 0 ? `${Math.round(s.mins / s.starts)} min/game` : "—" },
      ];
    } else {
      const s     = stats as FieldStats;
      const peers = allPlayers.filter((p) => !isGK(p.stats)).map((p) => p.stats as FieldStats);
      const avgGoals   = avg(peers.map((p) => p.goals));
      const avgAssists = avg(peers.map((p) => p.assists));
      const teamMax    = Math.max(...peers.map((p) => p.goals), 1);
      return [
        { label: "Goals",   value: s.goals,   delta: s.goals === teamMax ? "Team high" : s.goals > avgGoals ? `+${s.goals - avgGoals} vs avg` : `Avg: ${avgGoals}` },
        { label: "Assists", value: s.assists,  delta: s.assists > avgAssists ? `+${s.assists - avgAssists} vs avg` : `Avg: ${avgAssists}` },
        { label: "Starts",  value: s.starts,   delta: s.starts > 0 ? `${Math.round(s.mins / s.starts)} min/game` : "—" },
        { label: "Minutes", value: s.mins,     delta: `${Math.round((s.starts / Math.max(...allPlayers.map((p) => p.stats.starts), 1)) * 100)}% availability` },
      ];
    }
  }, [player, allPlayers, gk, stats]);

  // ── Radar ──────────────────────────────────────
  const radarData = useMemo(() => {
    const norm = (val: number, max: number) =>
      Math.round(Math.min(100, (val / Math.max(max, 1)) * 100));

    if (gk) {
      const s     = stats as GoalkeeperStats;
      const peers = allPlayers.filter((p) => isGK(p.stats)).map((p) => p.stats as GoalkeeperStats);
      const mxSaves = Math.max(...peers.map((p) => p.saves), 1);
      const mxCS    = Math.max(...peers.map((p) => p.cleanSheets), 1);
      const mxMins  = Math.max(...peers.map((p) => p.mins), 1);
      const mxStart = Math.max(...peers.map((p) => p.starts), 1);
      const disc    = (p: GoalkeeperStats) => Math.max(0, 100 - p.yellow * 15 - p.red * 30);
      return {
        labels: ["Reflexes", "Clean Sheets", "Availability", "Discipline", "Starts"],
        player: [norm(s.saves, mxSaves), norm(s.cleanSheets, mxCS), norm(s.mins, mxMins), disc(s), norm(s.starts, mxStart)],
        posAvg: [
          norm(avgRaw(peers.map((p) => p.saves)), mxSaves),
          norm(avgRaw(peers.map((p) => p.cleanSheets)), mxCS),
          norm(avgRaw(peers.map((p) => p.mins)), mxMins),
          Math.round(avgRaw(peers.map(disc))),
          norm(avgRaw(peers.map((p) => p.starts)), mxStart),
        ],
      };
    } else {
      const s     = stats as FieldStats;
      const peers = allPlayers.filter((p) => !isGK(p.stats)).map((p) => p.stats as FieldStats);
      const mxG   = Math.max(...peers.map((p) => p.goals), 1);
      const mxA   = Math.max(...peers.map((p) => p.assists), 1);
      const mxT   = Math.max(...peers.map((p) => p.tackles), 1);
      const mxM   = Math.max(...peers.map((p) => p.mins), 1);
      const disc  = (p: FieldStats) => Math.max(0, 100 - p.yellow * 15 - p.red * 30);
      return {
        labels: ["Scoring", "Creativity", "Defending", "Stamina", "Discipline"],
        player: [norm(s.goals, mxG), norm(s.assists, mxA), norm(s.tackles, mxT), norm(s.mins, mxM), disc(s)],
        posAvg: [
          norm(avgRaw(peers.map((p) => p.goals)), mxG),
          norm(avgRaw(peers.map((p) => p.assists)), mxA),
          norm(avgRaw(peers.map((p) => p.tackles)), mxT),
          norm(avgRaw(peers.map((p) => p.mins)), mxM),
          Math.round(avgRaw(peers.map(disc))),
        ],
      };
    }
  }, [player, allPlayers, gk, stats]);

  // ── Comparison bar ─────────────────────────────
  const comparisonData = useMemo(() => {
    if (gk) {
      const s     = stats as GoalkeeperStats;
      const peers = allPlayers.filter((p) => isGK(p.stats)).map((p) => p.stats as GoalkeeperStats);
      return {
        labels: ["Saves", "Clean Sheets", "Starts", "Mins / 10"],
        player: [s.saves, s.cleanSheets, s.starts, Math.round(s.mins / 10)],
        posAvg: [avg(peers.map((p) => p.saves)), avg(peers.map((p) => p.cleanSheets)), avg(peers.map((p) => p.starts)), Math.round(avg(peers.map((p) => p.mins)) / 10)],
      };
    } else {
      const s     = stats as FieldStats;
      const peers = allPlayers.filter((p) => !isGK(p.stats)).map((p) => p.stats as FieldStats);
      return {
        labels: ["Goals", "Assists", "Tackles", "Starts"],
        player: [s.goals, s.assists, s.tackles, s.starts],
        posAvg: [avg(peers.map((p) => p.goals)), avg(peers.map((p) => p.assists)), avg(peers.map((p) => p.tackles)), avg(peers.map((p) => p.starts))],
      };
    }
  }, [player, allPlayers, gk, stats]);

  const disciplineScore = Math.max(0, 100 - stats.yellow * 15 - stats.red * 30);

  return (
    <div className="flex flex-col gap-4">

      {/* Player header */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-background px-5 py-4">
        <div className="rounded-xl overflow-hidden flex-shrink-0 border-2 border-destructive" style={{ width: 96, height: 96 }}>
          {player.image ? (
            <ResilientNativeImage src={player.image} alt={player.name} fallbackVariant="person" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-display font-black bg-destructive text-destructive-foreground" style={{ fontSize: "1.5rem" }}>
              {initials(player.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black uppercase text-foreground" style={{ fontSize: "1.6rem", lineHeight: 1.1 }}>
            {player.name}
          </p>
          <p className="font-display tracking-widest uppercase mt-1 text-muted-foreground" style={{ fontSize: "0.85rem" }}>
            {player.position} · #{player.number} · {seasonLabel}
          </p>
        </div>
        <span
          className="font-display font-black select-none flex-shrink-0 text-foreground/5"
          style={{ fontSize: "3.5rem", lineHeight: 1 }}
        >
          {player.number}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-border bg-background px-4 py-4 text-center"
          >
            <p className="font-display font-black text-foreground" style={{ fontSize: "2rem", lineHeight: 1 }}>
              {k.value.toLocaleString()}
            </p>
            <p className="font-display text-xs tracking-widest uppercase mt-1 text-muted-foreground">
              {k.label}
            </p>
            <p className="font-body text-xs mt-2 text-destructive">
              {k.delta}
            </p>
          </div>
        ))}
      </div>

      {/* Radar + bar chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RadarCard labels={radarData.labels} playerVals={radarData.player} avgVals={radarData.posAvg} />
        <ComparisonBar data={comparisonData} />
      </div>

      {/* Trend line */}
      <TrendLine data={trend} loading={trendLoading} gk={gk} />

      {/* Discipline */}
      <div className="rounded-xl border border-border bg-background px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">
            Discipline
          </p>
          <span
            className={`font-display font-black uppercase tracking-widest rounded-full ${
              disciplineScore >= 85
                ? "bg-success/15 text-success"
                : disciplineScore >= 60
                  ? "bg-warning/15 text-warning"
                  : "bg-destructive/15 text-destructive"
            }`}
            style={{ fontSize: "0.6rem", padding: "3px 10px" }}
          >
            {disciplineScore >= 85 ? "Clean" : disciplineScore >= 60 ? "Caution" : "High Risk"} · {disciplineScore}/100
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="bg-warning" style={{ width: 12, height: 12, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
            <span className="font-display font-black text-foreground" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{stats.yellow}</span>
            <span className="text-muted-foreground" style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginLeft: 2 }}>Yellow</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-destructive" style={{ width: 12, height: 12, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
            <span className="font-display font-black text-foreground" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{stats.red}</span>
            <span className="text-muted-foreground" style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginLeft: 2 }}>Red</span>
          </div>
          <div className="flex-1">
            <div className="bg-muted" style={{ height: 4, borderRadius: 2, overflow: "hidden" }}>
              <div
                className={
                  disciplineScore >= 85 ? "bg-success" : disciplineScore >= 60 ? "bg-warning" : "bg-destructive"
                }
                style={{
                  width: `${disciplineScore}%`, height: "100%", borderRadius: 2,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Radar Card ─────────────────────────────────

function RadarCard({
  labels,
  playerVals,
  avgVals,
}: {
  labels: string[];
  playerVals: number[];
  avgVals: number[];
}) {
  const cx = 110, cy = 110, r = 78, n = labels.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt    = (i: number, scale: number) => [
    cx + scale * r * Math.cos(angle(i)),
    cy + scale * r * Math.sin(angle(i)),
  ];
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, Math.max(v, 2) / 100).join(",")).join(" ");

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">
          Player profile
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span className="bg-muted-foreground/50" style={{ width: 18, height: 1.5, display: "inline-block", borderRadius: 1 }} />
            Pos avg
          </span>
          <span className="flex items-center gap-1.5 text-destructive" style={{ fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span className="bg-destructive" style={{ width: 18, height: 2, display: "inline-block", borderRadius: 1 }} />
            Player
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <svg viewBox="-10 -10 240 240" width="170" height="170" role="img" aria-label="Radar chart showing player profile vs position average">
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <polygon key={s} points={labels.map((_, i) => pt(i, s).join(",")).join(" ")} className="fill-none stroke-border" strokeWidth="0.5" />
          ))}
          {labels.map((_, i) => {
            const [x, y] = pt(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-border" strokeWidth="0.5" />;
          })}
          <polygon points={poly(avgVals)} className="fill-card stroke-muted-foreground/50" strokeWidth="1.5" strokeDasharray="4,3" />
          <polygon points={poly(playerVals)} className="fill-destructive/15 stroke-destructive" strokeWidth="2" />
          {playerVals.map((v, i) => {
            const [x, y] = pt(i, Math.max(v, 2) / 100);
            return <circle key={i} cx={x} cy={y} r="3.5" className="fill-destructive" />;
          })}
          {labels.map((l, i) => {
            const [x, y] = pt(i, 1.36);
            return (
              <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize="9" fontFamily="sans-serif">
                {l}
              </text>
            );
          })}
        </svg>

        <div className="flex flex-col gap-2.5 flex-1">
          {labels.map((l, i) => (
            <div key={l} className="flex items-center gap-2">
              <span className="text-muted-foreground" style={{ fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", width: 60, flexShrink: 0 }}>
                {l}
              </span>
              <div className="bg-muted" style={{ flex: 1, height: 3, borderRadius: 2, overflow: "visible", position: "relative" }}>
                <div className="bg-muted-foreground/50" style={{ position: "absolute", top: -1, bottom: -1, left: `${avgVals[i]}%`, width: 2, transform: "translateX(-50%)", borderRadius: 1 }} />
                <div className="bg-destructive" style={{ width: `${playerVals[i]}%`, height: "100%", borderRadius: 2 }} />
              </div>
              <span className="font-display font-black text-foreground" style={{ fontSize: "0.68rem", width: 24, textAlign: "right", flexShrink: 0 }}>
                {playerVals[i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Comparison Bar ─────────────────────────────

function ComparisonBar({ data }: { data: { labels: string[]; player: number[]; posAvg: number[] } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          { label: "Player",   data: data.player, backgroundColor: CHART_THEME.accentFill, borderRadius: 4, barPercentage: 0.55 },
          { label: "Pos. avg", data: data.posAvg, backgroundColor: CHART_THEME.comparison, borderRadius: 4, barPercentage: 0.55 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...CHART_THEME.tooltip } },
        scales: {
          x: { ...CHART_AXES.x },
          y: { ...CHART_AXES.y },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">
          vs position average
        </p>
        <div className="flex gap-3">
          {[{ label: "Player", swatchClass: "bg-destructive/80" }, { label: "Pos avg", swatchClass: "bg-muted-foreground/30" }].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span className={l.swatchClass} style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block" }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", height: 175 }}>
        <canvas ref={canvasRef} role="img" aria-label="Bar chart comparing player stats vs position average">
          Player vs position average comparison.
        </canvas>
      </div>
    </div>
  );
}

// ── Trend Line ─────────────────────────────────

function TrendLine({
  data,
  loading,
  gk,
}: {
  data: PlayerMatchTrendPoint[];
  loading: boolean;
  gk: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);
  const metric    = gk ? "Saves" : "G+A";

  useEffect(() => {
    if (loading || data.length < 2 || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.map((d) => d.opponent),
        datasets: [{
          label: metric,
          data: data.map((d) => d.value),
          borderColor: CHART_THEME.accent,
          backgroundColor: CHART_THEME.accentSoft,
          pointBackgroundColor: CHART_THEME.accent,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...CHART_THEME.tooltip,
            callbacks: {
              title: (items) => data[items[0].dataIndex]?.opponent ?? "",
              label: (ctx)   => ` ${metric}: ${ctx.parsed.y}  ·  ${data[ctx.dataIndex]?.mins ?? 0} min`,
            },
          },
        },
        scales: {
          x: { ...CHART_AXES.x, ticks: { ...CHART_AXES.x.ticks, maxRotation: 30 } },
          y: { ...CHART_AXES.y, min: 0, ticks: { ...CHART_AXES.y.ticks, stepSize: 1 } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data, loading, metric]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">
          {gk ? "Saves per match" : "Goal contributions per match"}
        </p>
        {data.length > 0 && !loading && (
          <span className="text-muted-foreground" style={{ fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {data.length} match{data.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: 130 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">Loading…</p>
          </div>
        ) : data.length < 2 ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-display text-xs tracking-widest uppercase text-muted-foreground">
              {data.length === 0 ? "No match data yet" : "Need 2+ matches for trend"}
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} role="img" aria-label={`Line chart showing ${metric} trend over matches`}>
            {metric} trend over recent matches.
          </canvas>
        )}
      </div>
    </div>
  );
}
