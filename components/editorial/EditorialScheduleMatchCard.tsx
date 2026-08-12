import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { opponentMonogram } from "@/lib/opponent-monogram";
import { fixtureKickoff } from "@/lib/queries";
import type { Fixture } from "@/lib/data";

/**
 * Solid-color editorial schedule matchup card, ported from the approved
 * concept mockup (soccerplatformmockups src/components/public/
 * ScheduleMatchCard.tsx). Used both by the `/schedule` card grid and by
 * `EditorialMatchArea` (with `showAction={false}`, matching the mockup's own
 * dual use of this component).
 *
 * Lions' side always uses the on-dark crest (falling back to the primary
 * crest — that fallback is already baked into `crestOnDarkUrl` by
 * `fetchEditorialCrests`, so this component never needs a second crest
 * prop) and a text monogram when no crest asset exists at all. The opponent
 * side always uses a text monogram derived from the shared
 * `opponentMonogram` helper, since no opponent crest assets are seeded for
 * Lions.
 */

type Outcome = "W" | "L" | "D";

const OUTCOME_LABEL: Record<Outcome, string> = {
  W: "Win",
  L: "Loss",
  D: "Draw",
};

/** The club's own result vs the opponent, independent of home/away side. */
function outcomeForFixture(fixture: Fixture): Outcome | null {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  if (fixture.roseCityScore > fixture.opponentScore) return "W";
  if (fixture.roseCityScore < fixture.opponentScore) return "L";
  return "D";
}

function dateTimeFormats(timeZone?: string) {
  const options = timeZone ? { timeZone } : {};
  return {
    date: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      ...options,
    }),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...options,
    }),
  };
}

export default function EditorialScheduleMatchCard({
  fixture,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  timeZone,
  isNext = false,
  showAction = true,
}: {
  fixture: Fixture;
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
  timeZone?: string;
  isNext?: boolean;
  showAction?: boolean;
}) {
  const kickoff = fixtureKickoff(fixture, timeZone);
  const outcome = outcomeForFixture(fixture);
  const { date: dateFormat, time: timeFormat } = dateTimeFormats(timeZone);
  const homeScore = fixture.home ? fixture.roseCityScore : fixture.opponentScore;
  const awayScore = fixture.home ? fixture.opponentScore : fixture.roseCityScore;

  const clubSide = (
    <div className="schedule-match-team">
      {crestOnDarkUrl ? (
        <span className="schedule-match-crest">
          <Image
            src={crestOnDarkUrl}
            alt=""
            fill
            sizes="60px"
            {...imageDeliveryProps("club-logo")}
          />
        </span>
      ) : (
        <span className="schedule-opponent-mark" aria-hidden>
          {clubInitials}
        </span>
      )}
      <strong>{clubShortName}</strong>
    </div>
  );

  const opponentSide = (
    <div className="schedule-match-team">
      {fixture.opponentLogoUrl ? (
        <span className="schedule-match-crest">
          <Image
            src={fixture.opponentLogoUrl}
            alt=""
            fill
            sizes="60px"
            {...imageDeliveryProps("opponent-crest")}
          />
        </span>
      ) : (
        <span className="schedule-opponent-mark" aria-hidden>
          {opponentMonogram(fixture.opponent)}
        </span>
      )}
      <strong>{fixture.opponent}</strong>
    </div>
  );

  return (
    <article className="schedule-match-card">
      <div className="schedule-match-stage">
        {fixture.home ? clubSide : opponentSide}
        <div className="schedule-match-center">
          {outcome ? (
            <strong>
              {homeScore}
              <span>–</span>
              {awayScore}
            </strong>
          ) : (
            <>
              <strong>{timeFormat.format(kickoff)}</strong>
              <span>Kickoff</span>
            </>
          )}
        </div>
        {fixture.home ? opponentSide : clubSide}
      </div>
      <div className="schedule-match-details">
        <div className="schedule-match-kicker">
          <span>{fixture.competition || "League"}</span>
          {outcome ? (
            <b data-outcome={outcome}>{OUTCOME_LABEL[outcome]}</b>
          ) : (
            <b>{fixture.home ? "Home" : "Away"}</b>
          )}
        </div>
        <h3>{fixture.home ? "Home match" : "Away match"}</h3>
        <dl>
          <div>
            <dt>Date</dt>
            <dd>
              {dateFormat.format(kickoff)} · {timeFormat.format(kickoff)}
            </dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{fixture.venue}</dd>
          </div>
        </dl>
        {showAction && fixture.id && (
          <Link className="schedule-match-action" href={`/schedule/${fixture.id}`}>
            <span aria-hidden>⋮</span>
            {isNext ? "Go to next match" : "Match area"}
            <b aria-hidden>→</b>
          </Link>
        )}
      </div>
    </article>
  );
}
