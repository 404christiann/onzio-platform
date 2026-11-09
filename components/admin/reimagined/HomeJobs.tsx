import Link from "next/link";
import {
  IconEdit,
  IconSchedule,
  IconSeasonStats,
  IconStandings,
  type AdminIconComponent,
} from "@/components/admin/icons";
import type { AdminHomeJob, AdminHomeJobId } from "@/lib/admin-route-manifest";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the home's big jobs. Icons from the approved icons.download set:
// cup, calendar, clipboard-text and edit.
const JOB_ICONS: Record<AdminHomeJobId, AdminIconComponent> = {
  "enter-score": IconStandings,
  "add-game": IconSchedule,
  "see-registrations": IconSeasonStats,
  "edit-website": IconEdit,
};

export type HomeJobTile = AdminHomeJob & { hintText: string | null };

export function HomeJobs({ jobs }: { jobs: readonly HomeJobTile[] }) {
  return (
    <ul className={styles.jobs} aria-label="Jobs">
      {jobs.map((job) => {
        const Icon = JOB_ICONS[job.id];
        return (
          <li key={job.id}>
            <Link href={job.href} className={styles.job} data-hue={job.hue} data-job={job.id}>
              <span className={styles.jobIcon}>
                <Icon className="size-6" aria-hidden="true" />
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
