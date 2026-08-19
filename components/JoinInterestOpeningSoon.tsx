// CV United C1: the fallback a regular (non-preview) visitor sees at
// /join/interest when the club has no general_interest form, or it is not
// `status = 'live'` -- the interest-sign-up sibling of
// components/RegistrationOpeningSoon.tsx (the /join/academy equivalent).
// See app/%5Fclubs/[slug]/join/interest/page.tsx for the RLS-backed lookup
// that decides whether this renders instead of the real form: a public
// visitor querying a draft/closed/nonexistent form gets `null` back and
// lands here, with no way to distinguish which case it was.
export default function JoinInterestOpeningSoon({
  clubName,
}: {
  clubName: string;
}) {
  return (
    <main
      className="crest-home mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24 text-center lg:px-10"
      data-presentation-template="crest@1"
    >
      <p className="font-body text-sm uppercase tracking-[0.2em] text-[var(--crest-text-secondary)]">
        {clubName}
      </p>
      <h1 className="mt-3 font-display text-4xl font-black uppercase leading-none">
        Sign-Up Opening Soon
      </h1>
      <p className="mt-6 font-body text-[var(--crest-text-secondary)]">
        We&apos;re not accepting general interest sign-ups here yet. Check
        back soon, or get in touch with the club directly for more
        information.
      </p>
      <a href="/contact" className="crest-cta crest-cta-primary mt-8 self-center">
        Contact the club
      </a>
    </main>
  );
}
