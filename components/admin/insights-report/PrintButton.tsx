"use client";

import { Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// TELEMETRY-05: opens the browser's own print dialog. The report's print styles
// (report.module.css) hide the admin frame and put each page on its own sheet,
// so "Save as PDF" in that dialog gives the file a sponsor can be sent.
export function PrintButton() {
  return (
    <button type="button" className={`${buttonVariants()} min-h-11 px-4 text-base`} onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      Print or save as PDF
    </button>
  );
}
