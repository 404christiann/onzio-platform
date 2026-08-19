import Link from "next/link";

// CV United C1: the real `/join` chooser -- two clearly separated paths onto
// its two sibling routes, /join/interest and /join/academy. The tenant page
// (app/%5Fclubs/[slug]/join/page.tsx) resolves which registration_forms are
// actually `status = 'live'` for this club and passes that down as
// booleans; the canonical shell (app/(public)/join/page.tsx) passes
// neither, which safely renders both paths as "not open yet" rather than
// guessing.
//
// Styled with crest@1's `.crest-home` navy/gold/white tokens
// (styles/globals.css) and its `.crest-cta` button classes, the same
// mechanism components/crest/CrestHomePage.tsx's Home root uses -- this
// route is crest@1-only (see app/%5Fclubs/[slug]/join/page.tsx's template
// guard), so there is no other template to keep visually distinct from.
// General interest uses the gold secondary action (free, low-friction);
// Academy registration uses the navy primary action (the paid conversion
// path).
//
// The Academy path is always linked (another agent owns /join/academy's own
// gating); this component only surfaces whether it looks open yet.
export type JoinPageProps = {
  generalInterestLive?: boolean;
  academyLive?: boolean;
};

export default function JoinPage({
  generalInterestLive = false,
  academyLive = false,
}: JoinPageProps) {
  return (
    <main
      className="crest-home mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-24 lg:px-10"
      data-presentation-template="crest@1"
    >
      <h1 className="font-display text-4xl font-black uppercase leading-none">
        Join
      </h1>
      <p className="mt-4 font-body text-[var(--crest-text-secondary)]">
        Choose the path that fits you.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section className="rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-elevated)] p-6">
          <h2 className="font-display text-xl font-bold uppercase">
            General interest / sign up
          </h2>
          <p className="mt-2 font-body text-sm text-[var(--crest-text-secondary)]">
            Free and low-friction. Tell us about your player and we&apos;ll
            follow up.
          </p>
          {generalInterestLive ? (
            <Link href="/join/interest" className="crest-cta crest-cta-secondary mt-6">
              Sign up
            </Link>
          ) : (
            <p className="mt-6 font-body text-sm text-[var(--crest-text-secondary)]">
              Registration details have not been published yet.
            </p>
          )}
        </section>

        <section className="rounded-sm border border-[var(--crest-border-subtle)] bg-[var(--crest-surface-elevated)] p-6">
          <h2 className="font-display text-xl font-bold uppercase">
            Academy team registration
          </h2>
          <p className="mt-2 font-body text-sm text-[var(--crest-text-secondary)]">
            Paid roster registration for our academy teams.
          </p>
          <Link href="/join/academy" className="crest-cta crest-cta-primary mt-6">
            Register
          </Link>
          {!academyLive && (
            <p className="mt-2 font-body text-xs text-[var(--crest-text-secondary)]">
              Opening soon.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
