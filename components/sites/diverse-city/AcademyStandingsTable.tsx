"use client";

import Image from "@/components/ResilientImage";
import { useMemo } from "react";
import type { DBLeagueStandingRow, DBLeagueStandingsSettings } from "@/lib/db-types";
import { sortStandingsRows, teamAbbreviation } from "@/lib/standings-content";
import { useClubBranding } from "@/components/ClubBrandingProvider";

const COLUMNS: Array<{ key: "played" | "wins" | "draws" | "losses" | "goal_difference" | "points"; label: string }> = [
  { key: "played", label: "GP" },
  { key: "wins", label: "W" },
  { key: "draws", label: "D" },
  { key: "losses", label: "L" },
  { key: "goal_difference", label: "GD" },
  { key: "points", label: "PTS" },
];

function formatDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function AcademyLeagueStandingsTable({
  settings,
  rows,
}: {
  settings: DBLeagueStandingsSettings;
  rows: DBLeagueStandingRow[];
}) {
  const { clubLogoUrl } = useClubBranding();

  const rankedRows = useMemo(() => {
    const ordered = sortStandingsRows(rows);
    return ordered.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [rows]);

  if (rankedRows.length === 0) return null;

  return (
    <section
      aria-label={settings.title}
      className="bg-[#F9FAFD] px-4 py-20 text-[#141414] sm:px-6 lg:px-10 lg:py-10"
    >
      <div className="mx-auto max-w-7xl">
        <p className="font-nav text-sm font-bold uppercase text-[#FF1616] sm:text-base">
          {settings.eyebrow}
        </p>
        <h2 className="mt-5 font-display text-[2.8rem] font-black uppercase italic leading-none text-[#141414] sm:text-[4rem] xl:whitespace-nowrap">
          {settings.title}
        </h2>
        {settings.intro && (
          <p className="font-body mt-3 max-w-xl text-sm leading-relaxed text-[rgba(20,20,20,0.62)] sm:text-base">
            {settings.intro}
          </p>
        )}

        <div className="mt-9 overflow-hidden rounded-lg border border-[#141414]/10 bg-white shadow-[0_18px_50px_rgba(20,20,20,.08)] lg:mt-6">
          <div>
            <div className="grid h-12 grid-cols-[minmax(0,1fr)_repeat(6,32px)] items-center bg-[#141414] px-2 text-white/65 sm:h-14 sm:grid-cols-[minmax(280px,1fr)_repeat(6,58px)] sm:px-4 lg:h-11 lg:grid-cols-[minmax(360px,1fr)_repeat(6,78px)] lg:px-5">
              <div className="font-nav flex min-w-0 items-center gap-2 text-[0.55rem] font-bold uppercase sm:gap-4 sm:text-xs lg:gap-5">
                <span className="w-4 text-center sm:w-6">#</span>
                <span>Team</span>
              </div>
              {COLUMNS.map((column) => (
                <span
                  key={column.key}
                  className="font-nav text-center text-[0.52rem] font-bold uppercase sm:text-[0.65rem] lg:text-xs"
                >
                  {column.label}
                </span>
              ))}
            </div>

            {rankedRows.map((row) => {
              const logoSrc = row.is_club ? clubLogoUrl : row.logo_url;
              const abbreviation = row.team_abbreviation || teamAbbreviation(row.team_name);
              return (
                <div
                  key={row.id}
                  className={`grid h-16 grid-cols-[minmax(0,1fr)_repeat(6,32px)] items-center border-t border-[#141414]/[.07] px-2 transition-colors duration-200 sm:h-[72px] sm:grid-cols-[minmax(280px,1fr)_repeat(6,58px)] sm:px-4 lg:h-[52px] lg:grid-cols-[minmax(360px,1fr)_repeat(6,78px)] lg:px-5 ${
                    row.is_club ? "bg-[#FF1616]/[.08] hover:bg-[#FF1616]/[.14]" : "bg-white hover:bg-[#FF1616]/[.06]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2 sm:gap-4 lg:gap-5">
                    <span
                      className={`font-nav w-4 flex-none text-center text-[0.65rem] font-bold tabular-nums sm:w-6 sm:text-sm ${
                        row.is_club ? "text-[#FF1616]" : "text-[#141414]/35"
                      }`}
                    >
                      {row.rank}
                    </span>
                    {logoSrc ? (
                      <span className="relative h-8 w-8 flex-none sm:h-10 sm:w-10 lg:h-9 lg:w-9">
                        <Image src={logoSrc} alt="" fill sizes="(max-width: 639px) 32px, (max-width: 1023px) 40px, 36px" className="object-contain" />
                      </span>
                    ) : (
                      <span
                        aria-label={`${row.team_name} logo placeholder`}
                        className="font-nav grid h-8 w-8 flex-none place-items-center rounded-full border border-[#141414]/10 bg-[#F3F4F6] text-[0.48rem] font-bold text-[#141414]/35 sm:h-10 sm:w-10 sm:text-[0.56rem] lg:h-9 lg:w-9 lg:text-[0.58rem]"
                      >
                        {abbreviation}
                      </span>
                    )}
                    <strong
                      className={`font-nav min-w-0 truncate text-xs font-semibold sm:text-base lg:text-lg ${
                        row.is_club ? "text-[#FF1616]" : "text-[#141414]"
                      }`}
                    >
                      {row.team_name}
                    </strong>
                  </div>
                  {COLUMNS.map((column) => (
                    <span
                      key={column.key}
                      className="font-display text-center text-[0.65rem] font-black not-italic tabular-nums text-[#141414] sm:text-sm lg:text-base"
                    >
                      {column.key === "goal_difference" ? formatDifference(row[column.key]) : row[column.key]}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
