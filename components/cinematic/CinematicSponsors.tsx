"use client";

import { useId, useRef } from "react";
import { useHomepagePiece } from "@/lib/homepage-editor/preview-context";
import NativeImage from "@/components/ResilientNativeImage";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { useCinematicMotion } from "./useCinematicMotion";
import { isSponsorUuid } from "@/components/telemetry/logo-seen";
import { useSponsorLogoSeen } from "@/components/telemetry/useSponsorLogoSeen";

type Treatment = "invert" | "dark-lettering";
export default function CinematicSponsors({ sponsors, treatments, heading }: { sponsors: DBSiteSponsorLogo[]; treatments: Record<string, Treatment>; heading: string }) {
  const { playing, reduced } = useCinematicMotion();
  const piece = useHomepagePiece("revamp.sponsors");
  const filterId = `dark-lettering-${useId().replaceAll(":", "")}`;
  const trackRef = useRef<HTMLDivElement>(null);
  useSponsorLogoSeen(trackRef, sponsors.map(sponsor => sponsor.id).join(","));
  if (!sponsors.length && !piece["data-homepage-piece"]) return null;
  // TELEMETRY-03: only database sponsors (uuid ids) are counted and linked; the built-in fallback logos stay plain images.
  const set = (clone: boolean) => <div className="sponsor-set" aria-hidden={clone || undefined}>{sponsors.map(sponsor => {
    const counted = isSponsorUuid(sponsor.id), linked = counted && !!sponsor.website_url, id = counted ? sponsor.id : undefined;
    const image = <NativeImage key={sponsor.id} src={sponsor.logo_url} alt={clone ? "" : sponsor.name} loading="lazy" data-sponsor-id={linked ? undefined : id} style={{ filter: treatments[sponsor.id] === "invert" ? "invert(1)" : treatments[sponsor.id] === "dark-lettering" ? `url(#${filterId})` : undefined }} />;
    return linked ? <a key={sponsor.id} href={`/r/${sponsor.id}`} target="_blank" rel="sponsored noopener" className="sponsor-link" tabIndex={clone ? -1 : undefined} data-sponsor-id={id} style={{ display: "flex", flexShrink: 0, textDecoration: "none" }}>{image}</a> : image;
  })}</div>;
  return <section className="partners"><h2 {...piece}>{heading}</h2>
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="sponsor-filter-definitions"><defs><filter id={filterId} colorInterpolationFilters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.333333 3.333333 3.333333 0 -9" result="threshold" /><feComponentTransfer in="threshold" result="white-mask"><feFuncA type="discrete" tableValues="0 1" /></feComponentTransfer><feComposite in="SourceGraphic" in2="white-mask" operator="out" result="colored-art" /><feFlood floodColor="#141414" result="dark" /><feComposite in="dark" in2="white-mask" operator="in" result="dark-mask" /><feComposite in="dark-mask" in2="SourceGraphic" operator="in" result="dark-letters" /><feMerge><feMergeNode in="colored-art" /><feMergeNode in="dark-letters" /></feMerge></filter></defs></svg>
    <div className="partner-row existing-sponsors" tabIndex={0} role="region" aria-label="Club sponsors"><div ref={trackRef} className={`sponsor-track${!playing ? " visibility-paused" : ""}`} style={{ animationDuration: `${Math.max(38, sponsors.length * 6.33)}s`, ...(reduced ? { animation: "none", transform: "none" } : {}) }}>{set(false)}{set(true)}</div></div>
  </section>;
}
