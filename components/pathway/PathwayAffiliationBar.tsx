/**
 * Thin utility strip above the pathway nav (shell chrome, MLA P1 Step 4).
 *
 * Phase 1 renders neutral grey placeholder marks only — the real
 * affiliation copy/logos are the pathway.affiliation-bar section's job
 * (Step 5, section components), not the shell's. The strip is aria-hidden
 * until it carries real content so screen readers skip the placeholders.
 */
export default function PathwayAffiliationBar() {
  return (
    <div className="pathway-affiliation-bar" aria-hidden="true">
      <span className="pathway-affiliation-placeholder" />
      <span className="pathway-affiliation-placeholder" />
      <span className="pathway-affiliation-placeholder" />
    </div>
  );
}
