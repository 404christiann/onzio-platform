"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { findLatestResult, findNextFixture, fixtureKickoff } from "@/lib/queries";
import { opponentMonogram as monogram } from "@/lib/opponent-monogram";
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
 * Editorial "Next match" section, ported from the approved concept mockup's
 * `.match-feature`. Presentational: the caller supplies the already-fetched
 * fixture list (or `null` while still loading) so this component stays
 * independently testable and never renders a season selector or any Pro-only
 * content.
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
  const latest = findLatestResult(fixtures);

  const clubShortName = identity?.shortName || club.name;
  const clubInitials = identity?.initials || club.name.slice(0, 3).toUpperCase();
  const kickoff = fixtureKickoff(next);
  const hasLatestResult =
    latest && latest.roseCityScore != null && latest.opponentScore != null;

  return (
    <section className="match-feature">
      <header className="match-feature-head">
        <span className="eyebrow">Next match</span>
        {next.competition && <p>{next.competition}</p>}
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
          <p>{next.home ? "Home" : "Away"}</p>
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

      <div className="match-meta">
        <p>
          <small>Date</small>
          <strong>{matchDateFormat.format(kickoff)}</strong>
        </p>
        <p>
          <small>Kickoff</small>
          <strong>{matchTimeFormat.format(kickoff)}</strong>
        </p>
        <p>
          <small>Venue</small>
          <strong>{next.venue}</strong>
        </p>
      </div>

      <footer className="match-feature-foot">
        {hasLatestResult && latest && (
          <p>
            <small>Latest result</small>
            <strong>
              {clubInitials} {latest.roseCityScore}–{latest.opponentScore}{" "}
              {monogram(latest.opponent)}
            </strong>
            <span>{latest.opponent}</span>
          </p>
        )}
        <Link href="/schedule">Full schedule →</Link>
      </footer>
    </section>
  );
}
