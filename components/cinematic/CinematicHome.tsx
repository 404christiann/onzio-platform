"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import { useHomepagePiece, useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import type { DBHomepageHeroContent, DBSiteSponsorLogo } from "@/lib/db-types";
import type { Fixture } from "@/lib/data";
import { fetchHomepageContent, fetchSchedule, fetchShopKitContent, fetchSiteSponsorLogos, type HomepageContent, type ShopKitContent } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { EMPTY_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";
import { useCinematicContent } from "./CinematicContent";
import CinematicHero from "./CinematicHero";
import CinematicPhotos from "./CinematicPhotos";
import CinematicSponsors from "./CinematicSponsors";
import CinematicEpisode from "./CinematicEpisode";
import { cinematicMatchDate, cinematicMatchTime, latestResultFixture, nextHomeFixture } from "./next-home-fixture";
import { CinematicLatestResult, CinematicReplay } from "./CinematicMatchResult";
import type { CinematicHomeInitialData } from "./cinematic-home-data";

/**
 * With `initialData` (server-rendered public page) the body is complete on first paint and nothing is refetched.
 * Without it (admin editor preview, standalone previews) the body loads on the client as before.
 */
export default function CinematicHome({ initialHeroContent, initialData }: { initialHeroContent: DBHomepageHeroContent | null; initialData?: CinematicHomeInitialData }) {
  const club = useClubContext();
  const branding = useClubBranding();
  const preview = useHomepagePreview();
  const { content: revamp } = useCinematicContent();
  const editing = preview !== null;
  const served = initialData && !editing ? initialData : undefined;
  const [loaded, setLoaded] = useState<HomepageContent | null>(served?.homepage ?? null);
  const [fixture, setFixture] = useState<Fixture | null>(served?.fixture ?? null);
  const [latest, setLatest] = useState<Fixture | null>(served?.latest ?? null);
  const [clubLabel, setClubLabel] = useState(served?.clubLabel ?? "");
  const [scheduleLoading, setScheduleLoading] = useState(!served);
  const [shop, setShop] = useState<ShopKitContent | null>(served?.shop ?? null);
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>(served?.sponsors ?? []);
  const shopPiece = useHomepagePiece("shared.shop");
  const rafflePiece = useHomepagePiece("revamp.raffle");
  const ticketPiece = useHomepagePiece("revamp.ticket");
  const matchPiece = useHomepagePiece("revamp.match");
  const pricesPiece = useHomepagePiece("revamp.prices");
  const championsPiece = useHomepagePiece("revamp.championship");
  useEffect(() => {
    if (served) return;
    let active = true;
    setLoaded(null); setFixture(null); setLatest(null); setShop(null); setSponsors([]); setScheduleLoading(true);
    if (!editing) fetchHomepageContent(club.id).then(value => { if (active) setLoaded(value); }).catch(error => console.error("Cinematic home:", error));
    Promise.all([fetchSchedule(undefined, club.id), fetchClubIdentity(club.id)]).then(([fixtures, identity]) => { if (active) { setFixture(nextHomeFixture(fixtures, new Date(), identity?.timeZone || "UTC")); setLatest(latestResultFixture(fixtures)); setClubLabel(identity?.initials || ""); } }).catch(error => console.error("Cinematic next home match:", error)).finally(() => { if (active) setScheduleLoading(false); });
    fetchShopKitContent("home", "home", club.id).then(value => { if (active) setShop(value); }).catch(error => console.error("Cinematic shop:", error));
    fetchSiteSponsorLogos("carousel", club.id).then(value => { if (active) setSponsors(value); }).catch(error => console.error("Cinematic sponsors:", error));
    return () => { active = false; };
  }, [club.id, editing, served]);
  const hero = preview?.draft.hero ?? loaded?.hero ?? initialHeroContent ?? EMPTY_HOMEPAGE_HERO_CONTENT;
  const photos = preview ? preview.draft.photos.items.filter(photo => photo.upload === "ready" && photo.url).map(photo => ({ id: photo.clientId, url: photo.url!, alt: photo.alt })) : loaded?.slideshowPhotos ?? [];
  const behind = loaded?.behindTheRose;
  const video = preview ? { id: 1, updated_at: "", ...preview.draft.video, video_url: preview.videoSource } : behind;
  const kit = shop?.section;
  const player = shop?.photos[0];
  const art = (asset: { url: string | null; alt: string }, className: string) => asset.url ? <section className={`artwork ${className}`} aria-label={asset.alt}><NativeImage src={asset.url} alt={asset.alt} loading="lazy" /></section> : null;
  return <>
    <CinematicHero content={hero} />
    {revamp && <>
      <div {...rafflePiece}>{art(revamp.raffle, "raffle")}</div>
      <section className="ticket-cards" aria-label="Next home match and ticket prices" style={{ "--cinematic-seats-background": revamp.presentation.seatsBackground.url ? `url("${revamp.presentation.seatsBackground.url}")` : "none" } as CSSProperties}>
        <article {...matchPiece} className="match-card"><h2>{revamp.match.heading}</h2>
          {fixture ? <><p className="match-date">{cinematicMatchDate(fixture.date)}</p><hr /><div className="teams">{branding.clubLogoUrl && <NativeImage src={branding.clubLogoUrl} alt={`${club.name} crest`} />}<strong>{cinematicMatchTime(fixture.time)}</strong><div><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={96} /></div></div><p className="venue">{fixture.venue}<br />{[fixture.city, fixture.state].filter(Boolean).join(", ")}</p></> : <p className="venue" role="status">{scheduleLoading ? "Loading next home match…" : revamp.match.emptyMessage}</p>}
          <Link className="button ticket-buy" href={revamp.match.buttonHref || "/tickets"}>{revamp.match.buttonLabel}</Link>
          {fixture?.sponsorLogoUrl && <NativeImage className="match-partner" src={fixture.sponsorLogoUrl} alt={fixture.sponsorName || "Match sponsor"} loading="lazy" />}
        </article>
        <article {...pricesPiece} className="prices-card"><h2>{revamp.prices.heading}</h2>{revamp.prices.rows.map(row => <div key={row.id} className="price-item"><h3>{row.label}{row.price && <> <span className={row.accent === "none" ? undefined : row.accent}>{row.price}</span></>}</h3><p>{row.description}</p>{row.note && <small>{row.note}</small>}</div>)}{revamp.prices.footnote && <p className="tennis-note"><i /><em>{revamp.prices.footnote}</em></p>}</article>
      </section>
      {(revamp.ticket.visible || ticketPiece["data-homepage-piece"]) && <div {...ticketPiece}>{revamp.ticket.visible && art(revamp.ticket, "ticket-art")}</div>}
    </>}
    <CinematicPhotos photos={photos} />
    {latest && <><CinematicLatestResult fixture={latest} clubLabel={clubLabel || club.name} crestUrl={branding.clubLogoUrl} /><CinematicReplay fixture={latest} clubLabel={clubLabel || club.name} crestUrl={branding.clubLogoUrl} /></>}
    {revamp && (revamp.championship.title || revamp.championship.trophy.url || championsPiece["data-homepage-piece"]) && <section {...championsPiece} className="champions"><div className="champion-copy"><p className="eyebrow">{revamp.championship.league}</p><h2>{revamp.championship.year}<br />{revamp.championship.title}</h2><div className="red-rule" /><p className="body-copy">{revamp.championship.body}</p></div>{revamp.championship.trophy.url && <NativeImage src={revamp.championship.trophy.url} alt={revamp.championship.trophy.alt} width={1500} height={1200} loading="lazy" />}</section>}
    {club.storeEnabled && kit && player && <section {...shopPiece} className="jersey"><div className="player-image"><NativeImage src={player.url} alt={kit.title} loading="lazy" /></div><div className="jersey-copy"><p className="eyebrow">{kit.eyebrow}</p><h2>{kit.title}</h2><div className="red-rule" /><p className="body-copy">{kit.description}</p>{kit.bullet_points.some(Boolean) && <><p className="includes-label">Includes</p><ul>{kit.bullet_points.filter(Boolean).map((bullet, index) => <li key={index}>{bullet}</li>)}</ul></>}{kit.store_note && <p className="store-note">{kit.store_note}</p>}<Link className="button" href={kit.cta_link || "/shop"}>{kit.cta_label}</Link></div></section>}
    {video && <CinematicEpisode content={video} posterUrl={revamp?.presentation.episodePoster.url} crestUrl={branding.clubLogoUrl} />}
    <CinematicSponsors sponsors={sponsors} treatments={revamp?.presentation.sponsorTreatments ?? {}} heading={revamp?.sponsors.heading ?? ""} />
  </>;
}
