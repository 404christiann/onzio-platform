"use client";

import { useEffect, useMemo, useState } from "react";
import { useClubId } from "@/components/ClubContextProvider";
import { fetchRoster, fetchSchedule } from "@/lib/queries";
import type { FieldStats, Fixture, Player } from "@/lib/data";

type SortKey = "goals" | "assists" | "starts" | "mins";
type RosterData = Awaited<ReturnType<typeof fetchRoster>>;

function isFieldStats(stats: Player["stats"]): stats is FieldStats {
  return !("saves" in stats);
}

function flattenPlayers(roster: RosterData | null): Player[] {
  if (!roster) return [];
  return [
    ...roster.goalkeepers,
    ...roster.defenders,
    ...roster.midfielders,
    ...roster.forwards,
  ];
}

function playedMatches(fixtures: Fixture[]): Fixture[] {
  return fixtures.filter(
    (fixture) =>
      typeof fixture.roseCityScore === "number" &&
      typeof fixture.opponentScore === "number",
  );
}

function overviewFor(fixtures: Fixture[]) {
  const played = playedMatches(fixtures);
  const wins = played.filter(
    (fixture) => Number(fixture.roseCityScore) > Number(fixture.opponentScore),
  ).length;
  const draws = played.filter(
    (fixture) => Number(fixture.roseCityScore) === Number(fixture.opponentScore),
  ).length;
  const losses = played.length - wins - draws;
  return {
    record: `${wins}-${draws}-${losses}`,
    goalsFor: played.reduce((sum, fixture) => sum + Number(fixture.roseCityScore), 0),
    goalsAgainst: played.reduce(
      (sum, fixture) => sum + Number(fixture.opponentScore),
      0,
    ),
    cleanSheets: played.filter((fixture) => Number(fixture.opponentScore) === 0)
      .length,
  };
}

function sortValue(player: Player, sort: SortKey): number {
  if (sort === "goals") return isFieldStats(player.stats) ? player.stats.goals : 0;
  if (sort === "assists") return isFieldStats(player.stats) ? player.stats.assists : 0;
  return player.stats[sort];
}

export default function ClubhouseStatsPage() {
  const clubId = useClubId();
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [sort, setSort] = useState<SortKey>("goals");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRoster(undefined, clubId)
      .then(async (nextRoster) => {
        const schedule = nextRoster.seasonId
          ? await fetchSchedule(nextRoster.seasonId, clubId)
          : [];
        if (cancelled) return;
        setRoster(nextRoster);
        setFixtures(schedule);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load stats.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const overview = useMemo(() => overviewFor(fixtures), [fixtures]);
  const leaders = useMemo(
    () =>
      flattenPlayers(roster)
        .filter((player) => player.stats.mins > 0)
        .sort((left, right) => sortValue(right, sort) - sortValue(left, sort))
        .slice(0, 18),
    [roster, sort],
  );

  return (
    <div className="clubhouse-route-page clubhouse-stats-page">
      <header className="clubhouse-route-hero clubhouse-stats-hero">
        <div>
          <p className="clubhouse-eyebrow">Numbers behind the ninety</p>
          <h1>
            Form.
            <br />
            <em>Measured.</em>
          </h1>
        </div>
      </header>

      <section className="clubhouse-stat-overview">
        <div>
          <span>Record</span>
          <strong>{overview.record}</strong>
        </div>
        <div>
          <span>Goals for</span>
          <strong>{overview.goalsFor}</strong>
        </div>
        <div>
          <span>Goals against</span>
          <strong>{overview.goalsAgainst}</strong>
        </div>
        <div>
          <span>Clean sheets</span>
          <strong>{overview.cleanSheets}</strong>
        </div>
      </section>

      <section className="clubhouse-stats-table-wrap">
        {loading && <div className="clubhouse-route-state">Loading performance</div>}
        {error && !loading && <div className="clubhouse-route-state">{error}</div>}
        {!loading && !error && (
          <>
            <div className="clubhouse-stats-heading">
              <div>
                <p className="clubhouse-eyebrow">Player leaders</p>
                <h2>{roster?.seasonLabel ?? "Season"} performance</h2>
              </div>
              <label>
                Sort by
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                  <option value="goals">Goals</option>
                  <option value="assists">Assists</option>
                  <option value="starts">Starts</option>
                  <option value="mins">Minutes</option>
                </select>
              </label>
            </div>
            <div className="clubhouse-stats-table">
              <div className="clubhouse-stats-row header">
                <span>Player</span>
                <span>Starts</span>
                <span>Goals</span>
                <span>Assists</span>
                <span>Min</span>
              </div>
              {leaders.map((player) => (
                <div className="clubhouse-stats-row" key={player.id ?? player.number}>
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.position} · #{player.number}
                    </small>
                  </span>
                  <span>{player.stats.starts}</span>
                  <span>{isFieldStats(player.stats) ? player.stats.goals : 0}</span>
                  <span>{isFieldStats(player.stats) ? player.stats.assists : 0}</span>
                  <span>{player.stats.mins.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
