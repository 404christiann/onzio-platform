"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AcademyFixtureRow from "./AcademyFixtureRow";
import { AcademyScheduleLoadingSkeleton } from "./LoadingSkeleton";
import { useClubId } from "@/components/ClubContextProvider";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import type { Fixture } from "@/lib/data";

gsap.registerPlugin(ScrollTrigger);

function fixtureKickoffInstantFromLosAngelesLocalTime(fixture: Fixture): Date {
  const [year, month, day] = fixture.date.split("-").map(Number);
  let hours = 0;
  let minutes = 0;
  const match24 = (fixture.time ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const match12 = (fixture.time ?? "").match(/(\d+):(\d+)\s*(AM|PM)/i);

  if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else if (match12) {
    hours = parseInt(match12[1], 10);
    minutes = parseInt(match12[2], 10);
    if (match12[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (match12[3].toUpperCase() === "AM" && hours === 12) hours = 0;
  }

  const approxUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const utcStr = approxUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const laStr = approxUTC.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const offsetMs = new Date(utcStr).getTime() - new Date(laStr).getTime();
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) + offsetMs);
}

function getNextMatchIndex(fixtures: Fixture[], now: Date): number {
  const index = fixtures.findIndex(
    (fixture) => fixtureKickoffInstantFromLosAngelesLocalTime(fixture) > now,
  );
  return index === -1 ? fixtures.length : index;
}

export default function AcademySchedulePage() {
  const clubId = useClubId();
  const heroRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [seasonLabel, setSeasonLabel] = useState("Current");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchActiveSeason(clubId)
      .then(async (activeSeason) => {
        setSeasonLabel(activeSeason?.label ?? "Current");
        setFixtures(activeSeason ? await fetchSchedule(activeSeason.id, clubId) : []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load schedule"),
      )
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    if (loading) return;
    gsap.fromTo(
      heroRef.current,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.15 },
    );
    const ctx = gsap.context(() => {
      gsap.fromTo(
        listRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: listRef.current, start: "top 85%" },
        },
      );
    });
    return () => ctx.revert();
  }, [loading]);

  const nextMatchIndex = useMemo(() => getNextMatchIndex(fixtures, now), [fixtures, now]);

  return (
    <div style={{ backgroundColor: "var(--color-white)" }}>
      {loading && <AcademyScheduleLoadingSkeleton />}
      {error && !loading && (
        <div className="flex items-center justify-center" style={{ minHeight: "100vh" }}>
          <p
            className="font-display font-bold uppercase tracking-widest"
            style={{ color: "var(--color-red)", fontSize: "0.9rem" }}
          >
            Failed to load schedule. Please refresh.
          </p>
        </div>
      )}
      {!loading && !error && (
        <>
          <div
            ref={heroRef}
            className="pt-36 pb-14 px-6 lg:px-10 max-w-7xl mx-auto"
            style={{ opacity: 0 }}
          >
            <p className="font-nav text-sm font-bold uppercase text-[#FF1616] sm:text-base">
              {seasonLabel} Season
            </p>
            <h1 className="mt-5 font-display text-[4rem] font-black uppercase italic leading-none text-[#1E3653] sm:text-[6.5rem] lg:text-[9rem]">
              Fixtures
            </h1>
            <div className="mt-8 h-1 w-14 bg-[#FF1616] sm:w-20" />
          </div>
          <div ref={listRef} className="max-w-7xl mx-auto pb-32" style={{ opacity: 0 }}>
            <div className="hidden grid-cols-[44px_240px_minmax(0,1fr)_160px] items-center border-b-2 border-[#1E3653] px-5 pb-4 md:grid">
              <span aria-hidden="true" />
              <span className="font-nav text-sm font-bold uppercase text-[#1E3653]">
                Date · Time
              </span>
              <span className="font-nav text-sm font-bold uppercase text-[#1E3653]">
                Opponent
              </span>
              <span aria-hidden="true" />
            </div>
            <div>
              {fixtures.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <h2 className="font-display text-2xl font-black uppercase text-[var(--color-black)]">
                    Schedule coming soon
                  </h2>
                  <p className="mx-auto mt-3 max-w-xl font-body text-[var(--color-gray-mid)]">
                    No official fixtures have been published yet.
                  </p>
                </div>
              ) : fixtures.map((fixture, index) => (
                <AcademyFixtureRow
                  key={index}
                  fixture={fixture}
                  isNext={index === nextMatchIndex}
                  isPast={index < nextMatchIndex}
                  index={index}
                />
              ))}
            </div>
            {fixtures.length > 0 && (
              <p className="font-display font-bold text-sm tracking-widest uppercase text-center mt-10 px-6" style={{ color: "#1E3653" }}>
                Match details and venues are subject to change.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
