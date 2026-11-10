import Link from "next/link";
import { ChevronRight } from "@/components/admin/icons";
import { avatarInitials, goalsWords } from "@/lib/admin-analytics-view";
import type { PositionGroup } from "@/lib/admin-analytics-data";
import styles from "./home.module.css";

// ADMIN-RE-24d: the Games tab's Players card, under the season's results
// (design: admin-plain-search-two-clubs.html). Forwards, then midfielders, a
// few each, then "See all N players" on How the team is doing. Each row opens
// that player's page.

const SHOWN = ["Forward", "Midfielder"] as const;
const PER_GROUP = 4;
const GROUP_WORDS = { Forward: "Forwards", Midfielder: "Midfielders" } as const;

export function PlayersList({ groups, allHref, rosterHref }: { groups: readonly PositionGroup[]; allHref: string; rosterHref: string }) {
  const total = groups.reduce((sum, group) => sum + group.players.length, 0);
  return (
    <section aria-labelledby="games-players" className={`${styles.wide} ${styles.vars}`}>
      <h2 id="games-players" className={styles.label}>
        Players
        {total ? <span className={styles.count}>{total.toLocaleString("en-US")} {total === 1 ? "player" : "players"}</span> : null}
      </h2>
      <div className={styles.card} data-testid="games-players">
        {total === 0 ? (
          <div className={styles.row}>
            <span className={styles.txt}>
              <b>No players yet</b>
              <small>Add your players to see how each one is doing.</small>
            </span>
            <Link href={rosterHref} className={`${styles.smallButton} ${styles.press}`} data-kind="secondary">
              Team roster
            </Link>
          </div>
        ) : (
          <>
            {SHOWN.map((position) => {
              const group = groups.find((candidate) => candidate.position === position);
              if (!group?.players.length) return null;
              return (
                <div key={position} role="group" aria-label={GROUP_WORDS[position]}>
                  <p className={styles.group}>{GROUP_WORDS[position]}</p>
                  {group.players.slice(0, PER_GROUP).map((player) => (
                    <Link
                      key={player.id}
                      href={`/admin/games/players/${player.id}`}
                      className={`${styles.prow} ${styles.press}`}
                      data-player={player.id}
                    >
                      <span className={styles.initials} aria-hidden="true">
                        {avatarInitials(player.name)}
                      </span>
                      <span className={styles.txt}>
                        <b className={styles.ellipsis} title={player.name}>
                          {player.name}
                        </b>
                        <small>{[player.number > 0 ? `#${player.number}` : null, goalsWords(player.goals)].filter(Boolean).join(" · ")}</small>
                      </span>
                      <ChevronRight className={styles.go} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              );
            })}
            <Link href={allHref} className={`${styles.prow} ${styles.press} ${styles.seeAll}`}>
              See all {total.toLocaleString("en-US")} {total === 1 ? "player" : "players"}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
