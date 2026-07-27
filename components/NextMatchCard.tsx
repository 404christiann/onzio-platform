"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { fetchSchedule } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";

gsap.registerPlugin(ScrollTrigger);

/** Full opponent names longer than this fall back to the admin-set short name, if one is set. */
const MAX_TEAM_NAME_LENGTH = 16;

/** Converts the stored local match date and 24-hour time into a Date. */
function fixtureToDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = (timeStr ?? "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
}

function ordinal(day: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = day % 100;
  const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
  return `${day}${suffix.toUpperCase()}`;
}

/** "2027-10-24" → "SATURDAY OCTOBER 24TH" */
function formatMatchDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthName = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  return `${weekday} ${monthName} ${ordinal(day)}`;
}

/** "19:30" → "7:30PM" */
function formatMatchTime(timeStr: string): string {
  if (!timeStr) return "";
  const [hourStr, minuteStr] = timeStr.split(":");
  const hour24 = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const ampm = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")}${ampm}`;
}

export default function NextMatchCard() {
  const club = useClubContext();
  const clubId = club.id;
  const { clubLogoUrl } = useClubBranding();
  const sectionRef = useRef<HTMLElement>(null);
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchedule(undefined, clubId)
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
        console.error("NextMatchCard:", error);
        setNextFixture(null);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

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

  const sponsorLogo = nextFixture?.sponsorLogoUrl?.trim() || null;
  const sponsorName = nextFixture?.sponsorName?.trim() || "Match sponsor";
  const sponsorLink = nextFixture?.sponsorLink?.trim() || null;
  const cityState = nextFixture
    ? [nextFixture.city?.trim(), nextFixture.state?.trim()].filter(Boolean).join(", ")
    : "";
  const opponentShortName = nextFixture?.opponentShortName?.trim() || null;
  const opponentDisplayName =
    nextFixture && nextFixture.opponent.length > MAX_TEAM_NAME_LENGTH && opponentShortName
      ? opponentShortName
      : nextFixture?.opponent ?? "";

  const sponsorLogoElement = sponsorLogo ? (
    <span className="relative -mt-0.5 block h-8 w-36 sm:h-9 sm:w-44">
      <Image
        src={sponsorLogo}
        alt={`${sponsorName} logo`}
        fill
        sizes="(min-width: 640px) 176px, 144px"
        className="object-contain"
      />
    </span>
  ) : null;

  return (
    <section
      ref={sectionRef}
      className="border-b px-6 py-10 sm:py-12"
      style={{
        backgroundColor: "var(--color-white)",
        borderColor: "#e5e5e5",
        opacity: 0,
      }}
    >
      <div className="mx-auto max-w-5xl text-center">
        {loading ? (
          <p
            className="font-display font-bold uppercase tracking-widest"
            style={{ color: "var(--color-gray-mid)", fontSize: "1rem" }}
          >
            Loading…
          </p>
        ) : !nextFixture ? (
          <p
            className="font-display font-bold uppercase tracking-widest"
            style={{ color: "var(--color-gray-mid)", fontSize: "1rem" }}
          >
            No upcoming fixtures scheduled.
          </p>
        ) : (
          <>
            <div className="mx-auto flex w-fit max-w-full items-center justify-center gap-x-4 sm:gap-x-9 lg:translate-x-[11px] lg:gap-x-16">
              <div className="flex min-w-0 items-center gap-x-3 sm:gap-x-5">
                <OpponentCrest
                  name={club.name}
                  logoUrl={clubLogoUrl}
                  size={120}
                  className="flex-shrink-0 [--opponent-crest-size:56px] sm:[--opponent-crest-size:96px]"
                />
                <span
                  className="min-w-0 max-w-[32vw] truncate whitespace-nowrap font-din-condensed font-bold uppercase leading-none sm:max-w-[38vw]"
                  style={{ color: "var(--color-black)", fontSize: "clamp(1rem, 3.4vw, 2.75rem)" }}
                >
                  {club.name}
                </span>
              </div>

              <span
                className="font-din-condensed font-bold uppercase leading-none whitespace-nowrap"
                style={{ color: "var(--color-red)", fontSize: "clamp(0.7rem, 2vw, 1.4rem)" }}
              >
                vs
              </span>

              <div className="flex min-w-0 items-center gap-x-3 sm:gap-x-5">
                <span
                  className="min-w-0 max-w-[32vw] truncate whitespace-nowrap font-din-condensed font-bold uppercase leading-none sm:max-w-[38vw]"
                  style={{ color: "var(--color-black)", fontSize: "clamp(1rem, 3.4vw, 2.75rem)" }}
                >
                  {opponentDisplayName}
                </span>
                <OpponentCrest
                  name={nextFixture.opponent}
                  logoUrl={nextFixture.opponentLogoUrl}
                  size={120}
                  className="flex-shrink-0 [--opponent-crest-size:56px] sm:[--opponent-crest-size:96px]"
                />
              </div>
            </div>

            <p
              className="mx-auto mt-2 flex w-full min-w-0 max-w-[20rem] items-center justify-center gap-x-1 whitespace-nowrap text-center font-din-condensed font-normal uppercase leading-none tracking-wide sm:-mt-3 sm:w-auto sm:max-w-full sm:gap-x-3 lg:translate-x-[11px]"
              style={{ color: "#8b8b8b", fontSize: "clamp(0.48rem, 1.85vw, 0.95rem)" }}
            >
              <span className="whitespace-nowrap">{formatMatchDate(nextFixture.date)}</span>
              <span style={{ color: "var(--color-red)" }}>–</span>
              <span className="whitespace-nowrap">{formatMatchTime(nextFixture.time)}</span>
              <span>@</span>
              <span className="min-w-0 overflow-visible whitespace-nowrap">
                {nextFixture.venue}
                {cityState && (
                  <>
                    <span style={{ color: "var(--color-red)" }}> | </span>
                    {cityState}
                  </>
                )}
              </span>
            </p>

            {sponsorLogoElement && (
              <div className="mt-5 flex flex-col items-center sm:mt-6 lg:-translate-x-2">
                <p
                  className="font-body leading-none uppercase tracking-[0.18em]"
                  style={{ color: "var(--color-black)", fontSize: "0.75rem" }}
                >
                  Presented By
                </p>
                {sponsorLink ? (
                  <a
                    href={sponsorLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit ${sponsorName}`}
                    className="transition-opacity hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                    style={{ outlineColor: "var(--color-red)" }}
                  >
                    {sponsorLogoElement}
                  </a>
                ) : (
                  sponsorLogoElement
                )}
              </div>
            )}
          </>
        )}

        <Link
          href="/schedule"
          className="mt-3 inline-block border-2 px-8 py-2.5 font-display text-xs font-bold uppercase tracking-widest transition-all duration-200 lg:-translate-x-2"
          style={{ borderColor: "var(--color-black)", color: "var(--color-black)" }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = "var(--color-black)";
            event.currentTarget.style.color = "var(--color-white)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = "transparent";
            event.currentTarget.style.color = "var(--color-black)";
          }}
        >
          Full Schedule
        </Link>
      </div>
    </section>
  );
}
