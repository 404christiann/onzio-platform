import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import {
  fixtureKickoff,
  monogram,
  outcomeForFixture,
  type MatchOutcome,
} from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

/**
 * Solid-color editorial schedule matchup card, ported (visual design) from
 * the approved concept mockup via the superseded claude/lions-fc-website-
 * setup-ij0p7t reference branch's EditorialScheduleMatchCard.tsx. Used both
 * by the /schedule card grid (EditorialScheduleView) and by
 * EditorialMatchArea (with showAction={false}, matching the mockup's own
 * dual use of this component).
 *
 * Lions' side uses the on-dark crest (crestOnDarkUrl, already resolved with
 * a primary-crest fallback baked in by EditorialShell) and a text monogram
 * when no crest asset exists at all. The opponent side uses its own logo
 * when seeded, or a text monogram otherwise. Both monograms come from
 * lib/editorial-fixtures.ts's monogram() -- the same helper
 * EditorialNextMatch.tsx already uses for this exact purpose -- rather than
 * the reference branch's separate lib/opponent-monogram.ts, which has no
 * equivalent on this branch and would have duplicated identical logic.
 *
 * Kickoff date/time formatting deliberately stays timezone-naive (browser-
 * local Date, no explicit Intl `timeZone` option), matching the established
 * precedent already shipped in EditorialNextMatch.tsx (E3) -- see
 * lib/editorial-fixtures.ts's fixtureKickoff() doc comment. The reference
 * branch's `timeZone`-aware variant was not ported for this reason.
 */

const OUTCOME_LABEL: Record<MatchOutcome, string> = {
  W: "Win",
  L: "Loss",
  D: "Draw",
};

const cardDateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const cardTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export default function EditorialScheduleMatchCard({
  fixture,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  isNext = false,
  showAction = true,
}: {
  fixture: Fixture;
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
  isNext?: boolean;
  showAction?: boolean;
}) {
  const kickoff = fixtureKickoff(fixture);
  const outcome = outcomeForFixture(fixture);
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
          {monogram(fixture.opponent)}
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
              <strong>{cardTimeFormat.format(kickoff)}</strong>
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
              {cardDateFormat.format(kickoff)} · {cardTimeFormat.format(kickoff)}
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
