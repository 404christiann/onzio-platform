"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DBHomepageHeroContent } from "@/lib/db-types";
import type { HeroFields } from "@/lib/homepage-editor/model";
import { useClubContext } from "@/components/ClubContextProvider";
import NativeImage from "@/components/ResilientNativeImage";
import { useHomepagePiece } from "@/lib/homepage-editor/preview-context";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";
import { useCinematicMotion } from "./useCinematicMotion";
import { useCinematicContent } from "./CinematicContent";
import { SITE_PAGE_LINK, renderableLink } from "@/lib/link-destination";

export default function CinematicHero({ content }: { content: DBHomepageHeroContent | HeroFields }) {
  const club = useClubContext();
  const { content: revamp } = useCinematicContent();
  const headingPiece = useHomepagePiece("hero.heading");
  const eyebrowPiece = useHomepagePiece("hero.eyebrow");
  const introPiece = useHomepagePiece("hero.intro");
  const ctaPiece = useHomepagePiece("hero.cta");
  const { playing } = useCinematicMotion();
  const video = useRef<HTMLVideoElement>(null);
  const source = revamp?.presentation;
  const [failedGuid, setFailedGuid] = useState<string | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!playing) { element.pause(); return; }
    element.muted = true;
    void element.play().catch(() => { /* poster remains visible if autoplay is denied */ });
  }, [playing, source?.heroVideoGuid]);
  const visibleCopy = content.eyebrow || content.headline_line_one || content.headline_line_two || content.intro;
  return <section className="hero" aria-label={club.name}>
    {source?.heroPoster.url && <NativeImage className="hero-poster" src={source.heroPoster.url} alt={source.heroPoster.alt} />}
    {source?.heroVideoGuid && failedGuid !== source.heroVideoGuid && <video key={source.heroVideoGuid} ref={video} onError={() => setFailedGuid(source.heroVideoGuid)} src={bunnyVideoMp4Url(source.heroVideoGuid)} poster={source.heroPoster.url ?? undefined} muted playsInline loop autoPlay={playing} preload="metadata" aria-label={source.heroPoster.alt || `${club.name} film`} style={{ display: playing ? "block" : "none" }} />}
    <div className="hero-shade" />
    {visibleCopy ? <div className="hero-copy">{(content.eyebrow || eyebrowPiece["data-homepage-piece"]) && <p {...eyebrowPiece} className="eyebrow">{content.eyebrow}</p>}<h1 {...headingPiece}>{content.headline_line_one || club.name}{content.headline_line_two && <><br />{content.headline_line_two}</>}</h1>{(content.intro || introPiece["data-homepage-piece"]) && <p {...introPiece}>{content.intro}</p>}</div> : <h1 {...headingPiece} className="sr-only">{club.name}</h1>}
    <div {...ctaPiece} className="hero-actions">{club.storeEnabled && <Link className="button" href={renderableLink(content.primary_cta_href, SITE_PAGE_LINK) || "/shop"}>{content.primary_cta_label || "SHOP"}</Link>}<Link className="button outline" href={content.secondary_cta_href || "/roster"}>{content.secondary_cta_label || "MEET THE SQUAD"}</Link></div>
  </section>;
}
