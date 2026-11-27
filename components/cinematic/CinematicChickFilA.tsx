"use client";

import { useEffect, useId, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubTimeZone } from "@/components/ClubTimeZoneProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { fetchSchedule } from "@/lib/queries";
import { type TicketsPageContent } from "@/lib/tickets-content";
import type { ChickFilAArtwork, ChickFilAPageContent } from "@/lib/chick-fil-a-content";
import { useCinematicContent } from "./CinematicContent";
import { cinematicMatchDate, cinematicMatchTime, nextHomeFixture } from "./next-home-fixture";
import "./chick-fil-a.css";
import { renderableLink } from "@/lib/link-destination";

export default function CinematicChickFilA({ content, purchase }: {
  content: ChickFilAPageContent;
  purchase: Pick<TicketsPageContent, "purchaseUrl" | "missingPurchaseLabel">;
}) {
  const club = useClubContext(), branding = useClubBranding(), timeZone = useClubTimeZone();
  const { content: shared } = useCinematicContent();
  const purchaseNoteId = useId();
  const [match, setMatch] = useState<{ clubId: string; fixture: Fixture | null; loading: boolean }>({ clubId: club.id, fixture: null, loading: true });
  useEffect(() => {
    let active = true;
    setMatch({ clubId: club.id, fixture: null, loading: true });
    fetchSchedule(undefined, club.id)
      .then(fixtures => { if (active) setMatch({ clubId: club.id, fixture: nextHomeFixture(fixtures, new Date(), timeZone), loading: false }); })
      .catch(() => { if (active) setMatch({ clubId: club.id, fixture: null, loading: false }); });
    return () => { active = false; };
  }, [club.id, timeZone]);
  const fixture = match.clubId === club.id ? match.fixture : null;
  const loading = match.clubId !== club.id || match.loading;
  const art = (image: ChickFilAArtwork, className?: string, lazy = false) => image.url ? <NativeImage className={className} src={image.url} alt={image.alt} width={image.width ?? undefined} height={image.height ?? undefined} loading={lazy ? "lazy" : "eager"} /> : null;
  const { mealPass, driveThru, freeTicket, enjoyGame, map, restaurant, partner, background } = content.artwork;
  const steps = [driveThru, freeTicket, enjoyGame];
  return <div className="food-page">
    {content.sections.heading && <section className="food-heading" aria-labelledby="food-title"><h1 id="food-title">{content.title}</h1>{content.subtitle && <p>{content.subtitle}</p>}</section>}
    {content.sections.details && <section className="food-details" aria-labelledby="food-details-title" data-empty-image={!mealPass.url || undefined}>
      {art(mealPass, "food-meal-pass")}<div><h2 id="food-details-title">{content.detailsHeading}</h2><p>{content.detailsBody}</p></div>
    </section>}
    {content.sections.steps && <section className="food-steps" aria-label="How the meal pass works"><ol>{steps.map((image, index) => <li key={index}>
      <div className="food-step-icon">{art(image)}</div><p>{content.stepLabels[index]}</p><span aria-hidden="true">{content.stepNumbers[index]}</span>
    </li>)}</ol></section>}
    {content.sections.map && map.url && <section className="food-map" aria-label="Route to the stadium">{art(map, undefined, true)}</section>}
    {content.sections.match && <section className="food-match-area" aria-labelledby="food-match-title" style={{ backgroundImage: background.url ? `url("${background.url}")` : "none" }}>
      <article className="food-match"><h2 id="food-match-title">{shared?.match.heading || "Next home match"}</h2>
        {fixture ? <><p className="food-match-date">{cinematicMatchDate(fixture.date)}</p><div className="food-teams">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={`${club.name} crest`} />}<strong>{cinematicMatchTime(fixture.time)}</strong><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={96} /></div><p className="food-venue">{fixture.venue}<br />{[fixture.city, fixture.state].filter(Boolean).join(", ")}</p></> :
          <div className="food-match-pending">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={`${club.name} crest`} />}<p role="status">{loading ? "Loading next home match…" : shared?.match.emptyMessage || "The next home match will be announced soon."}</p></div>}
        {renderableLink(purchase.purchaseUrl) ? <a className="food-buy" href={renderableLink(purchase.purchaseUrl)}>{shared?.match.buttonLabel || "Buy tickets"}</a> : <><button className="food-buy" disabled aria-describedby={purchaseNoteId}>{shared?.match.buttonLabel || "Buy tickets"}</button><p id={purchaseNoteId} className="food-purchase-note">{purchase.missingPurchaseLabel}</p></>}
        {art(partner, "food-chick-logo")}
      </article>
    </section>}
    {content.sections.restaurant && restaurant.url && <section className="food-restaurant" aria-label={restaurant.alt || "Restaurant"}>{art(restaurant, undefined, true)}</section>}
  </div>;
}
