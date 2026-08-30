"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
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

/**
 * Editorial "Next match" section, ported (visual design) from the approved
 * concept mockup via the superseded reference branch's EditorialNextMatch.tsx
 * (its `.match-feature`). Presentational: EditorialHome supplies the
 * already-fetched fixture list (or null while still loading) so this stays
 * independently testable. next-match resolution and the opponent
 * monogram fallback come from lib/editorial-fixtures.ts (a plain .ts module,
 * not defined inline here) since the shared lib/queries.ts helpers the
 * reference branch used for this don't exist on this branch yet -- mirrors
 * the date-parsing NextMatchCard.tsx and AcademyNextMatch.tsx already use
 * for the same purpose.
 */
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
  const dateTimeLabel = `${matchDateFormat.format(kickoff)} · ${matchTimeFormat.format(kickoff)}`;

  return (
    <section className="match-feature">
      <header className="match-feature-head">
        <h2>Next match</h2>
      </header>

      <div className="match-stage">
        <div className="match-side match-club">
          {crestUrl ? (
            <Image
              src={crestUrl}
              alt={`${club.name} crest`}
              width={220}
              height={218}
              {...imageDeliveryProps("club-logo")}
            />
          ) : (
            <span aria-hidden>{clubInitials}</span>
          )}
          <strong>{clubShortName}</strong>
        </div>

        <div className="match-center">
          <span>VS</span>
          {next.competition ? <p>{next.competition}</p> : null}
        </div>

        <div className="match-side match-opponent">
          {next.opponentLogoUrl ? (
            <Image
              src={next.opponentLogoUrl}
              alt={`${next.opponent} crest`}
              width={220}
              height={218}
              {...imageDeliveryProps("opponent-crest")}
            />
          ) : (
            <span aria-hidden>{monogram(next.opponent)}</span>
          )}
          <strong>{next.opponent}</strong>
        </div>
      </div>

      <footer className="match-feature-foot">
        <span>{dateTimeLabel}</span>
        <span>{next.venue}</span>
        <Link href="/schedule">Full schedule →</Link>
      </footer>
    </section>
  );
}
