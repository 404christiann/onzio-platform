"use client";

import { useClubId } from "@/components/ClubContextProvider";

import { useEffect, useRef, useState, useMemo } from "react";
import { Chart, registerables } from "chart.js";
import {
  fetchRoster,
  fetchPlayerMatchTrend,
  type PlayerMatchTrendPoint,
} from "@/lib/queries";
import type { Player, GoalkeeperStats, FieldStats } from "@/lib/data";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { AdminBar } from "@/components/admin/ui/AdminBar";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import styles from "./analytics/classic-analytics.module.css";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageToolbar,
  AdminPanel,
} from "@/components/admin/AdminPage";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import type { AdminTheme } from "@/lib/admin-theme";

Chart.register(...registerables);

// ── Constants ──────────────────────────────────

type PositionKey = "All" | "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
const POSITIONS: PositionKey[] = ["All", "Goalkeeper", "Defender", "Midfielder", "Forward"];
const POSITION_LABELS: Record<PositionKey, string> = { All: "All", Goalkeeper: "GK", Defender: "DF", Midfielder: "MF", Forward: "FW" };

// Chart.js needs concrete colours rather than Tailwind classes. Resolve the
// protected wrapper's current semantic tokens whenever the explicit admin
// theme changes so canvas content stays in lockstep with the DOM presentation.
type AdminChartTheme = {
  accent: string;
  accentSoft: string;
  grid: string;
  tick: string;
  font: { family: string; size: number };
  tooltip: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    titleColor: string;
    bodyColor: string;
  };
};

function cssTokenColor(
  styles: CSSStyleDeclaration,
  token: string,
  fallback: string,
  alpha?: number,
): string {
  const value = styles.getPropertyValue(token).trim();
  if (!value) return fallback;
  return `hsl(${value}${alpha === undefined ? "" : ` / ${alpha}`})`;
}

function resolveChartTheme(
  canvas: HTMLCanvasElement,
  theme: AdminTheme,
): AdminChartTheme {
  const styles = getComputedStyle(canvas);
  const dark = theme === "dark";
  return {
    accent: cssTokenColor(
      styles,
      "--primary",
      dark ? "hsl(230 86% 70%)" : "hsl(231 74% 59%)",
    ),
    accentSoft: cssTokenColor(
      styles,
      "--primary",
      dark ? "hsl(230 86% 70% / 0.12)" : "hsl(231 74% 59% / 0.12)",
      0.12,
    ),
    grid: cssTokenColor(
      styles,
      "--border",
      dark ? "hsl(217 20% 23% / 0.75)" : "hsl(220 18% 88% / 0.75)",
      0.75,
    ),
    tick: cssTokenColor(
      styles,
      "--muted-foreground",
      dark ? "hsl(215 16% 65%)" : "hsl(220 9% 46%)",
    ),
    font: {
      family: styles.fontFamily || "Arial, sans-serif",
      size: 11,
    },
    tooltip: {
      backgroundColor: cssTokenColor(
        styles,
        "--card",
        dark ? "hsl(222 35% 11%)" : "hsl(0 0% 100%)",
      ),
      borderColor: cssTokenColor(
        styles,
        "--border",
        dark ? "hsl(217 20% 23%)" : "hsl(220 18% 88%)",
      ),
      borderWidth: 1,
      titleColor: cssTokenColor(
        styles,
        "--card-foreground",
        dark ? "hsl(210 40% 98%)" : "hsl(222 47% 11%)",
      ),
      bodyColor: cssTokenColor(
        styles,
        "--muted-foreground",
        dark ? "hsl(215 16% 65%)" : "hsl(220 9% 46%)",
      ),
    },
  };
}

function chartAxes(theme: AdminChartTheme) {
  return {
    x: {
      ticks: { color: theme.tick, font: theme.font },
      grid: { display: false },
      border: { display: false },
    },
    y: {
      ticks: { color: theme.tick, font: theme.font },
      grid: { color: theme.grid },
      border: { display: false },
    },
  };
}

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

