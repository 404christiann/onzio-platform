// CV United C1: the draft-gate panel a regular (non-preview) visitor sees at
// /join/academy while the club's academy_registration form is not yet
// `status = 'live'` -- or while there is no academy_registration form for
// this club at all. Deliberately a placeholder, not a disabled/greyed-out
// copy of the real form: it must not reveal fields, price, or waiver text
// that are not final yet. See app/_clubs/[slug]/join/academy/page.tsx for
// the RLS-backed logic that decides whether this renders instead of the
// real form.
export default function RegistrationOpeningSoon({
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
        Registration Opening Soon
      </h1>
      <p className="mt-6 font-body text-[var(--crest-text-secondary)]">
        We&apos;re not accepting academy registrations here yet. Check back
        soon, or get in touch with the club directly for more information.
      </p>
      <a href="/contact" className="crest-cta crest-cta-primary mt-8 self-center">
        Contact the club
      </a>
    </main>
  );
}
