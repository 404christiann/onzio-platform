"use client";

import Image from "@/components/ResilientImage";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import type { DBSiteSocialLink, DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSocialLinks, fetchSiteSponsorLogos } from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Schedule", href: "/schedule" },
  { label: "Club", href: "/club/about" },
  { label: "Shop", href: "/shop" },
];

export default function Footer() {
  const club = useClubContext();
  const clubId = club.id;
  const { clubLogoUrl, inverseLogoUrl } = useClubBranding();
  const [partners, setPartners] = useState<DBSiteSponsorLogo[]>([]);
  const [socialLinks, setSocialLinks] =
    useState<DBSiteSocialLink[]>([]);

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
            {socialLinks.map((social) => (
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
          {socialLinks.map((social) => (
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
    </footer>
  );
}
