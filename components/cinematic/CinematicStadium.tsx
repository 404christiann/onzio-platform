"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { fetchSchedule } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/editorial-identity";
import { isTicketPurchaseUrl, type TicketsContent } from "@/lib/tickets-content";
import { stadiumCropViewBox, type StadiumArtwork, type StadiumPageContent } from "@/lib/stadium-content";
import { useCinematicContent } from "./CinematicContent";
import { cinematicMatchDate, cinematicMatchTime, nextHomeFixture } from "./next-home-fixture";
import "./stadium.css";

export type StadiumTicketing = Pick<TicketsContent, "purchaseUrl" | "missingPurchaseLabel">;
const EMPTY_TICKETING: StadiumTicketing = { purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" };
export default function CinematicStadium({ content, ticketing = EMPTY_TICKETING }: { content: StadiumPageContent; ticketing?: StadiumTicketing }) {
  const club = useClubContext(), branding = useClubBranding();
  const { content: shared } = useCinematicContent();
  const [match, setMatch] = useState<{ clubId: string; fixture: Fixture | null; loading: boolean }>({ clubId: club.id, fixture: null, loading: true });
  useEffect(() => {
    let active = true;
    setMatch({ clubId: club.id, fixture: null, loading: true });
    if (!content.showMatch) return () => { active = false; };
    Promise.all([fetchSchedule(undefined, club.id), fetchClubIdentity(club.id)]).then(([fixtures, identity]) => {
      if (active) setMatch({ clubId: club.id, fixture: nextHomeFixture(fixtures, new Date(), identity?.timeZone || "UTC"), loading: false });
    }).catch(() => { if (active) setMatch({ clubId: club.id, fixture: null, loading: false }); });
    return () => { active = false; };
  }, [club.id, content.showMatch]);
  const fixture = match.clubId === club.id ? match.fixture : null;
  const art = (image: StadiumArtwork, className?: string) => image.url
    ? <NativeImage className={className} src={image.url} alt={image.alt} width={image.width ?? undefined} height={image.height ?? undefined} /> : null;
  const { bus, map, partner } = content.artwork;
  const splitMap = content.phoneMapLayout === "split" && !!map.width && !!map.height;
  return <div className="robinson-2027">
    {content.showHeading && <section className="robinson-heading" aria-labelledby="robinson-title" data-empty-bus={!bus.url || undefined}>
      <div><h1 id="robinson-title">{content.title}</h1>{content.subtitle && <p>{content.subtitle}</p>}</div>{art(bus)}
    </section>}
    {content.showMap && map.url && <section className="robinson-route" aria-label={map.alt || "Stadium route map"}>
      {art(map, splitMap ? "robinson-route-desktop" : "robinson-route-full")}
      {splitMap && <div className="robinson-route-phone">
        <svg className="robinson-route-card" viewBox={stadiumCropViewBox(content.phoneCardCrop, map.width!, map.height!)} role="img" aria-label={map.alt || "Stadium route card"}><image href={map.url} width={map.width!} height={map.height!} /></svg>
        <svg className="robinson-route-map" viewBox={stadiumCropViewBox(content.phoneMapCrop, map.width!, map.height!)} role="img" aria-label={map.alt || "Stadium walking map"}><image href={map.url} width={map.width!} height={map.height!} /></svg>
      </div>}
    </section>}
    {content.showSections && content.sections.some(section => section.visible) && <section className="robinson-directions" aria-label="Stadium information">
      {content.sections.filter(section => section.visible).map(section => <div key={section.id}>
        {section.heading && <h2>{section.heading}</h2>}{section.body && <p>{section.body}</p>}
        {section.note && <p className="robinson-parking-note"><em>{section.note}</em></p>}
        {section.bullets.length > 0 && <ul>{section.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
      </div>)}
    </section>}
    {(content.showMatch || content.showBenefits) && <section className="robinson-match-includes" aria-label="Next home match and ticket benefits" data-single-column={(!content.showMatch || !content.showBenefits) || undefined}>
      {content.showMatch && <article className="robinson-match"><h2>{shared?.match.heading || "Next home match"}</h2>
        {fixture ? <><p className="robinson-match-date">{cinematicMatchDate(fixture.date)}</p><div className="robinson-teams">
          {branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={club.name + " crest"} />}
          <strong>{cinematicMatchTime(fixture.time)}</strong><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={96} />
        </div><p className="robinson-venue">{fixture.venue}<br />{[fixture.city, fixture.state].filter(Boolean).join(", ")}</p></>
          : <div className="robinson-match-pending">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={club.name + " crest"} />}
            <p role="status">{match.loading ? "Loading next home match…" : shared?.match.emptyMessage || "The next home match will be announced soon."}</p></div>}
        {ticketing.purchaseUrl && isTicketPurchaseUrl(ticketing.purchaseUrl)
          ? <a className="robinson-buy" href={ticketing.purchaseUrl}>{shared?.match.buttonLabel || "Buy tickets"}</a>
          : <><button className="robinson-buy" disabled aria-describedby="robinson-purchase-note">{shared?.match.buttonLabel || "Buy tickets"}</button><p id="robinson-purchase-note" className="robinson-purchase-note">{ticketing.missingPurchaseLabel}</p></>}
        {art(partner, "robinson-chick")}
      </article>}
      {content.showBenefits && <div className="robinson-includes"><h2>{content.includesHeading}</h2>
        {content.benefits.map((benefit, index) => <div key={index}><h3>{benefit.title}</h3><p>{benefit.detail}</p></div>)}
        {content.benefitsNote && <p className="robinson-ticket-note"><i aria-hidden="true" /><em>{content.benefitsNote}</em></p>}
      </div>}
    </section>}
  </div>;
}
