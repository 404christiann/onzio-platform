"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { fetchSchedule } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { isTicketPurchaseUrl, isTicketSectionShown, type TicketsPageContent, type TicketsArtwork } from "@/lib/tickets-content";
import { useCinematicContent } from "./CinematicContent";
import { cinematicMatchDate, cinematicMatchTime, nextHomeFixture } from "./next-home-fixture";
import "./tickets.css";
export default function CinematicTickets({ content }: {
    content: TicketsPageContent;
}) {
    const club = useClubContext(), branding = useClubBranding();
    const { content: shared } = useCinematicContent();
    const [match, setMatch] = useState<{
        clubId: string;
        fixture: Fixture | null;
        loading: boolean;
    }>({ clubId: club.id, fixture: null, loading: true });
    useEffect(() => {
        let active = true;
        setMatch({ clubId: club.id, fixture: null, loading: true });
        Promise.all([fetchSchedule(undefined, club.id), fetchClubIdentity(club.id)]).then(([fixtures, identity]) => { if (active)
            setMatch({ clubId: club.id, fixture: nextHomeFixture(fixtures, new Date(), identity?.timeZone || "UTC"), loading: false }); })
            .catch(() => { if (active)
            setMatch({ clubId: club.id, fixture: null, loading: false }); });
        return () => { active = false; };
    }, [club.id]);
    const fixture = match.clubId === club.id ? match.fixture : null;
    const art = (image: TicketsArtwork, className?: string, lazy = false) => image.url ? <NativeImage className={className} src={image.url} alt={image.alt} width={image.width ?? undefined} height={image.height ?? undefined} loading={lazy ? "lazy" : "eager"}/> : null;
    const { banner, seat, card, raffle, bus, map, partner } = content.artwork;
    const bannerRatio = banner.width && banner.height ? banner.width / (banner.height * content.bannerHeightFraction) : 1730 / 752;
    const prices = shared?.prices;
    return <div className="tickets-page">
 <section className="tickets-top" aria-labelledby="tickets-title" style={{ backgroundImage: shared?.presentation.seatsBackground.url ? `url("${shared.presentation.seatsBackground.url}")` : "none" }}>
 <div className="tickets-intro" data-empty-banner={!banner.url || undefined}><div className="tickets-title"><h1 id="tickets-title">{content.title}</h1>{content.subtitle && <p>{content.subtitle}</p>}</div>{banner.url && <div className="ticket-banner" style={{ aspectRatio: bannerRatio } as CSSProperties}>{art(banner)}</div>}</div>
 {prices && <div className="tickets-price-wrap"><article className="tickets-prices"><h2>{prices.heading}</h2>{prices.rows.map(row => <div className="tickets-price-row" key={row.id}><h3>{row.label}{row.price && <> <span className={row.accent}>{row.price}</span></>}</h3><p>{row.description}</p>{row.note && <small>{row.note}</small>}</div>)}{prices.footnote && <p className="tickets-footnote"><i aria-hidden="true"/><em>{prices.footnote}</em></p>}</article></div>}
 </section>
 {isTicketSectionShown(content, "perksVisible") && (content.perkLabels.some(Boolean) || [seat, card, raffle].some(image => !!image.url)) && <section className="tickets-perks" aria-labelledby="perks-title"><h2 id="perks-title">{content.perksHeading}</h2><div>{[seat, card, raffle].map((image, index) => <figure key={["seat", "card", "raffle"][index]}><div className={`perk-image ${["seat-perk", "card-perk", "raffle-perk"][index]}`}>{art({ ...image, alt: "" })}</div><figcaption>{content.perkLabels[index]}</figcaption></figure>)}</div></section>}
 <section className="tickets-match-includes" aria-label="Next home match and ticket benefits">
 <article className="tickets-match"><h2>{shared?.match.heading || "Next home match"}</h2>
 {fixture ? <><p className="tickets-match-date">{cinematicMatchDate(fixture.date)}</p><div className="tickets-teams">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={club.name + " crest"}/>}<strong>{cinematicMatchTime(fixture.time)}</strong><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={96}/></div><p className="tickets-venue">{fixture.venue}<br />{[fixture.city, fixture.state].filter(Boolean).join(", ")}</p></> : <div className="match-pending">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={club.name + " crest"}/>}<p role="status">{match.loading ? "Loading next home match…" : shared?.match.emptyMessage || "The next home match will be announced soon."}</p></div>}
 {isTicketSectionShown(content, "purchaseVisible") && (content.purchaseUrl && isTicketPurchaseUrl(content.purchaseUrl) ? <a className="tickets-buy" href={content.purchaseUrl}>{shared?.match.buttonLabel || "Buy tickets"}</a> : <><button className="tickets-buy" disabled aria-describedby="purchase-note">{shared?.match.buttonLabel || "Buy tickets"}</button><p id="purchase-note" className="purchase-note">{content.missingPurchaseLabel}</p></>)}
 {art(partner, "tickets-chick")}
 </article>
 {isTicketSectionShown(content, "includesVisible") && <div className="tickets-includes"><h2>{content.includesHeading}</h2>{content.benefits.map((benefit, index) => <div key={index}><h3>{benefit.title}</h3><p>{benefit.detail}</p></div>)}{content.benefitsNote && <p className="tickets-footnote"><i aria-hidden="true"/><em>{content.benefitsNote}</em></p>}</div>}
 </section>
 {isTicketSectionShown(content, "transitVisible") && (content.transitHeading || bus.url || map.url) && <section className="tickets-transit" aria-labelledby="transit-title"><div className="tickets-transit-heading"><div><h2 id="transit-title">{content.transitHeading}</h2><p>{content.transitSubtitle}</p></div>{art(bus, undefined, true)}</div>{art(map, "tickets-map", true)}</section>}
 {isTicketSectionShown(content, "directionsVisible") && <section className="tickets-directions" aria-label="Getting to the stadium">{(content.directionsHeading || content.directionsBody) && <div><h3>{content.directionsHeading}</h3><p>{content.directionsBody}</p></div>}{(content.parkingHeading || content.parkingBody || content.parkingNote) && <div><h3>{content.parkingHeading}</h3><p>{content.parkingBody}</p>{content.parkingNote && <p className="parking-note"><em>{content.parkingNote}</em></p>}</div>}</section>}
 </div>;
}
