import {
  PathwaySection,
  PathwaySectionHead,
  type PathwayTone,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.spec-list — label/value detail rows in two columns
 * (MLA P1 Step 5).
 *
 * The row type is a discriminated union on purpose. Some club facts are
 * genuinely not decided yet (Senior Club specifics, seasonal promo details),
 * and the Phase 1 rule is that unresolved facts are shown as unresolved
 * rather than filled with plausible-looking fiction. A `{ label, state:
 * "tbc" }` row therefore renders the label normally and marks the value
 * slot with an explicit "TBC" badge plus muted "To be confirmed" text, so it
 * reads as a deliberate editorial state and not as a rendering bug or an
 * empty database column.
 *
 * Rows flow down the first column then the second on desktop (CSS columns),
 * and collapse to a single column on narrow viewports.
 */

export type PathwaySpecRow =
  | { label: string; value: string }
  | { label: string; state: "tbc" };

export type PathwaySpecListProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  rows: PathwaySpecRow[];
  /** Optional line under the grid, e.g. why some rows are still open. */
  note?: string;
  tone?: PathwayTone;
};

function isTbc(row: PathwaySpecRow): row is { label: string; state: "tbc" } {
  return "state" in row;
}

export default function PathwaySpecList({
  eyebrow,
  heading,
  intro,
  rows,
  note,
  tone = "light",
}: PathwaySpecListProps) {
  if (rows.length === 0) return null;

  return (
    <PathwaySection tone={tone} className="pathway-spec-section">
      <PathwaySectionHead eyebrow={eyebrow} heading={heading} intro={intro} />
      <dl className="pathway-spec-list">
        {rows.map((row) => (
          <div
            className="pathway-spec-row"
            data-state={isTbc(row) ? "tbc" : "resolved"}
            key={row.label}
          >
            <dt className="pathway-spec-label">{row.label}</dt>
            <dd className="pathway-spec-value">
              {isTbc(row) ? (
                <>
                  <span className="pathway-spec-badge">TBC</span>
                  <span className="pathway-spec-tbc-text">To be confirmed</span>
                </>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="pathway-spec-note">{note}</p>}
    </PathwaySection>
  );
}
