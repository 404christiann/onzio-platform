import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import type { ProgramContent } from "@/lib/queries";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export default function AcademyProgramDetailPage({
  program,
}: {
  program: ProgramContent;
}) {
  return (
    <div className="min-h-screen bg-white pt-24 text-[#141414] sm:pt-28">
      <section className="relative isolate overflow-hidden bg-[#141414] px-6 py-20 text-white sm:py-28 lg:px-10">
        {program.heroMediaUrl ? (
          <>
            <ResilientImage
              src={program.heroMediaUrl}
              alt=""
              fill
              priority
              className="-z-20 object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 -z-10 bg-black/65" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl">
          {program.kicker ? (
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-red)]">
              {program.kicker}
            </p>
          ) : null}
          <h1 className="mt-5 max-w-4xl text-5xl font-black sm:text-7xl">
            {program.displayTitle}
          </h1>
          {program.summary ? (
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
              {program.summary}
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-black sm:text-5xl">Program details</h2>
            {program.body ? (
              <p className="mt-6 whitespace-pre-line text-lg leading-8 text-black/65">
                {program.body}
              </p>
            ) : (
              <p className="mt-6 text-black/60">
                More information will be published soon.
              </p>
            )}
            {program.externalCta ? (
              <a
                href={program.externalCta.href}
                {...(isExternal(program.externalCta.href)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="mt-8 inline-flex rounded-full bg-[var(--color-red)] px-7 py-3 font-display text-sm font-black uppercase tracking-[0.14em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {program.externalCta.label}
              </a>
            ) : null}
          </div>

          <div className="space-y-6">
            {program.detailMediaUrl ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ececec]">
                <ResilientImage
                  src={program.detailMediaUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 1023px) 100vw, 45vw"
                />
              </div>
            ) : null}
            {program.highlights.length > 0 ? (
              <div className="rounded-2xl bg-[#141414] p-7 text-white sm:p-9">
                <h2 className="text-2xl font-black">Program focus</h2>
                <ul className="mt-5 space-y-4">
                  {program.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-3 text-white/75">
                      <span className="text-[var(--color-red)]" aria-hidden="true">●</span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-t border-black/10 px-6 py-12 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/programs"
            className="font-display text-sm font-black uppercase tracking-[0.16em] text-[var(--color-red)]"
          >
            ← Explore other programs
          </Link>
        </div>
      </section>
    </div>
  );
}
