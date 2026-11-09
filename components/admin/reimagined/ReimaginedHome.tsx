import type { AdminMoreRow } from "@/lib/admin-route-manifest";
import { HomeJobs, type HomeJobTile } from "./HomeJobs";
import { MoreList } from "./MoreList";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the reimagined home (design: cd-phone, cd-desktop). Server
// rendered; app/admin/(protected)/page.tsx loads the data and passes it in.

export function ReimaginedHome({
  clubName,
  greeting,
  jobs,
  moreRows,
  contentPaused,
}: {
  clubName: string;
  greeting: string;
  jobs: readonly HomeJobTile[];
  moreRows: readonly AdminMoreRow[];
  contentPaused: boolean;
}) {
  return (
    <div className={styles.home} data-admin-home="reimagined">
      <header className={styles.homeHead}>
        <p className={styles.club}>
          <span className={styles.clubName} title={clubName} data-testid="admin-home-club-name">
            {clubName}
          </span>
          <span className={styles.clubTail}>{" · Club admin"}</span>
        </p>
        <h1 className={styles.greeting} title={greeting}>
          {greeting}
        </h1>
        <p className={styles.ask}>What do you want to do?</p>
      </header>
      {jobs.length ? <HomeJobs jobs={jobs} /> : null}
      {contentPaused ? (
        <p className={styles.paused}>
          Changes to your website are paused right now, so the jobs that change it are hidden.
        </p>
      ) : null}
      <MoreList rows={moreRows} />
    </div>
  );
}

export function ReimaginedHomeSkeleton() {
  return (
    <div className={styles.home} aria-busy="true" aria-label="Loading your club admin">
      <header className={styles.homeHead}>
        <span className={`${styles.skeletonBlock} block h-4 w-40 max-w-full`} />
        <span className={`${styles.skeletonBlock} mt-3 block h-9 w-48 max-w-full`} />
        <span className={`${styles.skeletonBlock} mt-3 block h-4 w-44 max-w-full`} />
      </header>
      <ul className={styles.jobs} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index}>
            <span className={styles.job}>
              <span className={`${styles.skeletonBlock} block size-10`} />
              <span className={`${styles.skeletonBlock} block h-4 w-24 max-w-full`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
