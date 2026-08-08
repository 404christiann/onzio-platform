"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import { fetchPrograms, type ProgramContent } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";

// Mockup-parity "A pathway for every player." homepage block for academy@1
// (DCFC-D132 pass), modeled on the sales mockup's ProgramsFeature: photo
// panel beside the red eyebrow, sky-scale italic heading, and the numbered
// 01-04 hairline program link list. Driven by the club's published
// programs; renders nothing until programs exist.
export default function AcademyProgramsPathway() {
  const club = useClubContext();
  const [programs, setPrograms] = useState<ProgramContent[]>([]);

  useEffect(() => {
    fetchPrograms(club.id)
      .then(setPrograms)
      .catch((error) => {
        console.error("AcademyProgramsPathway:", error);
        setPrograms([]);
      });
  }, [club.id]);

  if (programs.length === 0) return null;

  const featureImage =
    programs.find((program) => program.heroMediaUrl)?.heroMediaUrl ?? "";

  return (
    <section className="grid min-h-[680px] bg-[#F9FAFD] lg:grid-cols-2">
      <div className="relative min-h-[420px] bg-[#1E3653] lg:min-h-full">
        {featureImage ? (
          <ResilientImage
            src={featureImage}
            alt={`${club.name} player competing during a match`}
            fill
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-col justify-center px-6 py-16 md:px-12 lg:px-16">
        <p className="font-display text-sm font-bold uppercase text-[#FF1616]">
          Our Programs
        </p>
        <h2 className="mt-4 max-w-xl font-display text-[clamp(2.8rem,5vw,5.2rem)] font-black uppercase italic leading-[.92] text-[#1E3653]">
          A pathway for every player.
        </h2>
        <p className="mt-6 max-w-xl font-body text-base leading-7 text-[#51667E]">
          From first competitive steps to high-level amateur soccer,{" "}
          {club.name} offers programs designed around development, inclusion,
          and opportunity.
        </p>
        <ol className="mt-9 grid gap-4 sm:grid-cols-2">
          {programs.map((program, index) => (
            <li key={program.id} className="border-t border-[#1E3653]/15">
              <Link
                href={`/programs/${program.slug}`}
                className="group block min-h-24 py-4"
              >
                <span className="font-body text-xs font-bold text-[#FF1616]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 flex items-end justify-between gap-4">
                  <span className="font-display text-sm font-bold uppercase text-[#1E3653] transition-colors group-hover:text-[#FF1616]">
                    {program.navLabel || program.displayTitle}
                  </span>
                  <span
                    aria-hidden="true"
                    className="font-body text-lg text-[#1E3653] transition-transform group-hover:translate-x-1"
                  >
                    &rarr;
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
