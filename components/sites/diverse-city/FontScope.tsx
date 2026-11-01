import type { ReactNode } from "react";

/**
 * Scopes the academy font pack that styles/globals.css keys off
 * `data-font-pack`. `display: contents` adds no box, so Nav, main and Footer
 * keep behaving as direct children of body for flex, grid and stacking.
 */
export default function AcademyFontScope({ children }: { children: ReactNode }) {
  return (
    <div data-font-pack="academy" className="contents">
      {children}
    </div>
  );
}
