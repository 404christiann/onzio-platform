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
    <div className="schedule-match-team grid justify-items-center gap-3 text-center">
      {crestOnDarkUrl ? (
        <span className="schedule-match-crest relative inline-flex size-20 rounded-full bg-white">
          <Image
            src={crestOnDarkUrl}
            alt=""
            fill
            sizes="60px"
            {...imageDeliveryProps("club-logo")}
          />
        </span>
      ) : (
        <span className="schedule-opponent-mark inline-flex size-20 items-center justify-center rounded-full bg-white font-display text-xl font-black text-ed-primary" aria-hidden>
          {clubInitials}
        </span>
      )}
      <strong className="font-display text-2xl font-black uppercase leading-none">{clubShortName}</strong>
    </div>
  );

  const opponentSide = (
    <div className="schedule-match-team grid justify-items-center gap-3 text-center">
      {fixture.opponentLogoUrl ? (
        <span className="schedule-match-crest relative inline-flex size-20 rounded-full bg-white">
          <Image
            src={fixture.opponentLogoUrl}
            alt=""
            fill
            sizes="60px"
            {...imageDeliveryProps("opponent-crest")}
          />
        </span>
      ) : (
        <span className="schedule-opponent-mark inline-flex size-20 items-center justify-center rounded-full bg-white font-display text-xl font-black text-ed-primary" aria-hidden>
          {monogram(fixture.opponent)}
        </span>
      )}
      <strong className="font-display text-2xl font-black uppercase leading-none">{fixture.opponent}</strong>
    </div>
  );

  return (
    <article className="schedule-match-card overflow-hidden bg-ed-primary text-ed-on-dark">
      <div className="schedule-match-stage grid items-center gap-6 p-8 md:grid-cols-[1fr_auto_1fr]">
        {fixture.home ? clubSide : opponentSide}
        <div className="schedule-match-center grid justify-items-center gap-2 text-center text-ed-accent">
          {outcome ? (
            <strong className="font-display text-5xl font-black">
              {homeScore}
              <span>-</span>
              {awayScore}
            </strong>
          ) : (
            <>
              <strong className="font-display text-4xl font-black">{cardTimeFormat.format(kickoff)}</strong>
              <span className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-on-dark-nav">Kickoff</span>
            </>
          )}
        </div>
        {fixture.home ? opponentSide : clubSide}
      </div>
      <div className="schedule-match-details grid gap-5 bg-ed-panel p-6 text-ed-ink">
        <div className="schedule-match-kicker flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">{fixture.competition || "League"}</span>
          {outcome ? (
            <b className="font-display text-xs font-black uppercase tracking-[0.14em]" data-outcome={outcome}>{OUTCOME_LABEL[outcome]}</b>
          ) : (
            <b className="font-display text-xs font-black uppercase tracking-[0.14em]">{fixture.home ? "Home" : "Away"}</b>
          )}
        </div>
        <h3 className="font-display text-4xl font-black uppercase leading-none">{fixture.home ? "Home match" : "Away match"}</h3>
        <dl className="grid gap-3">
          <div>
            <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Date</dt>
            <dd className="font-semibold">
              {cardDateFormat.format(kickoff)} · {cardTimeFormat.format(kickoff)}
            </dd>
          </div>
          <div>
            <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Venue</dt>
            <dd className="font-semibold">{fixture.venue}</dd>
          </div>
        </dl>
        {showAction && fixture.id && (
          <Link className="schedule-match-action inline-flex items-center justify-between gap-3 border-t border-[color:var(--ed-line)] pt-5 font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent" href={`/schedule/${fixture.id}`}>
            <span aria-hidden>...</span>
            {isNext ? "Go to next match" : "Match area"}
            <b aria-hidden>-&gt;</b>
          </Link>
        )}
      </div>
    </article>
  );
}
