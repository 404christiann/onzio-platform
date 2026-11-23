"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { usePublicPageVisibility } from "@/components/PublicPageVisibilityProvider";
import NativeImage from "@/components/ResilientNativeImage";
import type { DBSiteSocialLink } from "@/lib/db-types";
import { fetchSiteSocialLinks } from "@/lib/queries";
import { withoutHiddenPageLinks } from "@/lib/public-page-visibility";
import type { FooterOverrides } from "@/components/Footer";
import { useCinematicContent } from "./CinematicContent";
import CinematicSocialLink from "./CinematicSocialLink";
import { cinematicDisplaySocialLinks } from "./social-platform";


const LINKS = [
  { id: "home", label: "HOME", href: "/" }, { id: "club", label: "CLUB", href: "/club/about" },
  { id: "shop", label: "SHOP", href: "/shop" }, { id: "stadium-group", label: "STADIUM", href: "/stadium" },
  { id: "tickets", label: "TICKETS", href: "/tickets" }, { id: "schedule", label: "SCHEDULE", href: "/schedule" },
  { id: "tryouts", label: "TRYOUT", href: "/tryouts" }, { id: "contact", label: "CONTACT", href: "/contact" },
];


export default function CinematicFooter({ overrides }: { overrides?: FooterOverrides } = {}) {
  const club = useClubContext();
  const visibility = usePublicPageVisibility();
  const { clubLogoUrl, footerTagline } = useClubBranding();
  const { content } = useCinematicContent();
  const [socials, setSocials] = useState<DBSiteSocialLink[]>([]);
  useEffect(() => {
    let active = true;
    fetchSiteSocialLinks(club.id).then(value => { if (active) setSocials(value); }).catch(error => console.error("Cinematic footer socials:", error));
    return () => { active = false; };
  }, [club.id]);
  const links = cinematicDisplaySocialLinks(socials, overrides?.socialLinks);
  const footerLogo = content?.footerLogo;
  return <footer className="club-footer">
    <div className="footer-row">{footerLogo?.url
      // An owner-uploaded footer logo (e.g. a sub-mark) replaces the crest, name and tagline.
      ? <Link className="footer-brand footer-logo" href="/"><NativeImage src={footerLogo.url} alt={footerLogo.alt || club.name} /></Link>
      : <Link className="footer-brand" href="/">{clubLogoUrl && <NativeImage src={clubLogoUrl} alt={`${club.name} crest`} />}<span><strong>{club.name}</strong>{(overrides?.tagline ?? footerTagline) && <small>{overrides?.tagline ?? footerTagline}</small>}</span></Link>}
      <nav aria-label="Footer navigation">{withoutHiddenPageLinks(LINKS.filter(item => item.id !== "shop" || club.storeEnabled), { publicPageVisibility: visibility }).map(item => <Link key={item.id} href={item.href}>{content?.navigation.labels[item.id] || item.label}</Link>)}</nav>
      <div className="socials">{links.map(social => <CinematicSocialLink key={social.id} social={social} />)}</div>
    </div>
    <p>© {new Date().getFullYear()} {club.name}. All rights reserved.</p>
    <div className="powered-by"><a href="https://onziofutbol.com/" aria-label="Powered by Onzio"><span>Powered by</span><NativeImage src="/images/onzio/onzio-wordmark-white.png" alt="Onzio" width={100} height={100} /></a></div>
  </footer>;
}
