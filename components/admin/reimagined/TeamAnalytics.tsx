"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useClubId } from "@/components/ClubContextProvider";
import { IconAnalytics, IconCaretRight, IconClose } from "@/components/admin/icons";
import {
  POSITION_ORDER,
  defaultPlayerId,
  type AnalyticsPlayer,
  type GameDetail,
  type PlayerPosition,
  type TeamAnalytics as TeamAnalyticsData,
} from "@/lib/admin-analytics-data";
import {
  BAR_ROOM,
  avatarInitials,
  barScale,
  chartGames,
  didWords,
  formatCount,
  gameResult,
  goalsWords,
  minutesFraction,
  monthLabels,
  playedLine,
  recordLine,
  resultWord,
  scoreLine,
  unbeatenLine,
  type ResultGame,
} from "@/lib/admin-analytics-view";
import { formatClubDate } from "@/lib/club-time";
import { fetchPlayerMatchLog, type MatchLogRow } from "@/lib/queries";
import { PlayerChart } from "@/components/admin/analytics/PlayerChart";
import styles from "./analytics.module.css";

// ADMIN-RE-19: "How the team is doing" (design: cd-analytics-a, the season game
// by game, and cd-analytics-b, one player at a time) for clubs on the reimagined
// admin. Presentation only: the page hands in the season's results and players
// (lib/admin-analytics-data.ts), and one player's game log is read on demand
// with fetchPlayerMatchLog. Both charts are plain SVG and CSS (the repo's
// Chart.js stays on the classic page). Nothing is told by color alone: every
// game carries its score and a W, D or L, every corner its label and number,
// and the whole season is also a plain list.

const WIDE_GAMES = 12;
const NARROW_GAMES = 6;
const AVATAR_HUES = ["#c59a4e", "#6f86c9", "#6d9a7c", "#9a6d8a", "#c9736f", "#5f9aa8"] as const;
const RESULT_LETTER = { won: "W", drew: "D", lost: "L" } as const;
const GROUP_LABEL: Record<PlayerPosition, string> = {
  Goalkeeper: "Goalkeepers",
  Defender: "Defenders",
  Midfielder: "Midfielders",
  Forward: "Forwards",
};
const POSITION_LABEL: Record<PlayerPosition, string> = {
  Goalkeeper: "Goalkeeper",
  Defender: "Defender",
  Midfielder: "Midfielder",
  Forward: "Forward",
};

function avatarHue(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length]!;
}

function Avatar({ id, name, size }: { id: string; name: string; size: number }) {
  return (
    <span
      className={styles.avatar}
      aria-hidden="true"
      style={{ "--size": `${size}px`, background: avatarHue(id) } as CSSProperties}
    >
      {avatarInitials(name)}
    </span>
  );
}

function dateWords(date: string): string {
  return formatClubDate(date, "weekday-short") ?? date;
}

export type TeamAnalyticsLinks = { score: string; stats: string; roster: string };

export function TeamAnalytics({ data, links }: { data: TeamAnalyticsData; links: TeamAnalyticsLinks }) {
  return (
    <div className={styles.page} data-testid="team-analytics">
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <IconAnalytics className="size-6" />
        </span>
        <div className={styles.titles}>
          <h1 className={styles.h1}>How the team is doing</h1>
          <p className={styles.sub} data-testid="analytics-season">
            {data.season.label} season, from the scores you enter
          </p>
        </div>
      </header>

      <ResultsCard data={data} links={links} />
      <PlayersCard data={data} links={links} />
    </div>
  );
}

// ── The season, game by game ─────────────────────────────────────────────────

