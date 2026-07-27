"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { DBLeagueStandingRow, DBLeagueStandingsSettings } from "@/lib/db-types";
import {
  sortStandingsRows,
  teamAbbreviation,
} from "@/lib/standings-content";
import { useClubBranding } from "@/components/ClubBrandingProvider";

type SortKey = "played" | "wins" | "draws" | "losses" | "goal_difference" | "points";

const COLUMNS: Array<{ key: SortKey; label: string; mobile?: boolean }> = [
  { key: "played", label: "GP" },
  { key: "wins", label: "W" },
  { key: "draws", label: "D" },
  { key: "losses", label: "L" },
  { key: "goal_difference", label: "GD", mobile: true },
  { key: "points", label: "Pts", mobile: true },
];

export default function LeagueStandingsTable({
  settings,
  rows,
}: {
  settings: DBLeagueStandingsSettings;
  rows: DBLeagueStandingRow[];
}) {
  const { clubLogoUrl } = useClubBranding();
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const rankedRows = useMemo(() => {
    const ordered = sortStandingsRows(rows);
    const rankById = new Map(ordered.map((row, index) => [row.id, index + 1]));
    const direction = sortDirection === "desc" ? -1 : 1;
    return [...ordered]
      .sort(
        (a, b) =>
          (a[sortKey] - b[sortKey]) * direction ||
          b.points - a.points ||
          b.goal_difference - a.goal_difference ||
          a.sort_order - b.sort_order,
      )
      .map((row) => ({ ...row, rank: rankById.get(row.id) ?? 0 }));
  }, [rows, sortDirection, sortKey]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  }

  if (rankedRows.length === 0) return null;

  return (
    <section
      id="standings"
      className="w-full px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span
              className="font-display text-xs font-black uppercase tracking-widest"
              style={{ color: "#E7001B" }}
            >
              {settings.eyebrow}
            </span>
            <h2
              className="font-display mt-2 font-black uppercase leading-none"
              style={{
                color: "#141414",
                fontSize: "clamp(2rem, 6vw, 4.25rem)",
              }}
            >
              {settings.title}
            </h2>
          </div>
          {settings.intro && (
            <p
              className="font-body max-w-xl text-sm leading-relaxed sm:text-base"
              style={{ color: "rgba(20,20,20,0.62)" }}
            >
              {settings.intro}
            </p>
          )}
        </header>

        <div
          className="overflow-hidden rounded-lg"
          style={{
            border: "1px solid rgba(20,20,20,0.1)",
            boxShadow: "0 18px 50px rgba(20,20,20,0.08)",
          }}
        >
          <div
            className="grid min-h-10 grid-cols-[minmax(0,1fr)_46px_54px] items-center gap-0 px-3 text-[0.62rem] font-black uppercase tracking-widest md:grid-cols-[minmax(240px,1fr)_repeat(6,64px)] md:px-5"
            style={{ backgroundColor: "#141414", color: "rgba(255,255,255,0.68)" }}
          >
            <span className="font-display flex items-center gap-3">
              <span className="w-6 text-center">#</span>
              Team
            </span>
            {COLUMNS.map((column) => (
              <button
                key={column.key}
                type="button"
                onClick={() => handleSort(column.key)}
                className={`font-display h-10 text-center uppercase tracking-widest transition-colors ${
                  column.mobile ? "" : "hidden md:block"
                }`}
                style={{
                  color: sortKey === column.key ? "#FFFFFF" : "rgba(255,255,255,0.62)",
                }}
                aria-label={`Sort standings by ${column.label}`}
              >
                {column.label}
              </button>
            ))}
          </div>

          {rankedRows.map((row) => {
            const logoSrc = row.is_club ? clubLogoUrl : row.logo_url;
            const abbreviation =
              row.team_abbreviation || teamAbbreviation(row.team_name);
            const isHovered = hoveredRowId === row.id;
            return (
              <div
                key={row.id}
                onMouseEnter={() => setHoveredRowId(row.id)}
                onMouseLeave={() => setHoveredRowId(null)}
                className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_46px_54px] items-center gap-0 border-t px-3 transition-colors duration-200 md:grid-cols-[minmax(240px,1fr)_repeat(6,64px)] md:px-5"
                style={{
                  backgroundColor: isHovered
                    ? row.is_club
                      ? "rgba(231,0,27,0.14)"
                      : "rgba(231,0,27,0.06)"
                    : row.is_club
                      ? "rgba(231,0,27,0.08)"
                      : "#FFFFFF",
                  borderColor: "rgba(20,20,20,0.08)",
                }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="font-display w-6 flex-none text-center text-xs font-black uppercase"
                    style={{ color: row.is_club ? "#E7001B" : "rgba(20,20,20,0.35)" }}
                  >
                    {row.rank}
                  </span>
                  {logoSrc ? (
                    <span className="relative h-8 w-8 flex-none overflow-hidden rounded-full bg-white">
                      <Image
                        src={logoSrc}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-contain"
                      />
                    </span>
                  ) : (
                    <span
                      className="font-display grid h-8 w-8 flex-none place-items-center rounded-full text-[0.62rem] font-black uppercase"
                      style={{
                        backgroundColor: "rgba(20,20,20,0.06)",
                        border: "1px solid rgba(20,20,20,0.1)",
                        color: "#E7001B",
                      }}
                    >
                      {abbreviation}
                    </span>
                  )}
                  <strong
                    className="truncate font-body text-sm font-bold sm:text-base"
                    style={{ color: row.is_club ? "#E7001B" : "#141414" }}
                  >
                    {row.team_name}
                  </strong>
                </span>
                {COLUMNS.map((column) => (
                  <span
                    key={column.key}
                    className={`font-display text-center text-xs font-black tabular-nums sm:text-sm ${
                      column.mobile ? "" : "hidden md:block"
                    }`}
                    style={{ color: "#141414" }}
                  >
                    {column.key === "goal_difference" && row[column.key] > 0
                      ? `+${row[column.key]}`
                      : row[column.key]}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
