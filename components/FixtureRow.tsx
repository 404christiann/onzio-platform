"use client";

import { Fixture } from "@/lib/data";
import OpponentCrest from "@/components/OpponentCrest";

interface Props {
  fixture: Fixture;
  isNext: boolean;
  isPast: boolean;
  index: number;
}

/** Formats "2026-05-08" → "May 8, 2026" and "19:00" → "7:00 PM" */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr.toUpperCase() === "TBD") return "TBD";
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

export default function FixtureRow({ fixture, isNext, isPast, index }: Props) {
  const mapUrl = fixture.address
    ? `https://maps.google.com/?q=${encodeURIComponent(fixture.address)}`
    : null;
  const result = getResult(fixture);

  return (
    <div
      className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 px-6 py-5 md:px-8 md:py-6 transition-colors duration-200 group"
      style={{
        backgroundColor: isNext ? "var(--color-green)" : "transparent",
        borderBottom: "1px solid",
        borderColor: isNext ? "transparent" : "rgba(0,0,0,0.07)",
        opacity: isPast ? (result ? 0.78 : 0.38) : 1,
      }}
    >
      {/* Match number */}
      <span
        className="hidden sm:block font-display font-black w-8 flex-shrink-0"
        style={{
          fontSize: "0.75rem",
          color: isNext ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.2)",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Date */}
      <div className="flex-shrink-0 sm:w-44">
        <p
          className="font-display font-black uppercase leading-none"
          style={{
            fontSize: "clamp(0.95rem, 1.8vw, 1.1rem)",
            color: isNext ? "rgba(255,255,255,0.9)" : "var(--color-black)",
            letterSpacing: "0.05em",
          }}
        >
          {formatDate(fixture.date)}
        </p>
        <p
          className="font-display font-bold mt-1"
          style={{
            fontSize: "clamp(0.85rem, 1.5vw, 1rem)",
            color: isNext ? "rgba(255,255,255,0.6)" : "var(--color-gray-mid)",
          }}
        >
          {formatTime(fixture.time)}
        </p>
      </div>

      {/* Opponent — main focus */}
      <div className="flex-1 sm:px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <OpponentCrest
            name={fixture.opponent}
            logoUrl={fixture.opponentLogoUrl}
            size={56}
            variant={isNext ? "dark" : "light"}
          />
          {isNext && (
            <span
              className="font-display font-bold text-xs tracking-widest uppercase px-2 py-0.5"
              style={{ backgroundColor: "var(--color-red)", color: "#fff", borderRadius: 2 }}
            >
              Next
            </span>
          )}
          <h3
            className="font-display font-black uppercase leading-none"
            style={{
              fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)",
              color: isNext ? "#fff" : "var(--color-black)",
            }}
          >
            {fixture.opponent}
          </h3>
          {/* Home / Away badge */}
          <span
            className="font-display font-bold text-xs tracking-widest uppercase px-2 py-0.5 flex-shrink-0"
            style={{
              border: `1px solid ${isNext ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.15)"}`,
              color: isNext ? "rgba(255,255,255,0.7)" : "var(--color-gray-mid)",
              borderRadius: 2,
            }}
          >
            {fixture.home ? "Home" : "Away"}
          </span>
        </div>

        {/* Venue */}
        <p
          className="font-body text-sm mt-1"
          style={{ color: isNext ? "rgba(255,255,255,0.55)" : "var(--color-gray-mid)" }}
        >
          {fixture.venue}
        </p>
      </div>

      {result && (
        <div className="flex flex-shrink-0 items-center gap-2 sm:mr-6">
          <span
            className="font-display font-black uppercase leading-none"
            style={{
              color: result.label === "W" ? "var(--color-red)" : isNext ? "#fff" : "var(--color-black)",
              fontSize: "clamp(1.5rem, 3vw, 2.15rem)",
            }}
          >
            {result.label}
          </span>
          <span
            className="font-display font-black uppercase leading-none"
            style={{
              color: isNext ? "rgba(255,255,255,0.85)" : "var(--color-black)",
              fontSize: "clamp(1.35rem, 2.5vw, 1.9rem)",
            }}
          >
            {result.score}
          </span>
        </div>
      )}

      {/* Directions CTA */}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center gap-2 font-display text-xs tracking-widest uppercase transition-opacity duration-200"
          style={{
            color: isNext ? "rgba(255,255,255,0.6)" : "var(--color-gray-mid)",
            opacity: 0.8,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.8")}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1C4.01 1 2 3.01 2 5.5c0 3.37 4.5 7.5 4.5 7.5S11 8.87 11 5.5C11 3.01 8.99 1 6.5 1zm0 6.25a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z" fill="currentColor"/>
          </svg>
          Directions
        </a>
      )}
    </div>
  );
}
