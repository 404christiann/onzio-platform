import Link from "next/link";
import {
  IconEdit,
  IconSchedule,
  IconSeasonStats,
  IconStandings,
  type AdminIconComponent,
} from "@/components/admin/icons";
import type { AdminHomeJob, AdminHomeJobId } from "@/lib/admin-route-manifest";
import styles from "./home.module.css";

// ADMIN-RE-05: the home's big jobs; ADMIN-RE-24b restyled them as the design's
// compact tiles (two by two, a count badge on a laptop). Icons from the
// approved icons.download set: cup, calendar, clipboard-text and edit.
const JOB_ICONS: Record<AdminHomeJobId, AdminIconComponent> = {
  "enter-score": IconStandings,
  "add-game": IconSchedule,
  "see-registrations": IconSeasonStats,
  "edit-website": IconEdit,
};

export type HomeJobTile = AdminHomeJob & { hintText: string | null; count?: number | null };

export function HomeJobs({ jobs }: { jobs: readonly HomeJobTile[] }) {
  return (
    <ul className={styles.jobs} aria-label="Jobs" data-count={jobs.length}>
      {jobs.map((job) => {
        const Icon = JOB_ICONS[job.id];
        return (
          <li key={job.id}>
            <Link href={job.href} className={`${styles.job} ${styles.press}`} data-hue={job.hue} data-job={job.id}>
              <span className={styles.jobHead}>
                <span className={styles.tone}>
                  <Icon aria-hidden="true" />
                </span>
                {job.count ? (
                  <span className={styles.badge} aria-hidden="true">
                    {job.count.toLocaleString("en-US")}
                  </span>
                ) : null}
              </span>
              <span className={styles.jobText}>
                <span className={styles.jobLabel}>{job.label}</span>
                {job.hintText ? <span className={styles.jobHint}>{job.hintText}</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
