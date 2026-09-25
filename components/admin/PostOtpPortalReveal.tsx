import Image from "@/components/ResilientImage";
import { Spinner } from "@/components/ui/spinner";
import styles from "./PostOtpPortalReveal.module.css";

/** The approved Portal reveal transition shown while post-OTP navigation resolves. */
export default function PostOtpPortalReveal() {
  return (
    <div
      className={styles.root}
      data-testid="post-otp-portal-reveal"
      role="status"
      aria-label="Opening your dashboard"
      aria-live="polite"
    >
      <div className={styles.shell} aria-hidden="true">
        <aside className={styles.sidebar}>
          <Image
            src="/images/onzio/onzio-black-logo-no-bg-trimmed.png"
            alt=""
            width={100}
            height={26}
            className={styles.brand}
          />
          <div className={styles.navLine} />
          <div className={styles.navLineShort} />
          <div className={styles.navLine} />
          <div className={styles.navLineShort} />
        </aside>
        <div className={styles.workspace}>
          <div className={styles.mockTitle} />
          <div className={styles.mockSubtitle} />
          <div className={styles.mockGrid}>
            <div className={styles.mockTile} />
            <div className={styles.mockTile} />
            <div className={styles.mockTile} />
          </div>
          <div className={styles.mockWide} />
        </div>
      </div>

      <div className={styles.veil} aria-hidden="true" />

      <div className={styles.message}>
        <Spinner
          className={styles.spinner}
          aria-hidden="true"
          aria-label={undefined}
          role="presentation"
        />
        <h1 className={styles.heading}>Opening your dashboard</h1>
        <p className={styles.detail}>Getting your workspace ready.</p>
      </div>
    </div>
  );
}
