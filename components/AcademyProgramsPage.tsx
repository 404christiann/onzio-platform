import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import type { ProgramContent } from "@/lib/queries";

export default function AcademyProgramsPage({
  programs,
}: {
  programs: ProgramContent[];
}) {
  return (
    <div className="min-h-screen bg-white pt-24 text-[#141414] sm:pt-28">
      <section className="bg-[#141414] px-6 py-20 text-white sm:py-28 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-red)]">
            Our Programs
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black sm:text-7xl">
            One pathway. Every athlete belongs.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Explore the club&apos;s current programs and choose the pathway that
            fits your goals.
          </p>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-7xl">
          {programs.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-[#f5f5f5] p-8 sm:p-12">
              <h2 className="text-3xl font-black">Programs coming soon</h2>
              <p className="mt-3 max-w-xl text-black/60">
                The club has not published any programs yet. Contact the club
                for current opportunities.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {programs.map((program) => (
                <Link
                  key={program.id}
                  href={`/programs/${program.slug}`}
                  className="group overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {program.heroMediaUrl ? (
                    <div className="relative aspect-[16/9] overflow-hidden bg-[#ececec]">
                      <ResilientImage
                        src={program.heroMediaUrl}
                        alt=""
                        fill
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                        sizes="(max-width: 767px) 100vw, 50vw"
                      />
                    </div>
                  ) : null}
                  <div className="p-7 sm:p-9">
                    {program.kicker ? (
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">
                        {program.kicker}
                      </p>
                    ) : null}
                    <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                      {program.displayTitle}
                    </h2>
                    {program.summary ? (
                      <p className="mt-4 leading-7 text-black/60">
                        {program.summary}
                      </p>
                    ) : null}
                    <span className="mt-7 inline-flex font-display text-sm font-black uppercase tracking-[0.16em] text-[var(--color-red)]">
                      Explore program →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
