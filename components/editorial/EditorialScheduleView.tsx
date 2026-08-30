"use client";

import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import {
  firstUpcomingFixtureId,
  fixtureKickoff,
  isPlayedFixture,
  monogram,
  outcomeForFixture,
} from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

const fixtureDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const fixtureTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function sortedFixtures(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort(
    (a, b) => fixtureKickoff(a).getTime() - fixtureKickoff(b).getTime(),
  );
}

function timeLabel(fixture: Fixture): string {
  if (!fixture.time || fixture.time.toUpperCase() === "TBD") return "Time TBA";
  return fixtureTimeFormat.format(fixtureKickoff(fixture));
}

export default function EditorialScheduleView({
  fixtures,
  seasonLabel,
}: {
  fixtures: Fixture[];
  seasonLabel: string;
}) {
  const orderedFixtures = sortedFixtures(fixtures);
  const seasonEyebrow = /\bseason$/i.test(seasonLabel.trim())
    ? seasonLabel
    : `${seasonLabel} Season`;
  const nextFixtureId = firstUpcomingFixtureId(orderedFixtures);
  const nextFixtureIndex = nextFixtureId
    ? orderedFixtures.findIndex((fixture) => fixture.id === nextFixtureId)
    : orderedFixtures.findIndex((fixture) => !isPlayedFixture(fixture));

  return (
    <div className="schedule-calendar-page">
      <main className="schedule-calendar-shell">
        <header className="interior-hero fixtures-hero">
          <span className="fixtures-eyebrow">{seasonEyebrow}</span>
          <h1>Fixtures</h1>
          <span className="head-rule" aria-hidden="true" />
        </header>

        <section className="fixtures-section" aria-label="Fixtures">
          <div className="fixtures-colhead" aria-hidden="true">
            <span />
            <span>Date · Time</span>
            <span>Opponent</span>
            <span />
          </div>

          {orderedFixtures.length === 0 ? (
            <div className="schedule-empty">
              <strong>Schedule coming soon</strong>
              <p>No official fixtures have been published yet.</p>
            </div>
          ) : (
            <div className="fixtures-list">
              {orderedFixtures.map((fixture, index) => {
                const isPlayed = isPlayedFixture(fixture);
                const outcome = outcomeForFixture(fixture);
                const score =
                  outcome && fixture.roseCityScore != null && fixture.opponentScore != null
                    ? `${fixture.roseCityScore}-${fixture.opponentScore}`
                    : null;
                const isPast = nextFixtureIndex > -1 && index < nextFixtureIndex;
                const isNext = nextFixtureIndex === index;
                const rowContent = (
                  <div className="fixture-row-grid">
                    <span className="fixture-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="fixture-date">
                      <p>{fixtureDateFormat.format(fixtureKickoff(fixture))}</p>
                      <span>{timeLabel(fixture)}</span>
                    </div>

                    <div className="fixture-opponent">
                      <span className="fixture-opponent-mark">
                        {fixture.opponentLogoUrl ? (
                          <Image
                            src={fixture.opponentLogoUrl}
                            alt=""
                            width={56}
                            height={56}
                            {...imageDeliveryProps("opponent-crest")}
                          />
                        ) : (
                          <span aria-hidden>{monogram(fixture.opponent)}</span>
                        )}
                      </span>
                      <div>
                        <h2>
                          {fixture.opponent}
                          {isNext ? <span>Next</span> : null}
                        </h2>
                        <p>{fixture.venue?.trim() || "Venue TBA"}</p>
                      </div>
                    </div>

                    <div className="fixture-result">
                      {outcome && score ? (
                        <>
                          <p data-outcome={outcome}>
                            {outcome} {score}
                          </p>
                          <span>Final</span>
                        </>
                      ) : (
                        <span>{fixture.home ? "Home" : "Away"}</span>
                      )}
                    </div>
                  </div>
                );

                return (
                  <article
                    key={fixture.id ?? `${fixture.date}-${fixture.opponent}`}
                    className="fixture-row"
                    data-next={isNext || undefined}
                    data-past={isPast || undefined}
                    data-has-result={isPlayed || undefined}
                  >
                    {fixture.id ? (
                      <Link href={`/schedule/${fixture.id}`} className="fixture-row-link">
                        {rowContent}
                      </Link>
                    ) : (
                      rowContent
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {orderedFixtures.length > 0 ? (
            <p className="fixtures-footnote">
              Match details and venues are subject to change.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
