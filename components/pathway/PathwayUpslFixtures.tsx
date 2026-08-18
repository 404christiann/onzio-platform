import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import {
  formatPathwayFixtureDate,
  formatPathwayFixtureTime,
  pathwayFixtureOrdinal,
  pathwayNextFixtureIndex,
  pathwayOpponentMonogram,
} from "@/lib/pathway-upsl-fixtures";

export type {
  PathwayUpslFixture,
  PathwayUpslFixtureResult,
} from "@/lib/pathway-upsl-fixtures";

import type { PathwayUpslFixture } from "@/lib/pathway-upsl-fixtures";

export type PathwayUpslFixturesProps = {
  fixtures: PathwayUpslFixture[];
  /** e.g. "Fall 2026" — rendered as the "{seasonLabel} Season" eyebrow. */
  seasonLabel?: string;
};

/**
 * Pathway's UPSL fixtures page keeps the accepted Diverse City row
 * geometry — ordinal gutter, date/time column, crest + opponent + venue,
 * and a right-hand side/result column — while speaking pathway's own
 * design tokens rather than that tenant's literal navy/red hexes and
 * font-display utilities.
 *
 * The component is self-contained: it derives its own "next" and "past"
 * states from the supplied list and the current time, the same way
 * app/(public)/schedule/page.tsx does for the legacy templates, so a
 * route page only has to hand it fixtures.
 *
 * The opponent crest deliberately does not reuse components/OpponentCrest.tsx:
 * that component hardcodes the legacy global --color-gray-light /
 * --color-gray-mid tokens and the Tailwind font-display utility, none of
 * which exist in the pathway palette. It carries its own scoped crest
 * classes instead, exactly as PathwayUpslStandingsTable.tsx does.
 */
export default function PathwayUpslFixtures({
  fixtures,
  seasonLabel,
}: PathwayUpslFixturesProps) {
  const nextIndex = pathwayNextFixtureIndex(fixtures, new Date());

  return (
    <main className="pathway-upsl-fixtures">
      <div className="pathway-upsl-fixtures-inner">
        <header className="pathway-upsl-fixtures-hero">
          <p className="pathway-upsl-fixtures-eyebrow">
            {seasonLabel ? `${seasonLabel} Season` : "Season"}
          </p>
          <h1 className="pathway-upsl-fixtures-title">Fixtures</h1>
          <div className="pathway-upsl-fixtures-rule" aria-hidden="true" />
        </header>

        {fixtures.length === 0 ? (
          <div className="pathway-upsl-fixtures-empty">
            <h2>Schedule coming soon</h2>
            <p>No official fixtures have been published yet.</p>
          </div>
        ) : (
          <div className="pathway-upsl-fixtures-list">
            <div className="pathway-upsl-fixtures-head" aria-hidden="true">
              <span />
              <span>Date · Time</span>
              <span>Opponent</span>
              <span />
            </div>

            {fixtures.map((fixture, index) => (
              <PathwayUpslFixtureRow
                fixture={fixture}
                index={index}
                isNext={index === nextIndex}
                isPast={index < nextIndex}
                key={fixture.id}
              />
            ))}

            <p className="pathway-upsl-fixtures-note">
              Match details and venues are subject to change.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function PathwayUpslFixtureRow({
  fixture,
  index,
  isNext,
  isPast,
}: {
  fixture: PathwayUpslFixture;
  index: number;
  isNext: boolean;
  isPast: boolean;
}) {
  const kickoff = formatPathwayFixtureTime(fixture.time);
  const monogram = pathwayOpponentMonogram(fixture.opponent);
  const result = fixture.result;
  const crestFallback = (
    <span
      className="pathway-upsl-fixtures-abbr pathway-upsl-fixtures-logo-fallback"
      aria-hidden="true"
    >
      {monogram}
    </span>
  );

  return (
    <article
      className="pathway-upsl-fixtures-row"
      data-next={isNext ? "true" : "false"}
      data-past={isPast ? "true" : "false"}
      data-played={result ? "true" : "false"}
    >
      <span className="pathway-upsl-fixtures-index" aria-hidden="true">
        {pathwayFixtureOrdinal(index)}
      </span>

      <div className="pathway-upsl-fixtures-when">
        <p className="pathway-upsl-fixtures-date">
          {formatPathwayFixtureDate(fixture.date)}
        </p>
        <p className="pathway-upsl-fixtures-time">{kickoff || "Time TBA"}</p>
      </div>

      <div className="pathway-upsl-fixtures-match">
        {fixture.opponentLogoUrl ? (
          <span className="pathway-upsl-fixtures-crest">
            <ResilientImage
              src={fixture.opponentLogoUrl}
              alt=""
              fill
              sizes="56px"
              className="pathway-upsl-fixtures-crest-img"
              fallback={crestFallback}
              {...imageDeliveryProps("opponent-crest")}
            />
          </span>
        ) : (
          <span className="pathway-upsl-fixtures-abbr" aria-hidden="true">
            {monogram}
          </span>
        )}

        <div className="pathway-upsl-fixtures-identity">
          <div className="pathway-upsl-fixtures-name-row">
            <h2 className="pathway-upsl-fixtures-opponent">
              {fixture.opponent}
            </h2>
            {isNext ? (
              <span className="pathway-upsl-fixtures-next-pill">Next</span>
            ) : null}
          </div>
          <p className="pathway-upsl-fixtures-venue">
            {fixture.venue?.trim() || "Venue TBA"}
          </p>
        </div>
      </div>

      <div className="pathway-upsl-fixtures-status">
        {result ? (
          <>
            <p
              className="pathway-upsl-fixtures-result"
              data-outcome={result.label}
            >
              {result.label} {result.score}
            </p>
            <p className="pathway-upsl-fixtures-final">Final</p>
          </>
        ) : (
          <p className="pathway-upsl-fixtures-side">
            {fixture.home ? "Home" : "Away"}
          </p>
        )}
      </div>
    </article>
  );
}
