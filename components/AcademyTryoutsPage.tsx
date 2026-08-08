import ResilientImage from "@/components/ResilientImage";
import type { TryoutContent } from "@/lib/queries";

function eventDate(value: string | null): string {
  if (!value) return "TBA";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? "TBA"
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

// Mockup-parity tryouts page (DCFC-D132 pass): navy hero with the sky
// "Join <club>" headline, the mockup's upcoming-state message, a red
// interest CTA, and the DATE/LOCATION/COST hairline columns that
// legitimately read "TBA" until the club publishes real logistics
// (DCFC-D102's approved no-fabrication pattern — the CTA is a mailto to
// the club's own published address, never a placeholder registration URL).
// Published tryout rows render below with their real details and actions.
export default function AcademyTryoutsPage({
  tryouts,
  clubName = "the club",
  contactEmail = "",
}: {
  tryouts: TryoutContent[];
  clubName?: string;
  contactEmail?: string;
}) {
  const hero = tryouts.find((item) => item.heroMediaUrl)?.heroMediaUrl ?? "";
  const hasTryouts = tryouts.length > 0;
  const email = contactEmail.trim();
  const emptyStateDetails = [
    { label: "Date", value: "TBA" },
    { label: "Location", value: "TBA" },
    { label: "Cost", value: "TBA" },
  ];

  return (
    <div className="bg-[#F9FAFD]">
      <section className="relative isolate overflow-hidden bg-[#1E3653] px-6 pb-20 pt-40 text-white lg:px-10 lg:pb-28">
        {hero ? (
          <>
            <ResilientImage
              src={hero}
              alt=""
              fill
              priority
              className="-z-20 object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 -z-10 bg-[#14283F]/70" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl">
          <h1 className="max-w-4xl font-display text-[clamp(3.4rem,8vw,7rem)] font-black uppercase italic leading-[.9]">
            <span className="text-[#B9E3F6]">Join {clubName}</span>
          </h1>
          <p className="mt-8 max-w-2xl font-body text-base leading-8 text-white/75 md:text-lg">
            {hasTryouts
              ? "Review current club evaluations below. Registration, waivers, and participant information stay with the club's external provider."
              : "Tryout dates and locations are still being finalized. Register your interest below to stay informed once details are announced."}
          </p>
          {!hasTryouts && email ? (
            <>
              <a
                href={`mailto:${email}`}
                className="mt-8 inline-block bg-[#FF1616] px-7 py-4 font-display text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000]"
              >
                Register Your Interest
              </a>
              <p className="mt-4 max-w-2xl font-body text-xs text-white/50">
                Interest is registered directly with the club by email. Once a
                tryout window is announced, registration details will be
                published here.
              </p>
            </>
          ) : null}
        </div>
      </section>

      {!hasTryouts ? (
        <section className="mx-auto max-w-7xl px-6 pb-20 pt-10 lg:px-10 lg:pb-28 lg:pt-14">
          <div className="grid gap-px overflow-hidden bg-[#1E3653]/15 md:inline-grid md:grid-cols-3">
            {emptyStateDetails.map((detail) => (
              <div key={detail.label} className="bg-[#F9FAFD] p-6 sm:p-8 md:min-w-52">
                <p className="font-display text-xs font-bold uppercase text-[#FF1616]">
                  {detail.label}
                </p>
                <p className="mt-3 font-display text-xl font-black uppercase not-italic leading-[1.1] text-[#1E3653]/40 sm:text-2xl">
                  {detail.value}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-10 max-w-2xl font-body text-sm leading-7 text-[#1E3653]/60">
            Have questions before details are announced?{" "}
            <a
              href="/contact"
              className="font-bold text-[#1E3653] underline hover:text-[#FF1616]"
            >
              Contact {clubName}
            </a>
            .
          </p>
        </section>
      ) : (
        <section className="px-6 py-16 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-7xl space-y-8">
            {tryouts.map((tryout) => (
              <article
                key={tryout.id}
                className="overflow-hidden border border-[#1E3653]/15 bg-[#F9FAFD]"
              >
                <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                  {tryout.heroMediaUrl ? (
                    <div className="relative min-h-64 bg-[#1E3653] lg:min-h-full">
                      <ResilientImage
                        src={tryout.heroMediaUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 1023px) 100vw, 45vw"
                      />
                    </div>
                  ) : null}
                  <div className="p-7 sm:p-10">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-[#FF1616]">
                        {tryout.eyebrow || "Club evaluation"}
                      </p>
                      <span className="bg-[#1E3653] px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.14em] text-white">
                        {tryout.status}
                      </span>
                    </div>
                    <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3.1rem)] font-black uppercase italic leading-[.95] text-[#1E3653]">
                      {tryout.headline || "Tryout opportunity"}
                    </h2>
                    {tryout.intro ? (
                      <p className="mt-5 font-body leading-7 text-[#51667E]">
                        {tryout.intro}
                      </p>
                    ) : null}
                    <dl className="mt-8 grid gap-px overflow-hidden bg-[#1E3653]/15 sm:grid-cols-3">
                      {[
                        ["Date", eventDate(tryout.eventDate)],
                        ["Location", tryout.location || "TBA"],
                        ["Cost", tryout.costText || "TBA"],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-[#F9FAFD] p-5">
                          <dt className="font-display text-xs font-bold uppercase text-[#FF1616]">
                            {label}
                          </dt>
                          <dd className="mt-2 font-display font-bold uppercase text-[#1E3653]">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {tryout.eligibilityCopy ? (
                      <p className="mt-7 font-body text-sm leading-6 text-[#51667E]">
                        <strong className="text-[#1E3653]">Eligibility:</strong>{" "}
                        {tryout.eligibilityCopy}
                      </p>
                    ) : null}
                    {tryout.status === "closed" && tryout.closedMessage ? (
                      <p className="mt-7 border border-[#1E3653]/15 bg-[#EDF2F7] p-5 font-body font-semibold text-[#1E3653]">
                        {tryout.closedMessage}
                      </p>
                    ) : null}
                    {tryout.action ? (
                      <div className="mt-8">
                        <a
                          href={tryout.action.href}
                          {...(tryout.action.kind === "registration"
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                          className="inline-block bg-[#FF1616] px-7 py-4 font-display text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000]"
                        >
                          {tryout.action.label}
                        </a>
                        {tryout.action.kind === "registration" ? (
                          <p className="mt-3 font-body text-xs text-[#51667E]">
                            Third-party registration opens in a new tab. Onzio
                            does not collect registration data.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-8 font-body font-semibold text-[#1E3653]/55">
                        Registration is currently unavailable.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
