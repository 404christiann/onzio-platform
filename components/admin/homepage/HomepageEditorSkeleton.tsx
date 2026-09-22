/** Mirrors the page editing surface while authenticated content is loading. */
export default function HomepageEditorSkeleton() {
  return <section className="hp-editor hp-loading" aria-label="Homepage editor" aria-busy="true">
    <span className="sr-only" role="status" aria-label="Loading your homepage">Loading your homepage…</span>
    <div aria-hidden="true">
      <div className="hp-heading"><h1>Homepage</h1><div data-slot="skeleton" className="hp-skeleton hp-skeleton-button" /></div>
      <div data-slot="skeleton" className="hp-skeleton hp-skeleton-status" />
      <div data-slot="skeleton" className="hp-skeleton hp-skeleton-surface"><div data-slot="skeleton" className="hp-skeleton hp-skeleton-copy" /><div data-slot="skeleton" className="hp-skeleton hp-skeleton-copy" /></div>
    </div>
  </section>;
}
