"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import {
  fetchContactProfile,
  fetchLeagueStandings,
  fetchSchedule,
} from "@/lib/queries";

gsap.registerPlugin(ScrollTrigger);

/** Converts the stored local match date and 24-hour time into a Date. */
function fixtureToDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = (timeStr ?? "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
}

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
  const { clubLogoUrl } = useClubBranding();
  const sectionRef = useRef<HTMLElement>(null);
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  // Both of these were hardcoded club facts even though each already had an
  // admin-editable home: the competition name is the standings section title
  // the club edits at /admin/standings, and the fallback location is the
  // service area it edits at /admin/contact. Neither is template chrome, so
  // neither belongs in component source (DCFC-D007).
  const [leagueLabel, setLeagueLabel] = useState("");
  const [serviceArea, setServiceArea] = useState("");

  useEffect(() => {
    fetchLeagueStandings(club.id)
      .then((content) => setLeagueLabel(content.settings.title.trim()))
      .catch((error) => {
        console.error("AcademyNextMatch standings settings:", error);
        setLeagueLabel("");
      });
    fetchContactProfile(club.id)
      .then((profile) => setServiceArea(profile?.serviceArea.trim() ?? ""))
      .catch((error) => {
        console.error("AcademyNextMatch contact profile:", error);
        setServiceArea("");
      });
  }, [club.id]);

  useEffect(() => {
    fetchSchedule(undefined, club.id)
      .then((fixtures) => {
        const now = Date.now();
        const todayStr = new Date().toISOString().split("T")[0];
        const next =
          fixtures.find((fixture) => {
            if (!fixture.date || fixture.date < todayStr) return false;
            const kickoff = fixtureToDate(fixture.date, fixture.time ?? "00:00");
            return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() > now;
          }) ?? null;
        setNextFixture(next);
      })
      .catch((error) => {
        console.error("AcademyNextMatch:", error);
        setNextFixture(null);
      })
      .finally(() => setLoading(false));
  }, [club.id]);

  useEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power2.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 85%" },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [loading]);

  if (loading) return null;

  const dateLabel = nextFixture ? formatMatchDate(nextFixture.date) : "Date and time TBA";
  const timeLabel = nextFixture ? formatMatchTime(nextFixture.time) : "";
  const dateTimeLabel = timeLabel ? `${dateLabel} – ${timeLabel}` : dateLabel;
  const cityState = nextFixture
    ? [nextFixture.city?.trim(), nextFixture.state?.trim()].filter(Boolean).join(", ")
    : "";
  const venueLabel = nextFixture?.venue?.trim() || (cityState ? "" : serviceArea);
  const locationLabel =
    [venueLabel, cityState || (nextFixture ? "" : "")].filter(Boolean).join(", ") ||
    serviceArea;
  const opponentName = nextFixture?.opponent?.trim() || "TBA";
  const opponentLabel = nextFixture ? opponentName : "Next Opponent";

  return (
    <section
      ref={sectionRef}
      className="bg-white px-6 py-12 lg:px-10 lg:py-12"
      style={{ opacity: 0 }}
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
            {leagueLabel && (
              <p className="mt-3 font-body text-xs font-bold uppercase text-[#6B7E94]">
                {leagueLabel}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center text-center">
            <OpponentCrest
              name={opponentName}
              logoUrl={nextFixture?.opponentLogoUrl}
              size={112}
              className="[--opponent-crest-size:112px] md:[--opponent-crest-size:144px]"
            />
            <p className="mt-4 font-display text-xl font-black uppercase italic text-[#1E3653]">
              {opponentLabel}
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
