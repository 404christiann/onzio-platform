"use client";
import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import type { Fixture } from "@/lib/data";
import type { TicketPageView } from "@/lib/cinematic-ticket-pages-content";
import { fetchSchedule, fetchSiteSocialLinks } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { useCinematicContent } from "./CinematicContent";
import { nextHomeFixture } from "./next-home-fixture";
import { cinematicDisplaySocialLinks, cinematicSocialPlatform } from "./social-platform";
import { TicketArt, TicketButton, TicketPageHeading, TicketRichText, TicketTiles } from "./CinematicTicketPageParts";

/** `youtubeChannel` is the club's YouTube link from Branding: where the watch line goes when no game-day stream link is set. */
export type KnowBeforeYouGoMatch = { loading: boolean; fixture: Fixture | null; clubShortName: string; youtubeChannel?: string };

function matchDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).replace(",", "");
}

/** Sam's Know Before You Go page (2027 Final Master). The match box comes from Schedule's next home match. */
export function KnowBeforeYouGoView({ content, match, placeholders = false }: { content: TicketPageView<"know-before-you-go">; match: KnowBeforeYouGoMatch; placeholders?: boolean }) {
  const club = useClubContext(), { clubLogoUrl } = useClubBranding(), { content: shared } = useCinematicContent();
  const { facts, raffle, donor, images } = content, fixture = match.fixture;
  const competition = fixture?.competition?.trim() || content.match.competition;
  const youtube = images.youtube;
  const watchArt = youtube?.url || placeholders ? <TicketArt image={youtube} label="YouTube logo" className="tp-youtube" placeholders={placeholders} /> : youtube?.alt.trim() ? <b className="tp-youtube-text">{youtube.alt}</b> : null;
  const watchBody = <>{content.match.watchLabel}{watchArt && <> {watchArt}</>}</>;
  const watchHref = content.match.watchHref.trim() || match.youtubeChannel?.trim() || "";
  return <div className="tp-page tp-kbyg">
    <TicketPageHeading title={content.heading.title} subtitle={content.heading.subtitle} />
    {content.match.visible && <section className="tp-section tp-match" aria-label="Next home match">
      {competition && <p className="tp-competition">{competition}</p>}
      {fixture ? <>
        <p className="tp-date">{[matchDate(fixture.date), fixture.venue].filter(Boolean).join(" | ")}</p>
        <div className="tp-teams">
          <strong>{match.clubShortName || club.name}</strong>
          {clubLogoUrl && <NativeImage className="tp-crest" src={clubLogoUrl} alt={`${club.name} crest`} />}
          <span className="tp-versus" aria-label="versus">X</span>
          {fixture.opponentLogoUrl ? <NativeImage className="tp-crest" src={fixture.opponentLogoUrl} alt={`${fixture.opponent} crest`} />
            : <span className="tp-crest tp-monogram" aria-hidden="true">{fixture.opponent.trim().charAt(0).toUpperCase() || "?"}</span>}
          <strong>{fixture.opponentShortName?.trim() || fixture.opponent}</strong>
        </div>
      </> : <p className="tp-date" role="status">{match.loading ? "Loading next home match…" : shared?.match.emptyMessage || "The next home match will be announced soon."}</p>}
      {(content.match.watchLabel.trim() || watchArt) && (watchHref
        ? <a className="tp-watch" href={watchHref} target="_blank" rel="noopener noreferrer">{watchBody}</a>
        : <p className="tp-watch">{watchBody}</p>)}
    </section>}
    {facts.visible && facts.tiles.length > 0 && <section className="tp-band tp-facts" aria-label="Match day facts">
      <TicketTiles items={facts.tiles} images={images} className="tp-fact-tiles" placeholders={placeholders} />
    </section>}
    {raffle.visible && <section className="tp-band tp-raffle" aria-label={raffle.heading || "Halftime raffle"}>
      {raffle.heading.trim() && <h2>{raffle.heading}</h2>}
      {raffle.subheading.trim() && <p className="tp-raffle-sub">{raffle.subheading}</p>}
      <TicketArt image={images.raffle} label="Raffle prize photo" className="tp-raffle-photo" placeholders={placeholders} />
      {raffle.body.trim() && <><hr /><p className="tp-raffle-body"><TicketRichText text={raffle.body} /></p></>}
    </section>}
    {donor.visible && <section className="tp-band tp-donor" aria-label={donor.heading || "Raffle donor"}>
      {donor.heading.trim() && <h2>{donor.heading}</h2>}
      {images.donor?.url || placeholders ? <TicketArt image={images.donor} label="Donor logo" className="tp-donor-logo" placeholders={placeholders} />
        : donor.name.trim() && <p className="tp-donor-name">{donor.name}</p>}
      {donor.body.trim() && <p className="tp-donor-body">{donor.body}</p>}
      <TicketButton label={donor.buttonLabel} href={donor.buttonHref} />
    </section>}
  </div>;
}

export default function CinematicKnowBeforeYouGo({ content, placeholders = false }: { content: TicketPageView<"know-before-you-go">; placeholders?: boolean }) {
  const club = useClubContext();
  const [match, setMatch] = useState<KnowBeforeYouGoMatch & { clubId: string }>({ clubId: club.id, loading: true, fixture: null, clubShortName: "" });
  useEffect(() => {
    let active = true;
    setMatch({ clubId: club.id, loading: true, fixture: null, clubShortName: "" });
    // Social links are optional here: if they fail to load, the watch line just has no fallback link.
    const socials = fetchSiteSocialLinks(club.id).catch(() => []);
    Promise.all([fetchSchedule(undefined, club.id), fetchClubIdentity(club.id), socials])
      .then(([fixtures, identity, links]) => {
        const youtubeChannel = cinematicDisplaySocialLinks(links).find(link => cinematicSocialPlatform(link) === "youtube" && link.href.startsWith("https://"))?.href ?? "";
        if (active) setMatch({ clubId: club.id, loading: false, fixture: nextHomeFixture(fixtures, new Date(), identity?.timeZone || "UTC"), clubShortName: identity?.shortName ?? "", youtubeChannel });
      })
      .catch(() => { if (active) setMatch({ clubId: club.id, loading: false, fixture: null, clubShortName: "" }); });
    return () => { active = false; };
  }, [club.id]);
  const current = match.clubId === club.id ? match : { loading: true, fixture: null, clubShortName: "" };
  return <KnowBeforeYouGoView content={content} match={current} placeholders={placeholders} />;
}
