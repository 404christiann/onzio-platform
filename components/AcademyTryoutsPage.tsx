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

export default function AcademyTryoutsPage({
  tryouts,
}: {
  tryouts: TryoutContent[];
}) {
  const hero = tryouts.find((item) => item.heroMediaUrl)?.heroMediaUrl ?? "";
  return (
    <div className="min-h-screen bg-white pt-24 text-[#141414] sm:pt-28">
      <section className="relative isolate overflow-hidden bg-[#141414] px-6 py-20 text-white sm:py-28 lg:px-10">
        {hero ? (
          <>
            <ResilientImage src={hero} alt="" fill priority className="-z-20 object-cover" sizes="100vw" />
            <div className="absolute inset-0 -z-10 bg-black/70" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-red)]">Tryouts</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black sm:text-7xl">Find your next opportunity.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
            Review current club evaluations. Registration, waivers, and participant information stay with the club&apos;s external provider.
          </p>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-8">
          {tryouts.length === 0 ? (
            <div className="rounded-2xl bg-[#f5f5f5] p-8 sm:p-12">
              <h2 className="text-3xl font-black">No tryouts published</h2>
              <p className="mt-3 text-black/60">Check back for future opportunities or contact the club.</p>
            </div>
          ) : tryouts.map((tryout) => (
            <article key={tryout.id} className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                {tryout.heroMediaUrl ? (
                  <div className="relative min-h-64 bg-[#ececec] lg:min-h-full">
                    <ResilientImage src={tryout.heroMediaUrl} alt="" fill className="object-cover" sizes="(max-width: 1023px) 100vw, 45vw" />
                  </div>
                ) : null}
                <div className="p-7 sm:p-10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">{tryout.eyebrow || "Club evaluation"}</p>
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">{tryout.status}</span>
                  </div>
                  <h2 className="mt-4 text-3xl font-black sm:text-5xl">{tryout.headline || "Tryout opportunity"}</h2>
                  {tryout.intro ? <p className="mt-5 leading-7 text-black/60">{tryout.intro}</p> : null}
                  <dl className="mt-8 grid gap-4 sm:grid-cols-3">
                    {[
                      ["Date", eventDate(tryout.eventDate)],
                      ["Location", tryout.location || "TBA"],
                      ["Cost", tryout.costText || "TBA"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-[#f5f5f5] p-5">
                        <dt className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">{label}</dt>
                        <dd className="mt-2 font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {tryout.eligibilityCopy ? <p className="mt-7 text-sm leading-6 text-black/65"><strong className="text-black">Eligibility:</strong> {tryout.eligibilityCopy}</p> : null}
                  {tryout.status === "closed" && tryout.closedMessage ? <p className="mt-7 rounded-xl border border-black/10 bg-[#f5f5f5] p-5 font-semibold">{tryout.closedMessage}</p> : null}
                  {tryout.action ? (
                    <div className="mt-8">
                      <a
                        href={tryout.action.href}
                        {...(tryout.action.kind === "registration" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex rounded-full bg-[var(--color-red)] px-7 py-3 font-display text-sm font-black uppercase tracking-[0.14em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        {tryout.action.label}
                      </a>
                      {tryout.action.kind === "registration" ? <p className="mt-3 text-xs text-black/50">Third-party registration opens in a new tab. Onzio does not collect registration data.</p> : null}
                    </div>
                  ) : (
                    <p className="mt-8 font-semibold text-black/55">Registration is currently unavailable.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
