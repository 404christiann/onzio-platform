"use client";

import Image from "@/components/ResilientImage";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PoweredByOnzio from "@/components/PoweredByOnzio";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import type { DBSiteSocialLink, DBSiteSponsorLogo, SiteSocialPlatform } from "@/lib/db-types";
import { fetchSiteSocialLinks, fetchSiteSponsorLogos } from "@/lib/queries";
import { DEFAULT_SITE_SOCIAL_LINKS } from "@/lib/social-links";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";
import AcademyFooter, { type FooterOverrides } from "@/components/sites/diverse-city/Footer";
import { codeSiteFor } from "@/lib/code-site";

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Schedule", href: "/schedule" },
  { label: "Club", href: "/club/about" },
  { label: "Shop", href: "/shop" },
];

/** The Academy footer lives in its site module; every other template renders here. */
export default function Footer({ overrides }: { overrides?: FooterOverrides } = {}) {
  const club = useClubContext();
  if (codeSiteFor(club) === "diverse-city") return <AcademyFooter overrides={overrides} />;
  return <TemplateFooter overrides={overrides} />;
}

function TemplateFooter({ overrides }: { overrides?: FooterOverrides }) {
  const club = useClubContext();
  const clubId = club.id;
  const { clubLogoUrl, inverseLogoUrl } = useClubBranding();
  const [partners, setPartners] = useState<DBSiteSponsorLogo[]>([]);
  const [socialLinks, setSocialLinks] =
    useState<DBSiteSocialLink[]>([]);

  // When `overrides.socialLinks` is provided, layer the draft href values
  // over the live-fetched rows (falling back to DEFAULT_SITE_SOCIAL_LINKS'
  // icon/label for a platform that has never been saved yet), so the admin
  // preview reflects unsaved edits. Without overrides this is exactly
  // `socialLinks`, unchanged.
  const displaySocialLinks = useMemo(() => {
    const socialOverrides = overrides?.socialLinks;
    // A blank href means "this platform is intentionally hidden" (an admin
    // cleared the field on /admin/branding, or the platform was never
    // configured for this club) — never render an <a>/icon for it. Without
    // this guard a saved-but-empty href would render a bare `<a href="">`
    // instead of actually hiding the icon as promised in the admin copy.
    if (!socialOverrides) {
      return socialLinks.filter((link) => link.href.trim() !== "");
    }

    const liveById = new Map(socialLinks.map((link) => [link.id, link]));
    const defaultById = new Map(
      DEFAULT_SITE_SOCIAL_LINKS.map((link) => [link.id, link]),
    );
    const ids = new Set<SiteSocialPlatform>([
      ...socialLinks.map((link) => link.id),
      ...(Object.keys(socialOverrides) as SiteSocialPlatform[]),
    ]);

    return Array.from(ids)
      .map((id) => {
        const base = liveById.get(id) ?? defaultById.get(id);
        if (!base) return null;
        const overrideHref = socialOverrides[id];
        return overrideHref === undefined ? base : { ...base, href: overrideHref };
      })
      .filter(
        (link): link is DBSiteSocialLink =>
          link !== null && link.href.trim() !== "",
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [overrides?.socialLinks, socialLinks]);

  useEffect(() => {
    fetchSiteSponsorLogos("footer", clubId)
      .then(setPartners)
      .catch((error) => {
        console.error("Footer sponsors:", error);
        setPartners([]);
      });
    fetchSiteSocialLinks(clubId)
      .then(setSocialLinks)
      .catch((error) => {
        console.error("Footer social links:", error);
        setSocialLinks([]);
      });
  }, [clubId]);

  if (club.presentationTemplateKey === "clubhouse@1") {
    const visiblePartners = partners.length > 0
      ? partners
      : [
          { id: "local-1", name: "Highbank Credit Union" },
          { id: "local-2", name: "Short North Roasters" },
          { id: "local-3", name: "Olentangy Physical Therapy" },
        ];

    return (
      <footer className="clubhouse-site-footer">
        <div className="clubhouse-footer-partners">
          <span className="clubhouse-eyebrow">Proud partners</span>
          <div>
            {visiblePartners.map((partner) => (
              <span key={partner.id}>{partner.name}</span>
            ))}
          </div>
        </div>
        <div className="clubhouse-footer-bottom">
          <Link href="/" className="clubhouse-footer-brand" aria-label={`${club.name} Home`}>
            {(inverseLogoUrl || clubLogoUrl) && (
              <Image
                src={inverseLogoUrl || clubLogoUrl}
                alt={club.name}
                width={46}
                height={46}
                {...imageDeliveryProps("club-logo")}
              />
            )}
            <span>{club.name}</span>
          </Link>
          <ul>
            {footerLinks
              .filter((link) => link.label !== "Club")
              .map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
          </ul>
          <div className="clubhouse-footer-socials">
            {displaySocialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
        <p className="clubhouse-footer-copy">
          © {new Date().getFullYear()} {club.name}. All rights reserved.
        </p>
        <PoweredByOnzio
          className="pb-6"
          textClassName="text-[0.72rem] text-white/45"
        />
      </footer>
    );
  }

  return (
    <footer
      className="border-t border-gray-200"
      style={{ backgroundColor: "var(--color-black)" }}
    >
      {/* Partner Strip */}
      <div className="border-b border-white/10 py-8 px-6 lg:px-10 overflow-hidden">
        <p
          className="font-display text-xs tracking-widest uppercase text-center mb-6"
          style={{ color: "var(--color-gray-mid)" }}
        >
          Proud Partners
        </p>
        <div className="flex items-center justify-center flex-wrap gap-8 md:gap-12">
          {partners.map((partner) => (
            <div key={partner.id} className="relative h-12 w-32 opacity-100 md:h-14 md:w-36">
              <Image
                src={partner.logo_url}
                alt={partner.name}
                fill
                className="object-contain"
                {...imageDeliveryProps("sponsor-logo")}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo + Tagline */}
        <div className="flex flex-col items-center md:items-start gap-2">
          {clubLogoUrl && (
            <div className="relative w-10 h-10">
              <Image
                src={clubLogoUrl}
                alt={club.name}
                fill
                className="object-contain"
                {...imageDeliveryProps("club-logo")}
              />
            </div>
          )}
          <p
            className="font-display text-base font-bold italic tracking-widest uppercase"
            style={{ color: "var(--color-white)" }}
          >
            {club.name}
          </p>
        </div>

        {/* Nav Links */}
        <ul className="flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {footerLinks.map((link) => (
            <li key={link.href}>
              {link.href.startsWith("mailto:") ? (
                <a
                  href={link.href}
                  className="font-display text-xs tracking-widest uppercase transition-colors duration-200 text-[#9A9A9A] hover:text-white"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="font-display text-xs tracking-widest uppercase transition-colors duration-200 text-[#9A9A9A] hover:text-white"
                >
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>

        {/* Social Icons */}
        <div className="flex items-center gap-4">
          {displaySocialLinks.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              className="group relative w-6 h-6 opacity-50 hover:opacity-100 transition-opacity duration-200"
            >
              <Image
                src={social.icon}
                alt={social.label}
                fill
                className="object-contain filter brightness-0 invert"
                {...imageDeliveryProps("small-graphic")}
              />
            </a>
          ))}
        </div>
      </div>

      {/* Copyright */}
      <div
        className="text-center pb-6 px-6"
        style={{ color: "var(--color-gray-mid)" }}
      >
        <p className="font-body text-xs">
          © {new Date().getFullYear()} {club.name}. All rights reserved.
        </p>
      </div>

      <PoweredByOnzio
        className="px-6 pb-6"
        textClassName="font-body text-xs"
        textStyle={{ color: "var(--color-gray-mid)" }}
      />
    </footer>
  );
}
