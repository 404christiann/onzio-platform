import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StatsPlayer } from "@/components/admin/stats/types";
import {
  buildMatchSaveRows, cellText, changedSince, keepEditsOver, versionsFrom, defaultMatchRow, defaultSeasonRow, dirtyPlayers, matchRowsFromData, parseCount, seasonRowsFromData, seasonSaveInput,
  seasonSplit, seasonTotalsProblem, splitPlayers, statsColumns, statsFieldGroups, statsSummary, type MatchRows, type SeasonRows,
} from "@/components/admin/stats/rose-city/stats-model";
import { StatsTables } from "@/components/admin/stats/rose-city/StatsTables";
import { saveSeasonTotals, type SeasonGames } from "@/lib/season-totals-save";

const root = resolve(__dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const players: StatsPlayer[] = [
  { id: "gk", number: 1, name: "Mateo Alvarez", position: "Goalkeeper" },
  { id: "d1", number: 4, name: "Noah Bennett", position: "Defender" },
  { id: "f1", number: 9, name: "Tomas Ortega", position: "Forward" },
  { id: "m1", number: 6, name: "Ethan Cole", position: "Midfielder" },
];
const MATCH = "match-1";

/** The rows the classic Match stats editor built, copied from its handleSave before the rebuild. */
function legacyMatchRows(list: StatsPlayer[], stats: MatchRows, matchId: string) {
  const isGKRow = (row: object): boolean => "saves" in row;
  const fieldRows: Record<string, unknown>[] = [];
  const gkRows: Record<string, unknown>[] = [];
  list.forEach((p) => {
    const row = stats[p.id];
    if (!row) return;
    if (p.position === "Goalkeeper" && isGKRow(row)) gkRows.push({ player_id: p.id, match_id: matchId, ...row });
    else if (!isGKRow(row)) fieldRows.push({ player_id: p.id, match_id: matchId, ...row });
  });
  return { fieldRows, gkRows };
}

const fieldData = [{ player_id: "f1", starts: true, mins: 90, goals: 2, assists: 1, tackles: 3, offsides: 1, fouls: 2, fouls_suffered: 4, yellow: 1, red: 0 }];
const keeperData = [{ player_id: "gk", starts: true, mins: 90, goals_against: 1, saves: 5, clean_sheets: 0, yellow: 0, red: 0 }];

describe("RC-ADMIN-4b Stats: match save payload", () => {
  it("loads the same rows the classic editor loaded, zeros for players with none", () => {
    const rows = matchRowsFromData(players, fieldData, keeperData);
    expect(rows.f1).toEqual({ starts: true, mins: 90, goals: 2, assists: 1, tackles: 3, offsides: 1, fouls: 2, fouls_suffered: 4, yellow: 1, red: 0 });
    expect(rows.gk).toEqual({ starts: true, mins: 90, goals_against: 1, saves: 5, clean_sheets: 0, yellow: 0, red: 0 });
    expect(rows.d1).toEqual(defaultMatchRow(players[1]));
    expect(Object.keys(rows.d1)).toEqual(["starts", "mins", "goals", "assists", "tackles", "offsides", "fouls", "fouls_suffered", "yellow", "red"]);
  });

  it("sends the same bytes as the classic editor for an untouched match and for one edit", () => {
    const rows = matchRowsFromData(players, fieldData, keeperData);
    const edited: MatchRows = { ...rows, f1: { ...rows.f1, goals: 3 }, gk: { ...rows.gk, saves: 6 } };
    for (const state of [rows, edited]) {
      const built = buildMatchSaveRows(players, state, MATCH);
      const legacy = legacyMatchRows(players, state, MATCH);
      expect(JSON.stringify(built.fieldRows)).toBe(JSON.stringify(legacy.fieldRows));
      expect(JSON.stringify(built.keeperRows)).toBe(JSON.stringify(legacy.gkRows));
    }
  });

  it("still sends a row for every player, changed or not", () => {
    const rows = matchRowsFromData(players, [], []);
    const { fieldRows, keeperRows } = buildMatchSaveRows(players, rows, MATCH);
    expect(fieldRows.map(row => row.player_id)).toEqual(["d1", "f1", "m1"]);
    expect(keeperRows.map(row => row.player_id)).toEqual(["gk"]);
    expect(fieldRows.every(row => row.match_id === MATCH)).toBe(true);
  });

  it("an applied dialog row keeps the saved row's key order, so an unchanged player is unchanged", () => {
    const rows = matchRowsFromData(players, fieldData, keeperData);
    expect(dirtyPlayers(players, rows, rows).size).toBe(0);
    const next = { ...rows, f1: { ...rows.f1 } };
    expect(dirtyPlayers(players, next, rows).size).toBe(0);
    expect(dirtyPlayers(players, { ...rows, f1: { ...rows.f1, red: 1 } }, rows)).toEqual(new Set(["f1"]));
  });

  it("calls the classic upserts and nothing else", () => {
    const src = source("components/admin/stats/rose-city/RoseCityMatchStats.tsx");
    expect(src).toContain('.upsert(fieldRows, { onConflict: "player_id,match_id" })');
    expect(src).toContain('.upsert(keeperRows, { onConflict: "player_id,match_id" })');
    expect(src).toContain('from("player_match_stats")');
    expect(src).toContain('from("goalkeeper_match_stats")');
  });
});

describe("RC-ADMIN-4b Stats: season save payload", () => {
  const seasonField = [{ player_id: "f1", goals: 5, assists: 2, tackles: 1, offsides: 0, fouls: 1, fouls_suffered: 1, starts: 3, yellow: 1, red: 0, mins: 270 }];
  const seasonKeeper = [{ player_id: "gk", goals_against: 4, saves: 12, clean_sheets: 1, starts: 3, yellow: 0, red: 0, mins: 270 }];

  /** The arguments the classic Season stats editor gave saveSeasonTotals, copied from its handleSave. */
  function legacyArgs(list: StatsPlayer[], stats: SeasonRows, dirty: Set<string>, rowIds: Set<string>) {
    const entries = list.filter(p => dirty.has(p.id) && stats[p.id]).map(p => ({ playerId: p.id, name: p.name, keeper: p.position === "Goalkeeper", typed: stats[p.id] as Record<string, number>, inSeason: rowIds.has(p.id) }));
    const join = list.filter(p => !rowIds.has(p.id) && !dirty.has(p.id)).map(p => ({ playerId: p.id, keeper: p.position === "Goalkeeper" }));
    return { entries, join };
  }

  it("hands saveSeasonTotals what the classic editor handed it", () => {
    const base = seasonRowsFromData(players, seasonField, seasonKeeper);
    const edited: SeasonRows = { ...base, f1: { ...base.f1, goals: 6 }, d1: { ...base.d1, mins: 90 } };
    const dirty = dirtyPlayers(players, edited, base);
    const rowIds = new Set(["f1", "gk"]);
    expect(JSON.stringify(seasonSaveInput(players, edited, dirty, rowIds))).toBe(JSON.stringify(legacyArgs(players, edited, dirty, rowIds)));
    expect(dirty).toEqual(new Set(["f1", "d1"]));
  });

  it("writes the same rows through saveSeasonTotals: typed minus games as the hand-added part, joins first", async () => {
    const calls: { table: string; op: string; rows?: unknown }[] = [];
    const chain = (table: string, data: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const name of ["select", "eq", "in", "order", "range"]) q[name] = () => q;
      q.upsert = (rows: unknown) => { calls.push({ table, op: "upsert", rows }); return Promise.resolve({ error: null }); };
      q.then = (resolveQuery: (value: unknown) => unknown) => resolveQuery({ data, error: null });
      return q;
    };
    const supabase = { from: (table: string) => chain(table, table === "matches" ? [{ id: MATCH }] : table === "player_match_stats" ? fieldData : table === "goalkeeper_match_stats" ? keeperData : []) };
    const base = seasonRowsFromData(players, seasonField, seasonKeeper);
    const edited: SeasonRows = { ...base, f1: { ...base.f1, goals: 6 } };
    const { entries, join } = seasonSaveInput(players, edited, dirtyPlayers(players, edited, base), new Set(["f1", "gk"]));
    const problem = await saveSeasonTotals(supabase as never, "season-1", entries, join);
    expect(problem).toBeNull();
    const adjustment = calls.find(call => call.table === "player_season_adjustments")?.rows as Record<string, unknown>[];
    expect(adjustment).toEqual([expect.objectContaining({ player_id: "f1", season_id: "season-1", goals: 6 - 2, mins: 270 - 90 })]);
    expect(calls.find(call => call.table === "player_season_stats")?.rows).toEqual([{ player_id: "d1", season_id: "season-1" }, { player_id: "m1", season_id: "season-1" }]);
  });

  it("the season editor saves through saveSeasonTotals only", () => {
    const src = source("components/admin/stats/rose-city/RoseCitySeasonStats.tsx");
    expect(src).toContain("saveSeasonTotals(createClient(), selectedSeasonId, entries, join)");
    expect(src).not.toMatch(/\.upsert\(/);
  });

  it("splits a typed total into added-up matches and added by hand", () => {
    const games: SeasonGames = { field: new Map([["f1", { goals: 2, assists: 1, tackles: 0, starts: 1, yellow: 0, red: 0, mins: 90, offsides: 0, fouls: 0, fouls_suffered: 0 }]]), keepers: new Map() };
    expect(seasonSplit(players[2], "goals", 3, games)).toEqual({ fromMatches: 2, byHand: 1 });
    expect(seasonSplit(players[2], "goals", 1, games)).toEqual({ fromMatches: 2, byHand: -1 });
    expect(seasonSplit(players[1], "goals", 4, games)).toEqual({ fromMatches: 0, byHand: 4 });
    expect(seasonSplit(players[2], "goals", 4, null)).toEqual({ fromMatches: 0, byHand: 4 });
  });

  it("refuses what the classic save refuses, in the classic words", () => {
    const typed = Object.fromEntries(Object.keys(defaultSeasonRow(players[2])).map(key => [key, 0]));
    expect(seasonTotalsProblem(players[2], { ...typed, goals: 10_000 }, null)).toBe("Tomas Ortega: Numbers added by hand stop at 9,999.");
    expect(seasonTotalsProblem(players[2], { ...typed, mins: 10_000 }, null)).toBe("Tomas Ortega: Minutes added by hand stop at 9,999.");
    expect(seasonTotalsProblem(players[2], { ...typed, goals: 9_999 }, null)).toBeNull();
  });
});

describe("RC-ADMIN-4b Stats: tables and dialog fields", () => {
  it("lists field players by position then number, keepers apart", () => {
    const { field, keepers } = splitPlayers(players);
    expect(field.map(p => p.name)).toEqual(["Noah Bennett", "Ethan Cole", "Tomas Ortega"]);
    expect(keepers.map(p => p.name)).toEqual(["Mateo Alvarez"]);
  });

  it("puts Started first in a match and Starts last in season totals", () => {
    expect(statsColumns("match", false)[0]).toMatchObject({ key: "starts", abbr: "St" });
    expect(statsColumns("season", false).at(-1)).toMatchObject({ key: "starts", label: "Starts" });
    expect(statsColumns("match", true).map(column => column.key)).toEqual(["starts", "mins", "goals_against", "saves", "clean_sheets", "yellow", "red"]);
  });

  it("every stat the classic editor entered has a column and a dialog field, keeper or not", () => {
    for (const mode of ["match", "season"] as const) for (const player of [players[1], players[0]]) {
      const keys = Object.keys(mode === "match" ? defaultMatchRow(player) : defaultSeasonRow(player)).sort();
      expect(statsColumns(mode, player.position === "Goalkeeper").map(column => column.key).sort()).toEqual(keys);
      expect(statsFieldGroups(mode, player).flatMap(group => group.fields.map(field => field.key)).sort()).toEqual(keys);
    }
    const minutes = statsFieldGroups("match", players[1]).flatMap(group => group.fields).find(field => field.key === "mins");
    expect(minutes?.max).toBe(300);
    expect(statsFieldGroups("season", players[1]).flatMap(group => group.fields).find(field => field.key === "mins")?.max).toBeUndefined();
  });

  it("formats cells, phone summaries and typed numbers", () => {
    expect(cellText("match", "starts", true)).toBe("Yes");
    expect(cellText("match", "starts", false)).toBe("–");
    expect(cellText("season", "starts", 3)).toBe("3");
    expect(statsSummary("match", players[2], { starts: true, mins: 90, goals: 2, assists: 1, yellow: 1 })).toBe("Started · 90 min · 2 G · 1 A · 1 Y");
    expect(statsSummary("season", players[0], { mins: 270, saves: 12, goals_against: 4 })).toBe("270 min · 12 saves · 4 conceded");
    expect([parseCount(""), parseCount("-4"), parseCount("7.9"), parseCount("999", 300), parseCount("abc")]).toEqual([0, 0, 7, 300, 0]);
  });

  it("renders a read-only table per kind of player, an Edit button per player, no inputs", () => {
    const rows = matchRowsFromData(players, fieldData, keeperData);
    const html = renderToStaticMarkup(createElement(StatsTables, { mode: "match", players, values: rows, dirtyIds: new Set(["f1"]), disabled: false, onEdit: () => undefined }));
    expect(html).toContain("Field players");
    expect(html).toContain("Goalkeepers");
    expect(html).toContain('aria-label="Edit Tomas Ortega"');
    expect(html).toContain('aria-label="Has unsaved changes"');
    expect(html).not.toContain("<input");
    expect(html.indexOf("Field players")).toBeLessThan(html.indexOf("Goalkeepers"));
  });

  it("the season dialog says how the total splits", () => {
    expect(source("components/admin/stats/rose-city/StatsPlayerDialog.tsx")).toContain("From matches {split.fromMatches} · added by hand");
  });

  it("dialog edits go to the page draft at once, Done closes, and only the page Save publishes", () => {
    const dialog = source("components/admin/stats/rose-city/StatsPlayerDialog.tsx");
    expect(dialog).toContain(">Done</Button>");
    expect(dialog).toContain("Edits stay on the page until you press Save.");
    expect(dialog).not.toMatch(/upsert|saveSeasonTotals|createClient/);
    expect(source("components/admin/stats/rose-city/RoseCityStatsPage.tsx")).toContain("onSave={() => controls.current?.save()}");
  });
});

describe("RC-ADMIN-4b Stats: stale-edit conflict and retry", () => {
  it("reads when saved rows last changed, by player, from the tables' own updated_at", () => {
    expect(versionsFrom([{ player_id: "f1", updated_at: "2026-11-19T10:00:00Z" }], [{ player_id: "gk", updated_at: "2026-11-19T10:01:00Z" }, { player_id: "x" }])).toEqual({ f1: "2026-11-19T10:00:00Z", gk: "2026-11-19T10:01:00Z" });
  });

  it("flags a player whose row changed, appeared or vanished since the page loaded, and no one else", () => {
    const loaded = { f1: "t1", gk: "t1" };
    expect(changedSince(["f1", "gk", "d1"], loaded, { f1: "t1", gk: "t1" })).toEqual([]);
    expect(changedSince(["f1", "gk", "d1"], loaded, { f1: "t2", gk: "t1" })).toEqual(["f1"]);
    expect(changedSince(["f1", "gk", "d1"], loaded, { f1: "t1", gk: "t1", d1: "t3" })).toEqual(["d1"]);
    expect(changedSince(["f1", "gk"], loaded, { f1: "t1" })).toEqual(["gk"]);
  });

  it("load latest and keep my edits: edited players keep their edit, everyone else takes the latest", () => {
    const baseline = matchRowsFromData(players, fieldData, keeperData);
    const latest = matchRowsFromData(players, [{ ...fieldData[0], goals: 7 }, { player_id: "d1", starts: true, mins: 60, goals: 0, assists: 0, tackles: 2, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0 }], keeperData);
    const mine: MatchRows = { ...baseline, gk: { ...baseline.gk, saves: 9 } };
    const merged = keepEditsOver(players, latest, mine, baseline);
    expect((merged.gk as { saves: number }).saves).toBe(9);
    expect((merged.f1 as { goals: number }).goals).toBe(7);
    expect((merged.d1 as { mins: number }).mins).toBe(60);
    expect(keepEditsOver(players, latest, baseline, baseline)).toEqual(latest);
  });

  it("both views check for newer saves before writing, send the same writes, and refresh their versions after", () => {
    const match = source("components/admin/stats/rose-city/RoseCityMatchStats.tsx");
    expect(match.indexOf("changedSince(players.map")).toBeGreaterThan(0);
    expect(match.indexOf("changedSince(players.map")).toBeLessThan(match.indexOf('.upsert(fieldRows, { onConflict: "player_id,match_id" })'));
    expect(match).toContain("fetchLatest(matchId).then(latest => setVersions(latest.versions), () => setVersions(null))");
    const season = source("components/admin/stats/rose-city/RoseCitySeasonStats.tsx");
    expect(season.indexOf("changedSince(dirtyIds")).toBeLessThan(season.indexOf("saveSeasonTotals(createClient()"));
    expect(season).toContain("readVersions(selectedSeasonId).then(setVersions, () => setVersions(null))");
  });

  it("a save that fails after writing learns the new row versions, so Try again is not called a conflict against our own partial write", () => {
    const match = source("components/admin/stats/rose-city/RoseCityMatchStats.tsx");
    const failed = match.slice(match.indexOf("if (fieldError || keeperError) {"), match.indexOf("setBaselineStats(stats);"));
    expect(failed).toContain("learnVersions(selectedMatch)");
    expect(match).toContain("if (wrote) learnVersions(selectedMatch)");
    const season = source("components/admin/stats/rose-city/RoseCitySeasonStats.tsx");
    expect(season.slice(season.indexOf("if (problem) {"), season.indexOf("setSeasonRowIds(new Set(players"))).toContain("readVersions(selectedSeasonId).then(setVersions");
    expect(season).toContain("if (wrote) readVersions(selectedSeasonId)");
  });

  it("the page offers Try again after a failed save and the two conflict ways out", () => {
    const page = source("components/admin/stats/rose-city/RoseCityStatsPage.tsx");
    expect(page).toContain("Try again</button>");
    expect(page).toContain("Load latest and keep my edits");
    expect(page).toContain("Reload saved numbers");
    expect(page).toContain("onRetry={() => controls.current?.save()}");
    expect(page).toContain("failure.kind");
  });
});

describe("RC-ADMIN-4b Stats: who gets the new page", () => {
  it("Rose City is chosen by slug and the reimagined portal keeps the shared page", () => {
    const src = source("components/admin/stats/rose-city/RoseCityStatsSwitch.tsx");
    expect(src).toContain('const ROSE_CITY_SLUG = "rose-city"');
    expect(src).toContain("club.slug === ROSE_CITY_SLUG && classic");
    expect(src).not.toContain("presentationTemplateKey");
    expect(src).not.toContain("cinematic@2");
  });

  it("the shared stats files are not edited and do not know about Rose City", () => {
    for (const file of ["CombinedStatsPage", "MatchStatsEditor", "SeasonStatsEditor", "StatsWorkspace", "LegacyMatchStatsEditor", "LegacySeasonStatsEditor"]) {
      expect(source(`components/admin/stats/${file}.tsx`)).not.toMatch(/rose-city|RoseCity/);
    }
    expect(source("app/admin/(protected)/stats/page.tsx")).toContain("StatsPageForClub");
  });

  it("/admin/season-stats still only redirects", () => {
    expect(source("app/admin/(protected)/season-stats/page.tsx")).toContain('redirect("/admin/stats?view=season")');
  });

  it("renders the shared page for another club", async () => {
    vi.resetModules();
    vi.doMock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ slug: "diverse-city" }) }));
    vi.doMock("@/components/admin/AdminPortalProvider", () => ({ useAdminPortal: () => ({ portal: "classic" }) }));
    vi.doMock("@/components/admin/stats/CombinedStatsPage", () => ({ CombinedStatsPage: () => createElement("p", null, "shared-page") }));
    vi.doMock("@/components/admin/stats/rose-city/RoseCityStatsPage", () => ({ RoseCityStatsPage: () => createElement("p", null, "rose-city-page") }));
    const { StatsPageForClub } = await import("@/components/admin/stats/rose-city/RoseCityStatsSwitch");
    expect(renderToStaticMarkup(createElement(StatsPageForClub))).toContain("shared-page");
    vi.doMock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ slug: "rose-city" }) }));
    vi.resetModules();
    const again = await import("@/components/admin/stats/rose-city/RoseCityStatsSwitch");
    expect(renderToStaticMarkup(createElement(again.StatsPageForClub))).toContain("rose-city-page");
    vi.doUnmock("@/components/ClubContextProvider");
    vi.doUnmock("@/components/admin/AdminPortalProvider");
    vi.doUnmock("@/components/admin/stats/CombinedStatsPage");
    vi.doUnmock("@/components/admin/stats/rose-city/RoseCityStatsPage");
  });
});
