"use client";

import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import PoweredByOnzio from "@/components/PoweredByOnzio";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import PathwayTrainingTrigger from "@/components/pathway/PathwayTrainingTrigger";
import { imageDeliveryProps } from "@/lib/image-delivery";

/**
 * Pathway public site footer (shell chrome, MLA P1 Step 4): Explore/Connect
 * link columns plus the legal line. The Explore/Connect sets below are
 * placeholder-reasonable chrome for Phase 1 — final footer link composition
 * happens when the section-components/route-pages steps wire up
 * pathway.footer — but the /privacy legal link is a hard requirement and
 * every href here is a registered pathway@1 route
 * (packages/presentation/index.ts routeRegistry).
 */

const exploreLinks = [
  { label: "Academy", href: "/academy" },
  { label: "Youth Club", href: "/youth-club" },
  { label: "Senior Club", href: "/senior-club" },
  { label: "UPSL", href: "/upsl" },
  { label: "Merch", href: "/merch" },
];

const connectLinks = [
  { label: "Book Training", href: "/book-training", action: "training-gateway" },
  { label: "Contact", href: "/contact" },
  { label: "About", href: "/about" },
] as const;

export default function PathwayFooter() {
  const club = useClubContext();
  const { clubLogoUrl, inverseLogoUrl } = useClubBranding();
  const footerLogoUrl = inverseLogoUrl || clubLogoUrl;
  const year = new Date().getFullYear();

  return (
    <footer className="pathway-footer">
      <div className="pathway-footer-grid">
        <Link
          className="pathway-footer-brand-lockup"
          href="/"
          aria-label={`${club.name} home`}
        >
          {footerLogoUrl && (
            <ResilientImage
              src={footerLogoUrl}
              alt=""
              width={72}
              height={72}
              {...imageDeliveryProps("club-logo")}
            />
          )}
          <span className="pathway-footer-brand">
            <strong>{club.name}</strong>
            <span>One pathway from first touch to senior football.</span>
          </span>
        </Link>
        <div>
          <span className="pathway-footer-label">Explore</span>
          <nav className="pathway-footer-links" aria-label="Explore">
            {exploreLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div>
          <span className="pathway-footer-label">Connect</span>
          <nav className="pathway-footer-links" aria-label="Connect">
            {connectLinks.map((link) => (
              "action" in link && link.action === "training-gateway" ? (
                <PathwayTrainingTrigger key={link.href} href={link.href}>
                  {link.label}
                </PathwayTrainingTrigger>
              ) : (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              )
            ))}
          </nav>
        </div>
      </div>
      <div className="pathway-footer-legal">
        <span>
          © {year} {club.name}. All rights reserved.
        </span>
        <PoweredByOnzio
          className="pathway-footer-powered-by"
          textClassName="pathway-footer-powered-by-text"
        />
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </footer>
  );
}
