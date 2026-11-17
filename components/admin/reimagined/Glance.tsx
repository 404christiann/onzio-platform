import Link from "next/link";
import { ChevronRight, IconSchedule } from "@/components/admin/icons";
import { recordLine } from "@/lib/admin-analytics-view";
import { gameLine, recordShort, resultBars, versus, type BoardGame, type HomeBoard } from "@/lib/admin-home-board";
import { formatClubDate } from "@/lib/club-time";
import styles from "./home.module.css";

// ADMIN-RE-24b: the pieces the home and the Games tab share (design:
// admin-plain-search-two-clubs.html). Magenta is how the team plays; blue is
// website visits. Bars are spans, not a chart library; every bar has its score
// in words for a screen reader, and color never carries meaning alone.

export function ResultBars({ games, large }: { games: Extract<HomeBoard["season"], { status: "ready" }>["recent"]; large?: boolean }) {
  if (games.length === 0) return null;
  return (
    <span className={styles.results} data-large={large || undefined} role="img" aria-label="Goals scored and let in, game by game">
      {resultBars(games).map((bar) => (
        <span key={bar.id} className={styles.resultCol} title={bar.label}>
          <span className={styles.resultUp}>
            <i style={{ height: `${bar.up * 100}%` }} />
          </span>
          <span className={styles.resultLine} />
          <span className={styles.resultDown}>
            <i style={{ height: `${bar.down * 100}%` }} />
          </span>
        </span>
      ))}
    </span>
  );
}

/** Home's season card: record, top scorer and the last eight games. */
export function SeasonGlance({ season, href }: { season: HomeBoard["season"]; href: string }) {
  if (season.status === "error") return null;
  if (season.status === "no-season") {
    return (
      <Link href="/admin/seasons" className={`${styles.gcard} ${styles.press}`} data-dashed="" data-testid="glance-season">
        <span className={styles.gk}>
          This season
          <ChevronRight aria-hidden="true" />
        </span>
        <span className={styles.gv}>No season shown</span>
        <span className={styles.gs}>Pick the season your website shows.</span>
      </Link>
    );
  }
  return (
    <Link href={href} className={`${styles.gcard} ${styles.press}`} data-testid="glance-season">
      <span className={styles.gk}>
        <span className={styles.ellipsis}>{season.label}</span>
        <ChevronRight aria-hidden="true" />
      </span>
      <span className={styles.gv}>
        <span aria-hidden="true">{recordShort(season.record)}</span>
        <span className={styles.srOnly}>{recordLine(season.record)}</span>
      </span>
      <span className={styles.gs}>
        {season.topScorer ? `Top scorer: ${season.topScorer.name}` : season.record.played ? "No goals yet" : "No results yet"}
      </span>
      <ResultBars games={season.recent} />
    </Link>
  );
}

/**
 * Home's website card. The app does not count visits yet, so it says why there
 * are no numbers instead of showing zeros.
 */
export function VisitsGlance({ held, href }: { held: boolean; href: string }) {
  return (
    <Link href={href} className={`${styles.gcard} ${styles.press}`} data-dashed="" data-testid="glance-visits">
      <span className={styles.gk}>
        Website
        <ChevronRight aria-hidden="true" />
      </span>
      <span className={styles.gv}>{held ? "Not live yet" : "Not counted yet"}</span>
      <span className={styles.gs}>
        {held ? "Visit numbers start the day your site relaunches." : "Visit numbers show here once visits are counted."}
      </span>
    </Link>
  );
}

export function NextGame({ game, addHref }: { game: HomeBoard["nextGame"]; addHref: string | null }) {
  if (game === "unknown") return null;
  return (
    <section aria-labelledby="home-next-game">
      <h2 id="home-next-game" className={styles.label}>
        Next game
        {game && game.home !== null ? <span className={styles.count}>{game.home ? "Home" : "Away"}</span> : null}
      </h2>
      {game ? <NextGameCard game={game} /> : (
        <div className={`${styles.card} ${styles.row}`}>
          <span className={styles.tone}>
            <IconSchedule aria-hidden="true" />
          </span>
          <span className={styles.txt}>
            <b>No games coming up</b>
            <small>Add the next one and it shows on your website.</small>
          </span>
          {addHref ? (
            <Link href={addHref} className={`${styles.smallButton} ${styles.press}`} data-kind="secondary">
              Add a game
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function NextGameCard({ game }: { game: BoardGame }) {
  const [weekday, day] = (formatClubDate(game.date, "weekday-day") ?? "").split(" ");
  const month = formatClubDate(game.date, "short")?.split(" ")[0] ?? "";
  return (
    <Link href="/admin/schedule" className={`${styles.card} ${styles.row} ${styles.press}`} data-testid="home-next-game-card">
      <span className={styles.date} aria-hidden="true">
        <small>{month}</small>
        <b>{Number(day) || ""}</b>
        <small>{weekday}</small>
      </span>
      <span className={styles.txt}>
        <b className={styles.clamp2} title={versus(game)}>
          {versus(game)}
        </b>
        <small className={styles.clamp2}>{gameLine(game, "venue")}</small>
      </span>
      <ChevronRight className={styles.go} aria-hidden="true" />
    </Link>
  );
}

/** The Games tab's season card: the record in three tiles, the bars, a legend. */
export function SeasonCard({ season }: { season: HomeBoard["season"] }) {
  if (season.status !== "ready") return null;
  const { record } = season;
  return (
    <section aria-labelledby="games-season" className={`${styles.wide} ${styles.vars}`}>
      <h2 id="games-season" className={styles.label}>
        How the team is doing
      </h2>
      <div className={`${styles.card} ${styles.pad}`} data-testid="games-season-card">
        <div className={styles.seasonHead}>
          <b className={styles.ellipsis}>{season.label}</b>
          <span>{season.topScorer ? `Top scorer: ${season.topScorer.name}, ${season.topScorer.goals.toLocaleString("en-US")} ${season.topScorer.goals === 1 ? "goal" : "goals"}` : null}</span>
        </div>
        <div className={styles.seasonLine}>
          <span><b>{record.won}</b>Won</span>
          <span><b>{record.drawn}</b>Drew</span>
          <span><b>{record.lost}</b>Lost</span>
        </div>
        <ResultBars games={season.recent} large />
        <div className={styles.legend}>
          <span><i data-swatch="scored" />Scored</span>
          <span><i data-swatch="against" />Let in</span>
          <Link href="/admin/analytics" className={styles.more}>
            See every game and player →
          </Link>
        </div>
      </div>
    </section>
  );
}
