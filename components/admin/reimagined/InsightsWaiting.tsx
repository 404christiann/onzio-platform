import {
  IconAnalytics,
  IconDownload,
  IconLock,
  IconMapPin,
  IconMatchStats,
  IconSponsors,
} from "@/components/admin/icons";
import styles from "./frame.module.css";

// ADMIN-RE-24: Insights before there are numbers to show. Held: the website is
// not live, so there is nobody to count (design: "Your website isn't live
// yet"). Otherwise the app does not count visits yet. Never zeros.

const SOON = [
  [IconMatchStats, "Visits by day, with matchday spikes"],
  [IconAnalytics, "Your most visited pages"],
  [IconSponsors, "How often each sponsor’s logo is seen and clicked"],
  [IconMapPin, "Where visitors are, and what they use"],
  [IconDownload, "A monthly sponsor report to send to sponsors"],
] as const;

export function InsightsWaiting({ held }: { held: boolean }) {
  return (
    <>
      <div className={`${styles.card} ${styles.held} ${styles.wide}`} data-testid="insights-waiting" data-held={held || undefined}>
        <span className={styles.tone} data-hue="blue">
          <IconLock aria-hidden="true" />
        </span>
        <span className={styles.heldText}>
          <b>{held ? "Your website isn’t live yet" : "No visit numbers yet"}</b>
          <small>
            {held
              ? "It’s held until it relaunches, so there are no visitors to count. Numbers start the day it goes live, and your first sponsor report comes at the end of that month."
              : "Visits to your website aren’t being counted yet. Numbers start here once they are, and your first sponsor report comes at the end of that month."}
          </small>
        </span>
      </div>
      <section aria-labelledby="insights-soon" className={styles.wide}>
        <h2 id="insights-soon" className={styles.label}>
          What you’ll see here
        </h2>
        <ul className={`${styles.card} ${styles.soon}`}>
          {SOON.map(([Icon, text]) => (
            <li key={text}>
              <Icon aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
