import { PathwaySection } from "@/components/pathway/PathwaySection";

/**
 * pathway.partner-strip — the partner/sponsor logo row (MLA P1 Step 5).
 *
 * Phase 1 has no supplied partner logos and no confirmed partner list, so
 * this renders neutral unbranded tiles in the same treatment as
 * PathwayMediaPlaceholder — never an invented partner name, wordmark or
 * logo. `count` only controls how many empty slots the row reserves; the
 * tiles carry no meaning and are hidden from assistive technology, with the
 * section's own label and note carrying the honest explanation instead.
 *
 * When real logos arrive the section keeps its shape and the tiles are
 * replaced by the platform's normal media delivery.
 */

export type PathwayPartnerStripProps = {
  label?: string;
  /** Number of neutral placeholder tiles to reserve. */
  count?: number;
  note?: string;
};

export default function PathwayPartnerStrip({
  label,
  count = 6,
  note,
}: PathwayPartnerStripProps) {
  const tiles = Array.from({ length: Math.max(0, count) }, (_, index) => index);

  return (
    <PathwaySection className="pathway-partner-section">
      {label && <span className="pathway-partner-label">{label}</span>}
      <div className="pathway-partner-row" aria-hidden="true">
        {tiles.map((index) => (
          <span className="pathway-partner-tile" key={index} />
        ))}
      </div>
      {note && <p className="pathway-partner-note">{note}</p>}
    </PathwaySection>
  );
}
