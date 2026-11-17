"use client";

import Link from "next/link";
import type { AnalyticsPlayer, PlayerPosition } from "@/lib/admin-analytics-data";
import type { ResultGame } from "@/lib/admin-analytics-view";
import { AnalyticsScope, PlayerDetail, usePlayerLog } from "./TeamAnalytics";
import { TopBarTitle } from "./TopBar";
import styles from "./home.module.css";

// ADMIN-RE-24d: one player's page under the Games tab. The chips are real
// links to each teammate in the same position; the chart and recent games are
// RE-19's PlayerDetail, fed by the same on-demand fetchPlayerMatchLog read. A
// game still missing a score shows first, with Enter score.

const GROUP_WORDS: Record<PlayerPosition, string> = {
  Goalkeeper: "Goalkeepers",
  Defender: "Defenders",
  Midfielder: "Midfielders",
  Forward: "Forwards",
};

export function PlayerPage({
  player,
  teammates,
  position,
  season,
  games,
  teamGames,
  statsHref,
  missingScore,
}: {
  player: AnalyticsPlayer;
  teammates: readonly { id: string; name: string }[];
  position: PlayerPosition;
  season: { id: string; label: string };
  games: readonly ResultGame[];
  teamGames: number;
  statsHref: string;
  missingScore: { title: string; sub: string; href: string } | null;
}) {
  const { log, retry } = usePlayerLog(player.id, player.keeper, season.id);
  const role = [player.number > 0 ? `#${player.number}` : null, position, season.label].filter(Boolean).join(" · ");
  return (
    <div className={`${styles.page} ${styles.vars}`} data-testid="player-page">
      <TopBarTitle title={player.name} />
      <div className={styles.hello}>
        <h1 className={styles.greeting} title={player.name}>
          {player.name}
        </h1>
        <p>{role}</p>
      </div>
      {teammates.length > 1 ? (
        <nav className={styles.chips} aria-label={GROUP_WORDS[position]}>
          {teammates.map((mate) => (
            <Link
              key={mate.id}
              href={`/admin/games/players/${mate.id}`}
              className={`${styles.chip} ${styles.press}`}
              aria-current={mate.id === player.id ? "page" : undefined}
              title={mate.name}
              replace
            >
              {mate.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {missingScore ? (
        <div className={`${styles.card} ${styles.row}`} data-hue="amber" data-testid="player-missing-score">
          <span className={styles.txt}>
            <b className={styles.clamp2}>{missingScore.title}</b>
            <small className={styles.clamp2}>{missingScore.sub}</small>
          </span>
          <Link href={missingScore.href} className={`${styles.smallButton} ${styles.press}`} data-kind="primary">
            Enter score
          </Link>
        </div>
      ) : null}
      <section aria-label="This season" className={`${styles.card} ${styles.pad}`}>
        <AnalyticsScope>
          <PlayerDetail
            player={player}
            log={log}
            games={games}
            teamGames={teamGames}
            statsHref={statsHref}
            onRetry={retry}
            showName={false}
          />
        </AnalyticsScope>
      </section>
    </div>
  );
}
