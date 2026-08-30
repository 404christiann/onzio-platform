"use client";

import { Fixture } from "@/lib/data";
import OpponentCrest from "@/components/OpponentCrest";

interface Props {
  fixture: Fixture;
  isNext: boolean;
  isPast: boolean;
  index: number;
}

/** Formats "2026-09-05" → "September 5, 2026" */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr.toUpperCase() === "TBD") return "";
  const [hourStr, minStr] = timeStr.split(":");
  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function getResult(fixture: Fixture): { label: "W" | "D" | "L"; score: string } | null {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  const label =
    fixture.roseCityScore > fixture.opponentScore
      ? "W"
      : fixture.roseCityScore < fixture.opponentScore
        ? "L"
        : "D";
  return { label, score: `${fixture.roseCityScore}-${fixture.opponentScore}` };
}

export default function AcademyFixtureRow({ fixture, isNext, isPast, index }: Props) {
  const result = getResult(fixture);
  const mapUrl = fixture.address
    ? `https://maps.google.com/?q=${encodeURIComponent(fixture.address)}`
    : null;
  const formattedTime = formatTime(fixture.time);

  return (
    <article
      className={`grid gap-6 border-b border-[#1E3653]/10 px-5 py-8 md:min-h-[150px] md:grid-cols-[44px_240px_minmax(0,1fr)_160px] md:items-center md:gap-0 ${
        isNext ? "bg-[#FF1616]/[.035]" : ""
      }`}
      style={{ opacity: isPast ? (result ? 0.78 : 0.55) : 1 }}
    >
      <span className="font-display text-xs font-bold tabular-nums text-[#1E3653]/25">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div>
        <p className="font-display text-xl font-black uppercase not-italic leading-none text-[#1E3653]/80">
          {formatDate(fixture.date)}
        </p>
        <p className="mt-2 font-display text-lg font-bold uppercase not-italic leading-none text-[#1E3653]/40">
          {formattedTime || "Time TBA"}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-5">
          <OpponentCrest
            name={fixture.opponent}
            logoUrl={fixture.opponentLogoUrl}
            size={56}
            className="[--opponent-crest-size:56px]"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-display text-[1.45rem] font-black uppercase italic leading-none text-[#1E3653]/80 sm:text-[2.4rem]">
                {fixture.opponent}
              </h2>
              {isNext && (
                <span className="border border-[#1E3653]/10 px-2 py-1 font-nav text-[0.62rem] font-bold uppercase text-[#1E3653]/40">
                  Next
                </span>
              )}
            </div>
            <p className="mt-2 font-body text-sm text-[#1E3653]/45">
              {fixture.venue?.trim() || "Venue TBA"}
            </p>
          </div>
        </div>
      </div>

      <div className="md:text-right">
        {result ? (
          <>
            <p
              className="font-display text-2xl font-black uppercase not-italic"
              style={{ color: result.label === "W" ? "#FF1616" : "#1E3653" }}
            >
              {result.label} {result.score}
            </p>
            <p className="mt-1 font-nav text-xs font-bold uppercase text-[#1E3653]/30">
              Final
            </p>
          </>
        ) : mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-display text-xs font-bold uppercase tracking-widest text-[#1E3653]/40 transition-colors hover:text-[#FF1616]"
            onClick={(e) => e.stopPropagation()}
          >
            Match details
          </a>
        ) : (
          <p className="font-nav text-xs font-bold uppercase text-[#1E3653]/30">
            {fixture.home ? "Home" : "Away"}
          </p>
        )}
      </div>
    </article>
  );
}
