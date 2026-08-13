"use client";

import Link from "next/link";
import { EditorialButtonLink } from "@/components/ui/editorial/button";
import { CrestCircle } from "@/components/ui/editorial/crest-circle";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { findNextFixture, fixtureKickoff, monogram } from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

const matchDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const matchTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export default function EditorialNextMatch({
  fixtures,
}: {
  fixtures: Fixture[] | null;
}) {
  const club = useClubContext();
  const { identity, crestUrl } = useEditorialIdentity();

  if (!fixtures) return null;
  const next = findNextFixture(fixtures);
  if (!next) return null;

  const clubShortName = identity?.shortName || club.name;
  const clubInitials = identity?.initials || monogram(club.name);
  const kickoff = fixtureKickoff(next);

  return (
    <section className="match-feature bg-ed-primary px-5 py-24 text-ed-on-dark md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-12">
        <header className="match-feature-head grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-4">
            <span className="eyebrow">Next match</span>
            <h2 className="text-[clamp(3.5rem,12vw,10rem)] uppercase leading-[0.8]">
              Matchday
            </h2>
          </div>
          {next.competition && (
            <p className="font-display text-sm font-black uppercase tracking-[0.16em] text-ed-on-dark-nav">
              {next.competition}
            </p>
          )}
        </header>

        <div className="match-stage grid items-center gap-8 border-y border-white/20 py-10 md:grid-cols-[1fr_auto_1fr]">
          <div className="match-side match-club grid justify-items-start gap-5">
            <CrestCircle
              src={crestUrl}
              alt={`${club.name} crest`}
              fallback={clubInitials}
              variant="feature"
            />
            <strong className="font-display text-4xl font-black uppercase leading-none md:text-6xl">
              {clubShortName}
            </strong>
          </div>

          <div className="match-center grid justify-items-start gap-2 text-ed-accent md:justify-items-center">
            <span className="font-display text-5xl font-black md:text-7xl">VS</span>
            <p className="font-display text-xs font-black uppercase tracking-[0.18em] text-ed-on-dark-nav">
              {next.home ? "Home" : "Away"}
            </p>
          </div>

          <div className="match-side match-opponent grid justify-items-start gap-5 md:justify-items-end md:text-right">
            <CrestCircle
              src={next.opponentLogoUrl}
              alt={`${next.opponent} opponent crest`}
              fallback={monogram(next.opponent)}
              variant="feature"
            />
            <strong className="font-display text-4xl font-black uppercase leading-none md:text-6xl">
              {next.opponent}
            </strong>
          </div>
        </div>

        <div className="match-meta grid gap-4 md:grid-cols-3">
          {[
            ["Date", matchDateFormat.format(kickoff)],
            ["Kickoff", matchTimeFormat.format(kickoff)],
            ["Venue", next.venue],
          ].map(([label, value]) => (
            <p key={label} className="border border-white/15 bg-white/5 p-5">
              <small className="block font-display text-xs font-black uppercase tracking-[0.16em] text-ed-on-dark-nav">
                {label}
              </small>
              <strong className="mt-2 block font-display text-2xl font-black uppercase leading-tight">
                {value}
              </strong>
            </p>
          ))}
        </div>

        <footer className="match-feature-foot flex flex-wrap items-center gap-4">
          <EditorialButtonLink href="/schedule" variant="dark">
            Full schedule
          </EditorialButtonLink>
          {next.id ? (
            <Link
              href={`/schedule/${next.id}`}
              className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-on-dark-nav underline-offset-4 hover:text-ed-on-dark hover:underline"
            >
              Match area
            </Link>
          ) : null}
        </footer>
      </div>
    </section>
  );
}
