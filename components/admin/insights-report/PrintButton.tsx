"use client";

import { IconDownload } from "@/components/admin/icons";
import styles from "./report.module.css";

// TELEMETRY-05: "Download PDF" is the browser's own print dialog. The report's print
// styles (report.module.css) hide the admin frame and lay each sponsor out as one page,
// so "Save as PDF" in that dialog gives the sheets a sponsor can be sent.
export function PrintButton() {
  return (
    <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => window.print()}>
      <IconDownload aria-hidden="true" />
      Download PDF
    </button>
  );
}