// KPI delta strings aren't a typed +/- value -- they're phrases like
// "+2 vs avg", "Avg: 4", "3 starts", "Team high", or "—". Classify the
// phrasing itself so the color reflects the same comparison the text
// already communicates, without changing any KPI value or copy.
type DeltaTone = "positive" | "negative" | "neutral";

function deltaTone(delta: string): DeltaTone {
  if (delta.startsWith("+") || delta === "Team high") return "positive";
  if (delta.startsWith("Avg:")) return "negative";
  return "neutral";
}

const DELTA_TONE_CLASSES: Record<DeltaTone, string> = {
  positive: "text-success",
  negative: "text-warning-ink",
  neutral: "text-muted-foreground",
};

// ── Main page ──────────────────────────────────

export default function ClassicAnalyticsPage() {
  const clubId = useClubId();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [posFilter, setPosFilter] = useState<PositionKey>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchRoster(undefined, clubId, { includeActivePlayersWithoutSeasonStats: true })
      .then(
        ({
          goalkeepers,
          defenders,
          midfielders,
          forwards,
          seasonLabel: nextSeasonLabel,
        }) => {
          if (!active) return;
          const all = [
            ...goalkeepers,
            ...defenders,
            ...midfielders,
            ...forwards,
          ];
          setAllPlayers(all);
          setSeasonLabel(nextSeasonLabel);
          setSelectedId(all[0]?.id ?? null);
          setLoading(false);
        },
      )
      .catch(() => {
        if (!active) return;
        setAllPlayers([]);
        setSelectedId(null);
        setLoadError("Player analytics could not be loaded.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clubId, loadAttempt]);

  const filtered = useMemo(() => {
    if (posFilter === "All") return allPlayers;
    return allPlayers.filter((p) => p.position === posFilter);
  }, [allPlayers, posFilter]);

  useEffect(() => {
    if (!filtered.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const player = filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  if (loadError) {
    return (
      <AdminPage>
        <AdminPageHeader
          eyebrow="Performance"
          title="Analytics"
          description="Player performance, peer comparisons, and match trends."
        />
        <AdminPanel className="flex min-h-64 flex-col items-center justify-center text-center">
          <h2 className="text-base font-semibold text-foreground">
            Analytics unavailable
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {loadError} Check the connection and try again.
          </p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="admin-press min-h-11 mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
          >
            Try again
          </button>
        </AdminPanel>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Performance"
        title="Analytics"
        description={<span className={styles.subtitle}>{seasonLabel ? `${seasonLabel} season · ` : ""}Compare player output, position benchmarks, and recent match trends.</span>}
      />

      <ShimmerRegion loading={loading} skeleton={<AnalyticsSkeleton />} minHeight={0} loadingLabel="Loading analytics">
      {!allPlayers.length ? (
        <AdminPanel className="flex min-h-64 flex-col items-center justify-center text-center">
          <h2 className="text-base font-semibold text-foreground">No players found</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Add active players to the roster to begin comparing season performance.</p>
        </AdminPanel>
      ) : <div className={styles.workspace}>
      <AdminPageToolbar>
        <div>
          <p className="text-sm font-semibold text-foreground">Position group</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Narrow the roster without changing the season comparison.
          </p>
        </div>
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1"
          role="group"
          aria-label="Filter players by position"
        >
          {POSITIONS.map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => setPosFilter(position)}
              aria-pressed={posFilter === position}
              aria-label={position}
              className={`admin-press min-h-11 flex-none rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none ${
                posFilter === position
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
            >
              {POSITION_LABELS[position]}
            </button>
          ))}
        </div>
      </AdminPageToolbar>

      <div className={styles.columns}>
        <AdminPanel as="aside" className={styles.rail} aria-label="Players">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Players</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtered.length} in this view
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              {posFilter}
            </span>
          </div>

          {filtered.length > 0 ? (
            <div className={styles.players}>
            {filtered.map((p) => {
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id ?? p.name}
                  type="button"
                  onClick={() => p.id && setSelectedId(p.id)}
                  aria-pressed={active}
                  title={p.name}
                  className={`admin-press admin-press-row ${styles.player} flex min-h-14 flex-none items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none ${
                    active
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent bg-transparent hover:border-border hover:bg-accent"
                  }`}
                >
                  <div
                    className={`h-10 w-10 flex-none overflow-hidden rounded-full border ${
                      active ? "border-primary" : "border-border"
                    }`}
                  >
                    {p.image ? (
                      <ResilientNativeImage
                        src={p.image}
                        alt={p.name}
                        fallbackVariant="person"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "top",
                        }}
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center text-xs font-semibold ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {initials(p.name)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {p.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      #{p.number} · {POSITION_LABELS[p.position as PositionKey] ?? p.position}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm leading-6 text-muted-foreground">
              No {posFilter.toLowerCase()} players are available for this
              season.
            </p>
          )}
        </AdminPanel>

        <div className="min-w-0">
          {player ? (
            <PlayerDashboard
              player={player}
              allPlayers={allPlayers}
              seasonLabel={seasonLabel}
              clubId={clubId}
            />
          ) : (
            <AdminPanel className="flex min-h-64 items-center justify-center text-center">
              <p className="text-sm leading-6 text-muted-foreground">
                Choose a position group with players to view analytics.
              </p>
            </AdminPanel>
          )}
        </div>
      </div>
      </div>}
      </ShimmerRegion>
    </AdminPage>
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
  const [trend, setTrend] = useState<{ playerId: string | undefined; data: PlayerMatchTrendPoint[] }>({ playerId: undefined, data: [] });
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!player.id) {
      setTrend({ playerId: undefined, data: [] });
      setTrendLoading(false);
      return;
    }
    setTrendLoading(true);
    fetchPlayerMatchTrend(player.id, gk, undefined, clubId)
      .then((data) => {
        if (!active) return;
        setTrend({ playerId: player.id, data });
        setTrendLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTrend({ playerId: player.id, data: [] });
        setTrendLoading(false);
      });
    return () => { active = false; };
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
  }, [allPlayers, gk, stats]);

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
  }, [allPlayers, gk, stats]);

  // ── Comparison bar ─────────────────────────────
  const comparisonData = useMemo(() => {
    if (gk) {
      const s     = stats as GoalkeeperStats;
      const peers = allPlayers.filter((p) => isGK(p.stats)).map((p) => p.stats as GoalkeeperStats);
      return {
        labels: ["Saves", "Clean Sheets", "Starts", "Mins / 10"],
        max: [Math.max(...peers.map((p) => p.saves), 1), Math.max(...peers.map((p) => p.cleanSheets), 1), Math.max(...peers.map((p) => p.starts), 1), Math.max(...peers.map((p) => Math.round(p.mins / 10)), 1)],
        player: [s.saves, s.cleanSheets, s.starts, Math.round(s.mins / 10)],
        posAvg: [avg(peers.map((p) => p.saves)), avg(peers.map((p) => p.cleanSheets)), avg(peers.map((p) => p.starts)), Math.round(avg(peers.map((p) => p.mins)) / 10)],
      };
    } else {
      const s     = stats as FieldStats;
      const peers = allPlayers.filter((p) => !isGK(p.stats)).map((p) => p.stats as FieldStats);
      return {
        labels: ["Goals", "Assists", "Tackles", "Starts"],
        max: [Math.max(...peers.map((p) => p.goals), 1), Math.max(...peers.map((p) => p.assists), 1), Math.max(...peers.map((p) => p.tackles), 1), Math.max(...peers.map((p) => p.starts), 1)],
        player: [s.goals, s.assists, s.tackles, s.starts],
        posAvg: [avg(peers.map((p) => p.goals)), avg(peers.map((p) => p.assists)), avg(peers.map((p) => p.tackles)), avg(peers.map((p) => p.starts))],
      };
    }
  }, [allPlayers, gk, stats]);

  const disciplineScore = Math.max(0, 100 - stats.yellow * 15 - stats.red * 30);

  return (
    <div className={styles.dashboard} data-analytics-dashboard="">
      <AdminPanel className="flex items-center gap-4 sm:gap-5" data-analytics-part="summary">
        <div className="h-16 w-16 flex-none overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 sm:h-20 sm:w-20">
          {player.image ? (
            <ResilientNativeImage
              src={player.image}
              alt={player.name}
              fallbackVariant="person"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top",
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-lg font-semibold text-primary-foreground">
              {initials(player.name)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 title={player.name} className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {player.name}
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground" title={`#${player.number} · ${POSITION_LABELS[player.position]} · ${seasonLabel} season`}>
            #{player.number} · {POSITION_LABELS[player.position as PositionKey] ?? player.position} · {seasonLabel} season
          </p>
        </div>
      </AdminPanel>

      <div className={styles.kpis} data-analytics-part="metrics">
        {kpis.map((k) => (
          <AdminPanel key={k.label} className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {k.label}
            </p>
            <p className="mt-2 font-body text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {k.value.toLocaleString()}
            </p>
            <p className={`mt-2 text-xs leading-5 ${DELTA_TONE_CLASSES[deltaTone(k.delta)]}`}>
              {k.delta}
            </p>
          </AdminPanel>
        ))}
      </div>

      <div className={styles.charts} data-analytics-part="charts">
        <RadarCard
          identity={player.id ?? player.name}
          labels={radarData.labels}
          playerVals={radarData.player}
          avgVals={radarData.posAvg}
        />
        <ComparisonBar data={comparisonData} />
      </div>

      <TrendLine data={trend.playerId === player.id ? trend.data : []} loading={trendLoading || trend.playerId !== player.id} gk={gk} />

      <AdminPanel data-analytics-part="discipline">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Discipline</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Season card record and availability score.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              disciplineScore >= 85
                ? "bg-success/15 text-success"
                : disciplineScore >= 60
                  ? "bg-warning/15 text-warning-ink"
                  : "bg-destructive/15 text-destructive"
            }`}
          >
            {disciplineScore >= 85
              ? "Clean"
              : disciplineScore >= 60
                ? "Caution"
                : "High risk"}{" "}
            · {disciplineScore}/100
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <span className="h-3 w-2.5 flex-none rounded-[2px] bg-warning" />
            <span className="font-body text-lg font-semibold tabular-nums text-foreground">
              {stats.yellow}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Yellow</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <span className="h-3 w-2.5 flex-none rounded-[2px] bg-destructive" />
            <span className="font-body text-lg font-semibold tabular-nums text-foreground">
              {stats.red}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Red</span>
          </div>
          <div>
            <AdminBar fraction={disciplineScore / 100} label={`Discipline score ${disciplineScore} out of 100`} />
            <p className="mt-2 text-right text-xs text-muted-foreground">
              {disciplineScore}% discipline score
            </p>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}

// ── Radar Card ─────────────────────────────────

function RadarCard({
  identity,
  labels,
  playerVals,
  avgVals,
}: {
  identity: string;
  labels: string[];
  playerVals: number[];
  avgVals: number[];
}) {
  const radarRef = useRef<HTMLDivElement>(null);
  const signature = `${identity}|${labels.join(",")}|${playerVals.join(",")}|${avgVals.join(",")}`;
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const animation = radarRef.current?.animate(
      [{ opacity: 0.35 }, { opacity: 1 }],
      { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 160, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [signature]);
  const summary = labels.map((label, i) => `${label}: player ${playerVals[i]}, position average ${avgVals[i]}`).join("; ");
  const cx = 110, cy = 110, r = 78, n = labels.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt    = (i: number, scale: number) => [
    cx + scale * r * Math.cos(angle(i)),
    cy + scale * r * Math.sin(angle(i)),
  ];
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, Math.max(v, 2) / 100).join(",")).join(" ");

  return (
    <AdminPanel>
      <div className={styles.chartHeading}>
        <h2 className="text-sm font-semibold text-foreground">Player profile</h2>
        <p className="mt-1 text-xs text-muted-foreground">Compared with the position average.</p>
      </div>

      <div ref={radarRef} className={styles.radar}>
        <svg
          viewBox="-10 -10 240 240"
          role="img"
          aria-label={`Radar chart showing player profile vs position average. ${summary}`}
          className={styles.radarSvg}
        >
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <polygon key={s} points={labels.map((_, i) => pt(i, s).join(",")).join(" ")} className="fill-none stroke-border" strokeWidth="0.5" />
          ))}
          {labels.map((_, i) => {
            const [x, y] = pt(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-border" strokeWidth="0.5" />;
          })}
          <polygon points={poly(avgVals)} className="fill-muted/40 stroke-muted-foreground/50" strokeWidth="1.5" strokeDasharray="4,3" />
          <polygon points={poly(playerVals)} className="fill-primary/15 stroke-primary" strokeWidth="2" />
          {playerVals.map((v, i) => {
            const [x, y] = pt(i, Math.max(v, 2) / 100);
            return <circle key={i} cx={x} cy={y} r="3.5" className="fill-primary" />;
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

        <p className="sr-only">{summary}</p>
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-primary" />Player</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-muted-foreground/50" />Position average</span>
      </div>
    </AdminPanel>
  );
}

// ── Comparison Bar ─────────────────────────────

function ComparisonBar({ data }: { data: { labels: string[]; player: number[]; posAvg: number[]; max: number[] } }) {
  return (
    <AdminPanel>
      <div className={styles.chartHeading}>
        <h2 className="text-sm font-semibold text-foreground">Stats vs position average</h2>
        <p className="mt-1 text-xs text-muted-foreground">Each bar is scaled to the best in the position group.</p>
      </div>
      <div className={styles.comparison}>
        {data.labels.map((label, i) => (
          <div key={i}>
            <div className="mb-1.5 flex justify-between gap-3 text-xs">
              <span>{label}</span>
              <span className="text-muted-foreground tabular-nums">{data.player[i]} · avg {data.posAvg[i]}</span>
            </div>
            <AdminBar fraction={data.player[i] / data.max[i]} label={`${label}: player ${data.player[i]}`} staggerIndex={i} />
            <AdminBar className={styles.average} fraction={data.posAvg[i] / data.max[i]} label={`${label}: position average ${data.posAvg[i]}`} staggerIndex={i} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-primary" />Player</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-muted-foreground/50" />Position average</span>
      </div>
    </AdminPanel>
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
  const delayed = useDelayedLoading(loading);
  const { theme } = useAdminTheme();

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: { labels: [], datasets: [{ label: "", data: [], pointRadius: 4, pointHoverRadius: 6, tension: 0.35, fill: true, borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {},
          y: { min: 0 },
        },
      },
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !canvasRef.current) return;
    const chartTheme = resolveChartTheme(canvasRef.current, theme);
    const axes = chartAxes(chartTheme);
    chart.data.labels = data.map((point) => point.opponent);
    Object.assign(chart.data.datasets[0], {
      label: metric,
      data: data.map((point) => point.value),
      borderColor: chartTheme.accent,
      backgroundColor: chartTheme.accentSoft,
      pointBackgroundColor: chartTheme.accent,
    });
    chart.options.plugins = {
      legend: { display: false },
      tooltip: {
        ...chartTheme.tooltip,
        callbacks: {
          title: (items) => data[items[0].dataIndex]?.opponent ?? "",
          label: (ctx) => ` ${metric}: ${ctx.parsed.y}  ·  ${data[ctx.dataIndex]?.mins ?? 0} min`,
        },
      },
    };
    chart.options.scales = {
      x: { ...axes.x, ticks: { ...axes.x.ticks, maxRotation: 30 } },
      y: { ...axes.y, min: 0, ticks: { ...axes.y.ticks, stepSize: 1 } },
    };
    chart.resize();
    chart.update("none");
  }, [data, loading, metric, theme]);

  return (
    <AdminPanel data-analytics-part="trend">
      <div className={`${styles.chartHeading} ${styles.trendHeading}`}>
        <h2 className="text-sm font-semibold text-foreground">{gk ? "Saves per match" : "Goal contributions per match"}</h2>
        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {!loading ? `${data.length} match${data.length !== 1 ? "es" : ""}` : "Matches"}
        </span>
        <p className="text-xs text-muted-foreground">Recent match-by-match output.</p>
      </div>
      <div className={styles.trend} data-phase={delayed.phase} aria-busy={delayed.phase !== "content"}>
        <canvas
          ref={canvasRef}
          hidden={!delayed.showContent || data.length < 2}
          role="img"
          aria-label={`${gk ? "Saves" : "Goal contributions"} per match: ${data.map((point) => `${point.opponent} ${point.value}, ${point.mins} minutes`).join("; ")}`}
        >
          {data.map((point) => `${point.opponent}: ${point.value}`).join("; ")}
        </canvas>
        {delayed.showSkeleton && <div className={styles.trendSkeleton} role="status" aria-label="Loading match trends"><Shimmer className={styles.trend} /></div>}
        {delayed.showContent && data.length < 2 ? (
          <div className={styles.trendEmpty}>
            {data.length === 0 ? "No match data yet" : "Two matches are needed to show a trend."}
          </div>
        ) : null}
      </div>
    </AdminPanel>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className={styles.workspace} aria-hidden="true" data-analytics-skeleton="">
      <AdminPageToolbar>
        <div><p className="text-sm font-semibold">Position group</p><p className="mt-1 text-sm text-muted-foreground">Narrow the roster without changing the season comparison.</p></div>
        <div className="flex gap-1 rounded-xl border border-border bg-muted/60 p-1">
          {POSITIONS.map((position) => <Shimmer key={position} className="h-11 w-11 rounded-lg" />)}
        </div>
      </AdminPageToolbar>
      <div className={styles.columns}>
        <AdminPanel as="aside" className={styles.rail}>
          <div className="mb-4"><h2 className="text-sm font-semibold">Players</h2><Shimmer className="mt-1 h-4 w-24" /></div>
          <div className={styles.players}>
            {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeletonPlayer}><Shimmer className="h-10 w-10 flex-none rounded-full" /><Shimmer className="h-8 w-full" /></div>)}
          </div>
        </AdminPanel>
        <div className={styles.dashboard}>
          <AdminPanel data-analytics-part="summary"><div className={styles.skeletonSummary}><Shimmer className="h-full w-16 flex-none rounded-2xl sm:w-20" /><Shimmer className="h-12 w-48 max-w-full" /></div></AdminPanel>
          <div className={styles.kpis} data-analytics-part="metrics">{[0, 1, 2, 3].map((i) => <AdminPanel key={i} className="p-4 sm:p-5"><Shimmer className={styles.skeletonMetric} /></AdminPanel>)}</div>
          <div className={styles.charts} data-analytics-part="charts">
            <AdminPanel><Shimmer className={styles.skeletonHeading} /><Shimmer className={styles.radar} /><Shimmer className="mt-4 h-4 w-44" /></AdminPanel>
            <AdminPanel><Shimmer className={styles.skeletonHeading} /><Shimmer className={styles.radar} /><Shimmer className="mt-4 h-4 w-44" /></AdminPanel>
          </div>
          <AdminPanel data-analytics-part="trend"><Shimmer className={styles.skeletonHeading} /><Shimmer className={styles.trend} /></AdminPanel>
          <AdminPanel data-analytics-part="discipline">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-foreground">Discipline</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Season card record and availability score.</p></div>
              <Shimmer className="h-6 w-24 rounded-full" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center">
              <Shimmer className="h-12 w-28" /><Shimmer className="h-12 w-24" /><Shimmer className="h-8 w-full" />
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
