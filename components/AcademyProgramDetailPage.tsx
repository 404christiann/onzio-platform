import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import type { ProgramContent } from "@/lib/queries";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

// Mockup-parity program detail template (DCFC-D132 pass), rebuilt from the
// sales mockup's app/(public)/programs/[programId]/page.tsx and driven
// entirely by admin-editable program data instead of per-slug branches:
//
// - every program opens on the mockup's full-viewport cinematic photo hero
//   (kicker = program name, heading = display title, body copy), with
//   clamp()-based responsive heading sizes so mobile wraps instead of
//   clipping;
// - `statement_band` programs get the navy multi-column focus band built
//   from their highlights;
// - `detail_focus` programs get the detail-image + "Grow through the game."
//   section and the sky "Program Focus" numbered highlight list;
// - a program with an external CTA gets the mockup's registration band with
//   the red CTA (the mockup's Special Olympics registration section; its
//   placeholder google.com URL never shipped per DCFC-D102, so this renders
//   only once the club supplies a real registration link through admin);
// - every program closes with the "Explore other programs." navy button row.
export default function AcademyProgramDetailPage({
  program,
  otherPrograms = [],
}: {
  program: ProgramContent;
  otherPrograms?: ProgramContent[];
}) {
  const usesStatementBand = program.layoutVariant === "statement_band";
  const programName = program.navLabel || program.displayTitle;

  return (
    <div className="bg-[#F9FAFD]">
      <section className="relative min-h-[100svh] overflow-hidden bg-[#1E3653]">
        {program.heroMediaUrl ? (
          <ResilientImage
            src={program.heroMediaUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : null}
        <div
          className={`absolute inset-0 ${
            usesStatementBand
              ? "bg-gradient-to-t from-[#14283F]/90 via-[#14283F]/50 to-[#14283F]/35"
              : "bg-[#14283F]/65"
          }`}
        />
        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl items-end px-6 py-16 lg:px-10 lg:py-20">
          <div className="w-full min-w-0 max-w-5xl">
            <p className="font-display text-sm font-bold uppercase text-[#B9E3F6]">
              {programName}
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.05rem,8vw,6.5rem)] font-black uppercase italic leading-[.9] text-white">
              {program.displayTitle}
            </h1>
            {program.body ? (
              <p className="mt-6 max-w-2xl font-body text-base leading-7 text-white/80 md:text-lg">
                {program.body}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {program.externalCta ? (
        <section
          id="register"
          className="scroll-mt-24 bg-[#F9FAFD] px-6 py-12 sm:py-14 lg:scroll-mt-28 lg:px-10"
        >
          <div className="mx-auto grid max-w-7xl gap-9 border-t border-[#1E3653]/15 pt-5 lg:grid-cols-[0.68fr_1.32fr] lg:items-center lg:gap-16">
            <div className="min-w-0 lg:pr-2">
              <p className="font-nav text-xs font-bold uppercase tracking-[0.16em] text-[#FF1616]">
                Program Registration
              </p>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(2.8rem,4.8vw,5.1rem)] font-black uppercase italic leading-[0.84] text-[#1E3653]">
                Ready to take the field?
              </h2>
              <div className="mt-7 h-px w-16 bg-[#B9E3F6]" />
              <p className="mt-6 max-w-md font-body text-base leading-8 text-[#1E3653]/70 md:text-lg">
                Registration is completed through our external registration
                partner. Continue there to get started.
              </p>
              <a
                href={program.externalCta.href}
                {...(isExternal(program.externalCta.href)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="mt-7 inline-flex min-h-12 items-center justify-center bg-[#FF1616] px-6 text-center font-display text-xs font-bold uppercase text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-[#D70000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E3653]"
              >
                {program.externalCta.label}
              </a>
            </div>
            {(program.detailMediaUrl || program.heroMediaUrl) ? (
              <div className="relative aspect-[16/10] overflow-hidden bg-[#1E3653] lg:aspect-auto lg:h-[clamp(24rem,60svh,34rem)]">
                <ResilientImage
                  src={program.detailMediaUrl || program.heroMediaUrl}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 100vw, 1280px"
                  className="object-cover"
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {usesStatementBand && program.highlights.length > 0 ? (
        <section className="bg-[#1E3653] px-6 pb-20 pt-24 lg:px-10 lg:pb-24 lg:pt-28">
          <ul className="mx-auto grid max-w-7xl divide-y divide-white/20 lg:grid-cols-[1fr_1.15fr_1fr] lg:items-center lg:divide-x lg:divide-y-0">
            {program.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-center py-10 first:pt-0 last:pb-0 lg:min-h-40 lg:px-8 lg:py-0 lg:first:pl-0 lg:last:pr-0"
              >
                <span className="max-w-none font-display text-[clamp(1.4rem,2vw,2.1rem)] font-black uppercase italic leading-[1.02] text-white">
                  {highlight}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!usesStatementBand ? (
        <>
          <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:px-10 lg:py-24">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#1E3653]">
              {(program.detailMediaUrl || program.heroMediaUrl) ? (
                <ResilientImage
                  src={program.detailMediaUrl || program.heroMediaUrl}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 100vw, 58vw"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase text-[#FF1616]">
                The Program
              </p>
              <h2 className="mt-4 font-display text-[clamp(2.4rem,5vw,4.8rem)] font-black uppercase italic leading-[.92] text-[#1E3653]">
                Grow through the game.
              </h2>
              <p className="mt-7 font-body text-base leading-8 text-[#51667E] md:text-lg">
                {program.body || program.summary}
              </p>
              <Link
                href="/contact"
                className="mt-8 inline-block bg-[#FF1616] px-7 py-4 font-display text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000]"
              >
                Ask About This Program
              </Link>
            </div>
          </section>

          {program.highlights.length > 0 ? (
            <section className="bg-[#B9E3F6] px-6 py-16 lg:px-10 lg:py-20">
              <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.8fr_1.2fr]">
                <div>
                  <p className="font-display text-sm font-bold uppercase text-[#FF1616]">
                    Program Focus
                  </p>
                  <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,5rem)] font-black uppercase italic leading-[.9] text-[#1E3653]">
                    Development with purpose.
                  </h2>
                </div>
                <ol className="border-t border-[#1E3653]/20">
                  {program.highlights.map((highlight, index) => (
                    <li
                      key={highlight}
                      className="grid grid-cols-[3rem_1fr] gap-4 border-b border-[#1E3653]/20 py-5"
                    >
                      <span className="font-body text-sm font-bold text-[#FF1616]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-lg font-bold uppercase text-[#1E3653] sm:text-xl">
                        {highlight}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="px-6 py-16 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <h2 className="font-display text-[clamp(2.5rem,5vw,5rem)] font-black uppercase italic leading-[.9] text-[#1E3653]">
              Explore other programs.
            </h2>
            <p className="max-w-xl font-body text-base leading-8 text-[#51667E] lg:justify-self-end">
              Every program is part of a connected pathway built around
              development, inclusion, and opportunity.
            </p>
          </div>
          {otherPrograms.length > 0 ? (
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {otherPrograms.map((otherProgram) => (
                <Link
                  key={otherProgram.id}
                  href={`/programs/${otherProgram.slug}`}
                  className="group flex w-fit items-center justify-start gap-3 justify-self-start bg-[#1E3653] px-5 py-3 outline-none transition-colors hover:bg-[#FF1616] focus-visible:bg-[#FF1616] focus-visible:ring-2 focus-visible:ring-[#1E3653] focus-visible:ring-offset-2"
                >
                  <span className="font-display text-lg font-black uppercase italic leading-tight text-white sm:text-xl">
                    {otherProgram.navLabel || otherProgram.displayTitle}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 text-xl text-white transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1"
                  >
                    &rarr;
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-12">
              <Link
                href="/programs"
                className="group flex w-fit items-center gap-3 bg-[#1E3653] px-5 py-3 transition-colors hover:bg-[#FF1616]"
              >
                <span className="font-display text-lg font-black uppercase italic leading-tight text-white sm:text-xl">
                  All Programs
                </span>
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 text-xl text-white transition-transform group-hover:translate-x-1"
                >
                  &rarr;
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
