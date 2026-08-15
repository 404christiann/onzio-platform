import {
  PathwaySection,
  PathwaySectionHead,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.legal-doc — label + body rows for the Privacy page
 * (MLA P1 Step 5). No interactivity, no client state: a legal document is a
 * reading surface.
 *
 * Each row is one titled clause with one or more paragraphs, so the page can
 * be restructured from content.ts without touching markup. Body paragraphs
 * are plain strings rather than HTML — the presentation config-safety rules
 * in packages/presentation/index.ts reject html/script-ish keys outright, and
 * Phase 2's DB-backed content should inherit the same constraint.
 */

export type PathwayLegalRow = {
  label: string;
  body: string[];
};

export type PathwayLegalDocProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  /** Free-text status line, e.g. when the document was last reviewed. */
  updated?: string;
  rows: PathwayLegalRow[];
};

export default function PathwayLegalDoc({
  eyebrow,
  heading,
  intro,
  updated,
  rows,
}: PathwayLegalDocProps) {
  return (
    <PathwaySection className="pathway-legal-section">
      <PathwaySectionHead eyebrow={eyebrow} heading={heading} intro={intro} />
      {updated && <p className="pathway-legal-updated">{updated}</p>}
      <div className="pathway-legal-rows">
        {rows.map((row) => (
          <section className="pathway-legal-row" key={row.label}>
            <h3 className="pathway-legal-label">{row.label}</h3>
            <div className="pathway-legal-body">
              {row.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PathwaySection>
  );
}
