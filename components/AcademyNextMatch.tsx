"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { useEffect, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubTimeZone } from "@/components/ClubTimeZoneProvider";
import { clubKickoffInstant, clubToday } from "@/lib/club-time";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { nextMatchLabels } from "@/lib/next-match-labels";
import {
  fetchActiveSeason,
  fetchContactProfile,
  fetchSchedule,
} from "@/lib/queries";
import { AcademyMatchLoadingSkeleton } from "@/components/sites/diverse-city/LoadingSkeleton";
import { useBoundedAcademyLoading } from "@/lib/use-bounded-academy-loading";



/** "2026-09-05" → "September 5, 2026" */
function formatMatchDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "13:00" → "1:00 PM" */
function formatMatchTime(timeStr: string): string {
  if (!timeStr) return "";
  const [hourStr, minuteStr] = timeStr.split(":");
  const hour24 = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const ampm = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export default function AcademyNextMatch() {
  const club = useClubContext();
  const timeZone = useClubTimeZone();
  const { clubLogoUrl } = useClubBranding();
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const showLoading = useBoundedAcademyLoading(loading, club.id);
  // The fallback location is the service area the club edits at
  // /admin/contact. It is a club fact, not template chrome, so it does not
  // belong in component source (DCFC-D007). The competition line is not read
  // from here at all: ADMIN-RE-22 takes it from the game itself.
  const [serviceArea, setServiceArea] = useState("");

  useEffect(() => {
    fetchContactProfile(club.id)
      .then((profile) => setServiceArea(profile?.serviceArea.trim() ?? ""))
      .catch((error) => {
        console.error("AcademyNextMatch contact profile:", error);
        setServiceArea("");
      });
  }, [club.id]);

  useEffect(() => {
    // Matches /schedule's own scope: only the active season's fixtures can
    // become "next match" here, so the homepage never spotlights a fixture
    // /schedule itself doesn't list.
    fetchActiveSeason(club.id)
      .then((activeSeason) =>
        activeSeason ? fetchSchedule(activeSeason.id, club.id) : [],
      )
      .then((fixtures) => {
        const now = Date.now();
        // ADMIN-RE-03: the club's "today" and kickoff, not UTC's or the visitor's.
        const todayStr = clubToday(timeZone);
        const next =
          fixtures.find((fixture) => {
            if (!fixture.date || fixture.date < todayStr) return false;
            const kickoff = clubKickoffInstant(fixture.date, fixture.time, timeZone);
            return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() > now;
          }) ?? null;
        setNextFixture(next);
      })
      .catch((error) => {
        console.error("AcademyNextMatch:", error);
        setNextFixture(null);
      })
      .finally(() => setLoading(false));
  }, [club.id, timeZone]);

  if (showLoading) return <AcademyMatchLoadingSkeleton />;

  // ADMIN-RE-22: no game, no made-up opponent. The card says so and keeps the
  // way to the full schedule.
  if (!nextFixture) {
    return (
      <section className="bg-white px-6 py-12 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h2 className="font-display text-[clamp(2.7rem,6vw,5.5rem)] font-black uppercase italic leading-none text-[#1E3653]">
              Next Match
            </h2>
          </div>
          <div className="flex flex-col justify-between gap-4 border-t border-[#1E3653]/15 pt-5 font-body text-sm text-[#51667E] sm:flex-row">
            <span>No game coming up</span>
            <Link href="/schedule" className="font-bold text-[#1E3653] hover:text-[#FF1616]">
              Full Schedule
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const dateLabel = formatMatchDate(nextFixture.date);
  const timeLabel = formatMatchTime(nextFixture.time);
  const dateTimeLabel = timeLabel ? `${dateLabel} – ${timeLabel}` : dateLabel;
  const cityState = [nextFixture.city?.trim(), nextFixture.state?.trim()].filter(Boolean).join(", ");
  const venueLabel = nextFixture.venue?.trim() || (cityState ? "" : serviceArea);
  const locationLabel = [venueLabel, cityState].filter(Boolean).join(", ") || serviceArea;
  const opponentName = nextFixture.opponent?.trim() || "TBA";
  // The competition belongs to the game (League, cup, friendly...). A game
  // saved without one shows no competition line.
  const { competition, homeAway: homeAwayLabel } = nextMatchLabels(nextFixture);

  return (
    <section
      className="bg-white px-6 py-12 lg:px-10 lg:py-12"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h2 className="font-display text-[clamp(2.7rem,6vw,5.5rem)] font-black uppercase italic leading-none text-[#1E3653]">
            Next Match
          </h2>
        </div>

        <div className="grid items-center gap-7 bg-white px-6 py-10 md:grid-cols-[1fr_auto_1fr] md:px-12">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-28 w-28 md:h-36 md:w-36">
              {clubLogoUrl && (
                <Image src={clubLogoUrl} alt={`${club.name} crest`} fill sizes="144px" className="object-contain" />
              )}
            </div>
            <p className="mt-4 font-display text-xl font-black uppercase italic text-[#1E3653]">
              {club.name}
            </p>
          </div>
          <div className="text-center">
            <span className="font-display text-5xl font-black italic text-[#FF1616]">VS</span>
            {competition && (
              <p className="mt-3 font-body text-xs font-bold uppercase text-[#6B7E94]">
                {competition}
              </p>
            )}
            <p
              className={`${competition ? "mt-1" : "mt-3"} font-body text-xs font-bold uppercase text-[#6B7E94]`}
            >
              {homeAwayLabel}
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <OpponentCrest
              name={opponentName}
              logoUrl={nextFixture.opponentLogoUrl}
              size={112}
              className="[--opponent-crest-size:112px] md:[--opponent-crest-size:144px]"
            />
            <p className="mt-4 font-display text-xl font-black uppercase italic text-[#1E3653]">
              {opponentName}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col justify-between gap-4 border-t border-[#1E3653]/15 pt-5 font-body text-sm text-[#51667E] sm:flex-row">
          <span>{dateTimeLabel}</span>
          <span>{locationLabel}</span>
          <Link href="/schedule" className="font-bold text-[#1E3653] hover:text-[#FF1616]">
            Full Schedule
          </Link>
        </div>
      </div>
    </section>
  );
}
