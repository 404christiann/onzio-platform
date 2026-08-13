"use client";

import Link from "next/link";
import { useReducedMotion, motion } from "motion/react";
import { CrestCircle } from "@/components/ui/editorial/crest-circle";
import {
  firstUpcomingFixtureId,
  isPlayedFixture,
  sortFixturesChronologically,
} from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

export {
  firstUpcomingFixtureId,
  isPlayedFixture,
  sortFixturesChronologically,
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function kickoffDate(fixture: Fixture) {
  const [year, month, day] = fixture.date.split("-").map(Number);
  const [hours, minutes] = (fixture.time || "00:00").split(":").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
}

function scoreLabel(fixture: Fixture) {
  if (!isPlayedFixture(fixture)) return fixture.home ? "Home" : "Away";
  return `${fixture.roseCityScore}-${fixture.opponentScore}`;
}

export default function EditorialScheduleView({
  fixtures,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  league,
  seasonLabel = "Current season",
}: {
  fixtures: Fixture[];
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
  league?: string;
  seasonLabel?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const orderedFixtures = sortFixturesChronologically(fixtures);
  const nextFixtureId = firstUpcomingFixtureId(orderedFixtures);

  return (
    <div className="schedule-calendar-page bg-ed-paper pt-32 text-ed-ink">
      <main className="schedule-calendar-shell mx-auto max-w-[1180px] px-5 pb-28 md:px-8">
        <header className="schedule-calendar-head mb-14 grid gap-6 border-b border-[color:var(--ed-line)] pb-10 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-5">
            <span className="eyebrow">Team schedule</span>
            <h1 className="text-[clamp(4rem,16vw,13rem)] font-black uppercase leading-[0.78]">
              Fixtures
            </h1>
          </div>
          <p className="max-w-xs text-sm font-semibold uppercase tracking-[0.14em] text-ed-muted md:text-right">
            {seasonLabel}
            {league ? <span className="block text-ed-accent">{league}</span> : null}
          </p>
        </header>

        <section className="schedule-month-section" aria-label="Fixtures">
          <div className="schedule-card-grid grid">
            {orderedFixtures.map((fixture, index) => {
              const kickoff = kickoffDate(fixture);
              const played = isPlayedFixture(fixture);
              const isNext = Boolean(fixture.id) && fixture.id === nextFixtureId;
              const content = (
                <>
                  <span className="font-display text-sm font-black text-ed-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="grid gap-1">
                    <strong className="font-display text-3xl font-black uppercase leading-none md:text-5xl">
                      {clubShortName}
                    </strong>
                    <small className="font-semibold uppercase tracking-[0.14em] text-ed-muted">
                      {dateFormat.format(kickoff)} · {timeFormat.format(kickoff)}
                    </small>
                  </span>
                  <span className="hidden justify-self-center md:block">
                    <CrestCircle
                      src={crestOnDarkUrl}
                      alt={`${clubShortName} crest`}
                      fallback={clubInitials}
                      variant="row"
                    />
                  </span>
                  <span className="font-display text-xl font-black uppercase text-ed-muted md:text-3xl">
                    {scoreLabel(fixture)}
                  </span>
                  <span className="grid gap-1 md:text-right">
                    <strong className="font-display text-3xl font-black uppercase leading-none md:text-5xl">
                      {fixture.opponent}
                    </strong>
                    <small className="font-semibold uppercase tracking-[0.14em] text-ed-muted">
                      {fixture.venue}
                    </small>
                  </span>
                </>
              );

              const rowClassName =
                "fixture-row grid gap-5 border-t border-[color:var(--ed-line)] py-7 transition md:grid-cols-[3rem_minmax(0,1fr)_5rem_6rem_minmax(0,1fr)] md:items-center";

              return fixture.id ? (
                <motion.div
                  key={fixture.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: played ? 0.55 : 1, y: 0 }}
                  transition={{ duration: 0.42, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    href={`/schedule/${fixture.id}`}
                    className={`${rowClassName} hover:bg-ed-ink-ghost`}
                    data-next={isNext}
                    data-played={played}
                  >
                    {content}
                  </Link>
                </motion.div>
              ) : (
                <motion.div
                  key={`${fixture.date}-${fixture.opponent}-${index}`}
                  className={rowClassName}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: played ? 0.55 : 1, y: 0 }}
                  transition={{ duration: 0.42, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                  data-next={isNext}
                  data-played={played}
                >
                  {content}
                </motion.div>
              );
            })}
          </div>

          {orderedFixtures.length === 0 && (
            <div className="schedule-empty border border-[color:var(--ed-line)] bg-ed-panel-glass p-8">
              <strong className="font-display text-3xl uppercase">No fixtures published yet.</strong>
              <p className="mt-3 text-ed-muted">Check back once the active season schedule is announced.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
