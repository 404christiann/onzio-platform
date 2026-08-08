import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import {
  resolveProgramsPageContent,
  type ProgramsPageContent,
} from "@/lib/programs-page-content";
import type { ProgramContent } from "@/lib/queries";

// Mockup-parity programs index (DCFC-D132 pass): navy hero band with the
// sky second headline line, flat hairline card grid with numbered image
// overlays and the program *name* (navLabel) as the card title, and the
// sky-blue closing band — all structure/classes from the sales mockup's
// app/(public)/programs/page.tsx.
//
// The hero and closing bands' copy is admin content
// (onzio.programs_page_content, edited at /admin/programs); `content` is
// optional so the template still renders its approved defaults if a caller has
// not loaded a row. Structural labels ("Explore Program", the empty state) stay
// template chrome per DCFC-D007.
export default function AcademyProgramsPage({
  programs,
  clubName = "the club",
  content,
}: {
  programs: ProgramContent[];
  clubName?: string;
  content?: ProgramsPageContent;
}) {
  const copy = content ?? resolveProgramsPageContent(null, clubName);

  return (
    <div className="bg-[#F9FAFD]">
      <section className="bg-[#1E3653] px-6 pb-20 pt-40 text-white lg:px-10 lg:pb-28">
        <div className="mx-auto max-w-7xl">
          {copy.heroEyebrow ? (
            <p className="font-display text-sm font-bold uppercase text-[#B9E3F6]">
              {copy.heroEyebrow}
            </p>
          ) : null}
          <h1 className="mt-5 max-w-5xl font-display text-[clamp(3.4rem,8vw,7.4rem)] font-black uppercase italic leading-[.88]">
            {copy.heroHeadlineLineOne}
            {copy.heroHeadlineLineTwo ? (
              <>
                <br />
                <span className="text-[#B9E3F6]">
                  {copy.heroHeadlineLineTwo}
                </span>
              </>
            ) : null}
          </h1>
          <p className="mt-8 max-w-3xl font-body text-base leading-8 text-white/75 md:text-lg">
            {copy.heroIntro}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        {programs.length === 0 ? (
          <div className="bg-[#EDF2F7] p-8 sm:p-12">
            <h2 className="font-display text-3xl font-black uppercase italic text-[#1E3653]">
              Programs coming soon
            </h2>
            <p className="mt-3 max-w-xl font-body text-[#51667E]">
              The club has not published any programs yet. Contact the club
              for current opportunities.
            </p>
          </div>
        ) : (
          <div className="grid gap-px overflow-hidden bg-[#1E3653]/15 md:grid-cols-2">
            {programs.map((program, index) => (
              <Link
                key={program.id}
                href={`/programs/${program.slug}`}
                className="group bg-[#F9FAFD]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-[#1E3653]">
                  {program.heroMediaUrl ? (
                    <ResilientImage
                      src={program.heroMediaUrl}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#14283F]/55 via-transparent to-transparent" />
                  <span className="absolute bottom-5 left-5 font-display text-4xl font-black italic text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex min-h-56 flex-col justify-between p-6 sm:p-8">
                  <div>
                    {program.kicker ? (
                      <p className="font-display text-xs font-bold uppercase text-[#FF1616]">
                        {program.kicker}
                      </p>
                    ) : null}
                    <h2 className="mt-3 max-w-lg font-display text-[clamp(1.9rem,3vw,3.1rem)] font-black uppercase italic leading-[.95] text-[#1E3653] transition-colors group-hover:text-[#FF1616]">
                      {program.navLabel || program.displayTitle}
                    </h2>
                  </div>
                  <span className="mt-8 flex items-center justify-between border-t border-[#1E3653]/15 pt-5 font-nav text-xs font-bold uppercase text-[#1E3653]">
                    Explore Program
                    <span
                      aria-hidden="true"
                      className="text-xl transition-transform group-hover:translate-x-1"
                    >
                      &rarr;
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {programs.length > 0 && (
        <section className="bg-[#B9E3F6] px-6 py-20 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-end">
            <h2 className="font-display text-[2.35rem] font-black uppercase italic leading-[.9] text-[#1E3653] sm:text-[3rem] lg:text-[5rem]">
              {copy.closingHeadingLineOne}
              {copy.closingHeadingLineTwo ? (
                <>
                  <br />
                  {copy.closingHeadingLineTwo}
                </>
              ) : null}
            </h2>
            <div>
              <p className="font-body text-base leading-8 text-[#51667E]">
                {copy.closingBody}
              </p>
              {copy.closingCtaLabel ? (
                <Link
                  href="/contact"
                  className="mt-7 inline-block bg-[#FF1616] px-7 py-4 font-display text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000]"
                >
                  {copy.closingCtaLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