function ResultsCard({ data, links }: { data: TeamAnalyticsData; links: TeamAnalyticsLinks }) {
  const { games, record, details } = data;
  const [openId, setOpenId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  const shown = useMemo(() => chartGames(games, WIDE_GAMES), [games]);
  const lastFew = Math.min(NARROW_GAMES, shown.length);
  const wideLabels = useMemo(() => monthLabels(shown, "wide"), [shown]);
  const narrowLabels = useMemo(() => {
    const tail = monthLabels(shown.slice(shown.length - lastFew), "narrow");
    return [...Array<string>(shown.length - lastFew).fill(""), ...tail];
  }, [shown, lastFew]);
  const unit = useMemo(() => barScale(shown), [shown]);
  const shownScored = shown.reduce((sum, game) => sum + game.us, 0);
  const shownLetIn = shown.reduce((sum, game) => sum + game.them, 0);
  const open = shown.find((game) => game.id === openId) ?? null;

  const close = useCallback(() => {
    setOpenId(null);
    returnTo.current?.focus();
  }, []);

  if (games.length === 0) {
    return (
      <section className={styles.card} aria-labelledby="analytics-results-title" data-testid="analytics-results">
        <h2 id="analytics-results-title" className={styles.recordLine}>
          No results yet
        </h2>
        <p className={styles.recordSub}>Enter a score after a game and the season shows up here.</p>
        <Link href={links.score} className={styles.textLink}>
          Enter a score
          <IconCaretRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const unbeaten = unbeatenLine(record);
  return (
    <section className={styles.card} aria-labelledby="analytics-results-title" data-testid="analytics-results">
      <h2 id="analytics-results-title" className={styles.recordLine} data-testid="analytics-record">
        {recordLine(record)}
      </h2>
      {unbeaten ? <p className={styles.recordSub}>{unbeaten}</p> : null}

      {games.length > WIDE_GAMES ? (
        <p className={`${styles.windowLabel} ${styles.wideOnly}`}>Last {WIDE_GAMES} games</p>
      ) : null}
      {games.length > NARROW_GAMES ? (
        <p className={`${styles.windowLabel} ${styles.narrowOnly}`}>Last {NARROW_GAMES} games</p>
      ) : null}

      <div
        className={styles.plot}
        style={
          {
            "--unit": `${unit}px`,
            "--up": `${BAR_ROOM.up}px`,
            "--down": `${BAR_ROOM.down}px`,
          } as CSSProperties
        }
        role="group"
        aria-label={`Results, game by game. Goals scored rise above the line, goals let in hang below it.`}
        data-testid="analytics-chart"
      >
        <div className={styles.axis} aria-hidden="true">
          <span className={styles.axisFor}>
            <span className={styles.axisName}>
              <span className={styles.swatchFor} />
              Scored
            </span>
            <span className={`${styles.axisSum} ${styles.wideOnly}`}>{goalsWords(shownScored)}</span>
          </span>
          <span className={styles.axisAgainst}>
            <span className={styles.axisName}>
              <span className={styles.swatchAgainst} />
              Let in
            </span>
            <span className={`${styles.axisSum} ${styles.wideOnly}`}>{goalsWords(shownLetIn)}</span>
          </span>
        </div>
        <div className={styles.cols}>
          {shown.map((game, index) => {
            const result = gameResult(game);
            const far = index < shown.length - lastFew;
            return (
              <button
                key={game.id}
                type="button"
                className={styles.col}
                data-far={far || undefined}
                data-open={open?.id === game.id || undefined}
                data-testid="analytics-game"
                aria-expanded={open?.id === game.id}
                aria-label={`${resultWord(result)} ${scoreLine(game)} against ${game.opponent}, ${dateWords(game.date)}. Show who scored.`}
                onClick={(event) => {
                  if (open?.id === game.id) {
                    close();
                    return;
                  }
                  returnTo.current = event.currentTarget;
                  setOpenId(game.id);
                }}
              >
                <span className={styles.pill} data-result={result} aria-hidden="true">
                  {scoreLine(game)}
                </span>
                <span className={styles.bars} aria-hidden="true">
                  <span className={styles.up}>
                    {game.us > 0 ? <span className={styles.barFor} style={{ "--g": game.us } as CSSProperties} /> : null}
                  </span>
                  <span className={styles.down}>
                    {game.them > 0 ? (
                      <span className={styles.barAgainst} style={{ "--g": game.them } as CSSProperties} />
                    ) : null}
                  </span>
                </span>
                <span className={styles.letter} data-result={result} aria-hidden="true">
                  {RESULT_LETTER[result]}
                </span>
                <span className={`${styles.month} ${styles.wideOnly}`} aria-hidden="true">
                  {wideLabels[index]}
                </span>
                <span className={`${styles.month} ${styles.narrowOnly}`} aria-hidden="true">
                  {narrowLabels[index]}
                </span>
              </button>
            );
          })}
          <span className={styles.baseline} aria-hidden="true" />
        </div>
      </div>
      <p className={styles.key}>
        <span className={styles.keyLetter} data-result="won">W</span> won
        <span className={styles.keyLetter} data-result="drew">D</span> drew
        <span className={styles.keyLetter} data-result="lost">L</span> lost
      </p>

      {open ? (
        <GameCard
          game={open}
          detail={details[open.id]}
          statsHref={links.stats}
          onClose={close}
        />
      ) : null}

      <button
        type="button"
        className={styles.allGames}
        aria-expanded={listOpen}
        aria-controls={listId}
        onClick={() => setListOpen((value) => !value)}
        data-testid="analytics-all-games"
      >
        <span>{listOpen ? "Hide the list" : `All ${formatCount(games.length)} ${games.length === 1 ? "game" : "games"}`}</span>
        <IconCaretRight className={styles.allGamesCaret} data-open={listOpen || undefined} aria-hidden="true" />
      </button>
      <div id={listId} hidden={!listOpen}>
        {listOpen ? <GameTable games={games} /> : null}
      </div>
    </section>
  );
}

/** Every game, newest first, as a plain table: the chart's other view. */
function GameTable({ games }: { games: readonly ResultGame[] }) {
  const newestFirst = useMemo(() => [...games].reverse(), [games]);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid="analytics-table">
        <caption className="sr-only">Every game this season, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Against</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((game) => {
            const result = gameResult(game);
            return (
              <tr key={game.id}>
                <td>{formatClubDate(game.date, "short") ?? game.date}</td>
                <th scope="row" className={styles.tableOpponent}>
                  {game.opponent}
                </th>
                <td>
                  <span className={styles.tableResult} data-result={result}>
                    {resultWord(result)} {scoreLine(game)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GameCard({
  game,
  detail,
  statsHref,
  onClose,
}: {
  game: ResultGame;
  detail: GameDetail | undefined;
  statsHref: string;
  onClose: () => void;
}) {
  const result = gameResult(game);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const scorers = detail?.scorers ?? [];
  const assisters = detail?.assisters ?? [];

  useEffect(() => {
    closeRef.current?.focus();
  }, [game.id]);

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className={styles.gameCard}
        data-testid="analytics-game-card"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.gameTop}>
          <h3 id={titleId} className={styles.gameScore}>
            <span className={styles.tag} data-result={result}>
              {resultWord(result)}
            </span>
            <span className={styles.gameNum}>{scoreLine(game)}</span>
          </h3>
          <button ref={closeRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="Close game details">
            <IconClose className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className={styles.gameVs}>
          vs {game.opponent} · {dateWords(game.date)}
        </p>

        {scorers.length > 0 ? (
          <ul className={styles.scorers} aria-label="Who scored">
            {scorers.map((scorer) => (
              <li key={scorer.playerId} className={styles.scorer}>
                <Avatar id={scorer.playerId} name={scorer.name} size={28} />
                <span className={styles.scorerName} title={scorer.name}>
                  {scorer.name}
                </span>
                <span className={styles.scorerGoals}>{goalsWords(scorer.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.gameNote}>
            {game.us === 0 ? "No goals for us in this game." : "No scorers entered for this game yet."}
          </p>
        )}

        {assisters.length > 0 ? (
          <>
            <p className={styles.gameLabel}>Set up by</p>
            <p className={styles.gameAssist}>
              {assisters.map((a) => `${a.name} ${formatCount(a.count)}`).join(" · ")}
            </p>
          </>
        ) : null}

        <Link href={statsHref} className={styles.textLink}>
          Every player’s numbers
          <IconCaretRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}

// ── One player at a time ─────────────────────────────────────────────────────

type Log = { status: "loading" } | { status: "error" } | { status: "ready"; rows: MatchLogRow[] };

function listLine(player: AnalyticsPlayer): string {
  const figure = player.keeper
    ? `${formatCount(player.saves)} ${player.saves === 1 ? "save" : "saves"}`
    : goalsWords(player.goals);
  return [player.number > 0 ? `#${player.number}` : null, figure].filter(Boolean).join(" · ");
}

function PlayersCard({ data, links }: { data: TeamAnalyticsData; links: TeamAnalyticsLinks }) {
  const clubId = useClubId();
  const everyone = useMemo(() => data.groups.flatMap((group) => group.players), [data.groups]);
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultPlayerId(data.groups));
  const [screen, setScreen] = useState<"list" | "player">("list");
  const [logs, setLogs] = useState<Record<string, Log>>({});
  const [attempt, setAttempt] = useState(0);
  const player = everyone.find((candidate) => candidate.id === selectedId) ?? everyone[0] ?? null;
  const playerId = player?.id ?? null;
  const keeper = player?.keeper ?? false;
  const seasonId = data.season.id;
  const backRef = useRef<HTMLButtonElement>(null);
  const listRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!playerId) return;
    let active = true;
    setLogs((current) => (current[playerId]?.status === "ready" ? current : { ...current, [playerId]: { status: "loading" } }));
    fetchPlayerMatchLog(playerId, keeper, seasonId, clubId)
      .then((rows) => {
        if (active) setLogs((current) => ({ ...current, [playerId]: { status: "ready", rows } }));
      })
      .catch(() => {
        if (active) setLogs((current) => ({ ...current, [playerId]: { status: "error" } }));
      });
    return () => {
      active = false;
    };
  }, [playerId, keeper, seasonId, clubId, attempt]);

  if (!player) {
    return (
      <section className={styles.card} aria-labelledby="analytics-players-title" data-testid="analytics-players">
        <h2 id="analytics-players-title" className={styles.recordLine}>
          No players yet
        </h2>
        <p className={styles.recordSub}>Add your players to see how each one is doing.</p>
        <Link href={links.roster} className={styles.textLink}>
          Team roster
          <IconCaretRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const choose = (id: string, toScreen: boolean) => {
    setSelectedId(id);
    if (toScreen) {
      setScreen("player");
      // The player screen replaces the list: start it at the top
      window.scrollTo?.({ top: 0 });
      requestAnimationFrame(() => backRef.current?.focus());
    }
  };
  const backToList = () => {
    setScreen("list");
    requestAnimationFrame(() => listRefs.current[player.id]?.focus());
  };

  const log: Log = logs[player.id] ?? { status: "loading" };
  return (
    <section
      className={styles.card}
      aria-labelledby="analytics-players-title"
      data-screen={screen}
      data-testid="analytics-players"
    >
      <h2 id="analytics-players-title" className={styles.sectionTitle}>
        One player at a time
      </h2>

      <div className={styles.picker} data-testid="analytics-picker">
        {data.groups.map((group) => (
          <div key={group.position} className={styles.chipRow} role="group" aria-label={GROUP_LABEL[group.position]}>
            <span className={styles.chipLabel}>{GROUP_LABEL[group.position]}</span>
            {group.players.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={styles.chip}
                aria-pressed={candidate.id === player.id}
                data-testid={`analytics-chip-${candidate.id}`}
                onClick={() => choose(candidate.id, false)}
              >
                <Avatar id={candidate.id} name={candidate.name} size={24} />
                <span className={styles.chipName} title={candidate.name}>
                  {candidate.name}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.phoneList} data-testid="analytics-phone-list">
        {POSITION_ORDER.map((position) => {
          const group = data.groups.find((candidate) => candidate.position === position);
          if (!group) return null;
          return (
            <div key={position} role="group" aria-label={GROUP_LABEL[position]}>
              <p className={styles.listGroup}>{GROUP_LABEL[position]}</p>
              <ul className={styles.listRows}>
                {group.players.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className={styles.listRow}
                      ref={(element) => {
                        listRefs.current[candidate.id] = element;
                      }}
                      data-testid={`analytics-row-${candidate.id}`}
                      onClick={() => choose(candidate.id, true)}
                    >
                      <Avatar id={candidate.id} name={candidate.name} size={40} />
                      <span className={styles.listWords}>
                        <span className={styles.listName}>{candidate.name}</span>
                        <span className={styles.listSub}>{listLine(candidate)}</span>
                      </span>
                      <IconCaretRight className={styles.listGo} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className={styles.playerScreen}>
        <button ref={backRef} type="button" className={styles.backToList} onClick={backToList}>
          <IconCaretRight className={styles.backCaret} aria-hidden="true" />
          Players
        </button>
        <PlayerDetail
          player={player}
          log={log}
          games={data.games}
          teamGames={data.record.played}
          statsHref={links.stats}
          onRetry={() => {
            setLogs((current) => ({ ...current, [player.id]: { status: "loading" } }));
            setAttempt((value) => value + 1);
          }}
        />
      </div>
    </section>
  );
}

function PlayerDetail({
  player,
  log,
  games,
  teamGames,
  statsHref,
  onRetry,
}: {
  player: AnalyticsPlayer;
  log: Log;
  games: readonly ResultGame[];
  teamGames: number;
  statsHref: string;
  onRetry: () => void;
}) {
  const rows = log.status === "ready" ? log.rows : [];
  const played = rows.length;
  const rule = player.keeper
    ? "Each corner reaches the edge where they are the best keeper on the team."
    : `Each corner reaches the edge where they are the best ${POSITION_LABEL[player.position].toLowerCase()} on the team.`;
  const ruleShort = player.keeper
    ? "The edge is the team’s best keeper."
    : `The edge is the team’s best ${POSITION_LABEL[player.position].toLowerCase()}.`;
  return (
    <div className={styles.player} data-testid="analytics-player">
      <div className={styles.who}>
        <h3 className={styles.whoName} title={player.name} data-testid="analytics-player-name">
          {player.name}
        </h3>
        <p className={styles.whoRole}>
          {[POSITION_LABEL[player.position], player.number > 0 ? `#${player.number}` : null].filter(Boolean).join(" · ")}
          {log.status === "ready" ? (
            <span className={styles.wideInline}> · {playedLine(played, teamGames)}</span>
          ) : null}
        </p>
      </div>

      <PlayerChart axes={player.axes} name={player.name} />
      <p className={styles.rule}>
        <span className={styles.wideOnly}>{rule}</span>
        <span className={styles.narrowOnly}>{ruleShort}</span>
      </p>

      <RecentGames
        playerKey={player.id}
        log={log}
        games={games}
        statsHref={statsHref}
        onRetry={onRetry}
      />
    </div>
  );
}

function RecentGames({
  playerKey,
  log,
  games,
  statsHref,
  onRetry,
}: {
  playerKey: string;
  log: Log;
  games: readonly ResultGame[];
  statsHref: string;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const listOpen = expanded === playerKey;
  const gameById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const rows = useMemo(() => (log.status === "ready" ? [...log.rows].reverse() : []), [log]);

  return (
    <div className={styles.log} data-testid="analytics-log">
      <div className={styles.logTop}>
        <h4 className={styles.logTitle}>
          <span className={styles.wideOnly}>Recent games</span>
          <span className={styles.narrowOnly}>{listOpen ? "Recent games" : "Last game"}</span>
        </h4>
        {rows.length > 1 ? (
          <button
            type="button"
            className={styles.logAll}
            aria-expanded={listOpen}
            onClick={() => setExpanded(listOpen ? null : playerKey)}
            data-testid="analytics-log-all"
          >
            {listOpen ? "Show fewer" : `All ${formatCount(rows.length)}`}
            <IconCaretRight className={styles.allGamesCaret} data-open={listOpen || undefined} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.logBody} aria-live="polite">
        {log.status === "loading" ? <p className={styles.logNote}>Loading games…</p> : null}
        {log.status === "error" ? (
          <p className={styles.logNote} role="alert">
            This player’s games could not be loaded.{" "}
            <button type="button" className={styles.inlineButton} onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : null}
        {log.status === "ready" && rows.length === 0 ? (
          <p className={styles.logNote} data-testid="analytics-no-games">
            No games yet
          </p>
        ) : null}
        {log.status === "ready" && rows.length > 0 ? (
          <ul className={styles.games}>
            {rows.map((row, index) => {
              const match = gameById.get(row.matchId);
              const when = [
                dateWords(row.date),
                match ? `${resultWord(gameResult(match))} ${scoreLine(match)}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const hidden = !listOpen && index >= 2;
              const hiddenNarrow = !listOpen && index >= 1;
              return (
                <li
                  key={row.matchId}
                  className={styles.game}
                  data-extra-wide={hidden || undefined}
                  data-extra-narrow={hiddenNarrow || undefined}
                  data-testid="analytics-log-game"
                >
                  <span className={styles.gameWhen}>
                    <span className={styles.gameOpp} title={row.opponent}>
                      {row.opponent}
                    </span>
                    <span className={styles.gameDate}>{when}</span>
                  </span>
                  <span className={styles.did}>{didWords(row)}</span>
                  <span className={styles.mins}>
                    <span className={styles.minsTrack} aria-hidden="true">
                      <span className={styles.minsFill} style={{ "--m": minutesFraction(row.mins) } as CSSProperties} />
                    </span>
                    <span className={styles.minsText}>{formatCount(row.mins)} min</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {log.status === "ready" && rows.length > 0 ? (
        <Link href={statsHref} className={styles.textLink}>
          Every player’s numbers
          <IconCaretRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
