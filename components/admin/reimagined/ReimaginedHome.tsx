import Link from "next/link";
import { IconSeasonStats, IconStandings, type AdminIconComponent } from "@/components/admin/icons";
import type { HomeBoard } from "@/lib/admin-home-board";
import { NextGame, SeasonGlance, VisitsGlance } from "./Glance";
import { HomeJobs, type HomeJobTile } from "./HomeJobs";
import styles from "./home.module.css";

// ADMIN-RE-24b: the home (design: admin-plain-search-two-clubs.html). The
// greeting and how many things need you, each with its own button; the next
// game; the jobs; and the season and the website at a glance. Server rendered;
// app/admin/(protected)/page.tsx loads the data and passes it in. The pages
// that RE-05's More list held are on the tabs (ADMIN-RE-24a).

export type HomeNeed = {
  id: "score" | "sign-ups";
  hue: "amber" | "green";
  title: string;
  sub: string;
  action: { label: string; href: string; kind: "primary" | "secondary" };
};

const NEED_ICONS: Record<HomeNeed["id"], AdminIconComponent> = {
  score: IconStandings,
  "sign-ups": IconSeasonStats,
};

export function ReimaginedHome({
  greeting,
  summary,
  needs,
  jobs,
  board,
  held,
  visitsHref,
  seasonHref,
  addGameHref,
  contentPaused,
}: {
  greeting: string;
  summary: string;
  needs: readonly HomeNeed[];
  jobs: readonly HomeJobTile[];
  board: HomeBoard;
  held: boolean;
  visitsHref: string;
  seasonHref: string;
  addGameHref: string | null;
  contentPaused: boolean;
}) {
  return (
    <div className={styles.page} data-admin-home="reimagined">
      <div className={styles.hello}>
        <h1 className={styles.greeting} title={greeting}>
          {greeting}
        </h1>
        <p data-testid="home-summary">{summary}</p>
      </div>
      <div className={styles.split}>
        <div className={styles.stack}>
          {needs.length ? (
            <section aria-labelledby="home-needs">
              <h2 id="home-needs" className={styles.label} data-hue="amber">
                Needs you
                <span className={styles.count}>{needs.length} to do</span>
              </h2>
              <ul className={styles.card}>
                {needs.map((need) => {
                  const Icon = NEED_ICONS[need.id];
                  return (
                    <li key={need.id} className={styles.row} data-hue={need.hue} data-need={need.id}>
                      <span className={styles.tone}>
                        <Icon aria-hidden="true" />
                      </span>
                      <span className={styles.txt}>
                        <b className={styles.clamp2} title={need.title}>
                          {need.title}
                        </b>
                        <small className={styles.clamp2}>{need.sub}</small>
                      </span>
                      <Link
                        href={need.action.href}
                        className={`${styles.smallButton} ${styles.press}`}
                        data-kind={need.action.kind}
                        aria-label={`${need.action.label}: ${need.title}`}
                      >
                        {need.action.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <NextGame game={board.nextGame} addHref={addGameHref} />
        </div>
        <div className={styles.stack}>
          <section aria-labelledby="home-jobs">
            <h2 id="home-jobs" className={styles.label}>
              Jobs
            </h2>
            {jobs.length ? <HomeJobs jobs={jobs} /> : null}
            {contentPaused ? (
              <p className={styles.paused}>
                Changes to your website are paused right now, so the jobs that change it are hidden.
              </p>
            ) : null}
          </section>
          <section aria-labelledby="home-glance">
            <h2 id="home-glance" className={styles.label}>
              At a glance
            </h2>
            <div className={styles.glance}>
              <SeasonGlance season={board.season} href={seasonHref} />
              <VisitsGlance held={held} href={visitsHref} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ReimaginedHomeSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading your club admin">
      <div className={styles.hello}>
        <span className={`${styles.skeletonBlock} block h-9 w-48 max-w-full`} />
        <span className={`${styles.skeletonBlock} mt-3 block h-4 w-44 max-w-full`} />
      </div>
      <ul className={styles.jobs} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index}>
            <span className={styles.job}>
              <span className={`${styles.skeletonBlock} block size-9`} />
              <span className={`${styles.skeletonBlock} block h-4 w-24 max-w-full`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
