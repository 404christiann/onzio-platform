"use client";

import Image from "@/components/ResilientImage";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import type { DBSiteSocialLink, DBSiteSponsorLogo } from "@/lib/db-types";
import {
  fetchContactProfile,
  fetchSiteSocialLinks,
  fetchSiteSponsorLogos,
  type ContactProfileContent,
} from "@/lib/queries";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Schedule", href: "/schedule" },
  { label: "Club", href: "/club/about" },
  { label: "Shop", href: "/shop" },
];

const academyFooterLinks = [
  { label: "Club", href: "/club/about" },
  { label: "Programs", href: "/programs" },
  { label: "Roster", href: "/roster" },
  { label: "Schedule", href: "/schedule" },
  { label: "Sponsors", href: "/sponsors" },
  { label: "Contact", href: "/contact" },
  { label: "Tryouts", href: "/tryouts" },
];

export default function Footer() {
  const club = useClubContext();
  const clubId = club.id;
  const { clubLogoUrl, inverseLogoUrl, footerTagline } = useClubBranding();
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const [partners, setPartners] = useState<DBSiteSponsorLogo[]>([]);
  const [socialLinks, setSocialLinks] =
    useState<DBSiteSocialLink[]>([]);
  const [contactProfile, setContactProfile] =
    useState<ContactProfileContent | null>(null);
  const activeFooterLinks = isAcademy ? academyFooterLinks : footerLinks;

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

  useEffect(() => {
    if (!isAcademy) {
      setContactProfile(null);
      return;
    }
    fetchContactProfile(clubId)
      .then(setContactProfile)
      .catch((error) => {
        console.error("Footer contact profile:", error);
        setContactProfile(null);
      });
  }, [clubId, isAcademy]);

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

  if (isAcademy) {
    // Mockup-parity footer (DCFC-D132 pass): navy multi-column layout from
    // the sales mockup's Footer.tsx — crest + tagline, Explore link grid,
    // Connect column with email/phone and inverted social icons. No "Proud
    // Partners" strip here: the mockup's only sponsors band is the homepage
    // SponsorCarousel, so the generic footer's global strip would duplicate
    // it on every route.
    const phone = contactProfile?.publicPhone?.trim() ?? "";
    const phoneDigits = phone.replace(/\D/g, "");
    const email = contactProfile?.publicEmail?.trim() ?? "";
    return (
      <footer className="bg-[#1E3653] text-[#F9FAFD]">
        <div className="mx-auto grid max-w-7xl grid-cols-[.8fr_1.2fr] gap-x-8 gap-y-6 px-6 py-8 md:grid-cols-[1.1fr_.8fr_1fr] md:gap-8 lg:px-10">
          <div className="col-span-2 flex items-center gap-5 md:col-span-1">
            {clubLogoUrl && (
              <div className="relative h-20 w-20 flex-none">
                <Image
                  src={clubLogoUrl}
                  alt={`${club.name} crest`}
                  fill
                  priority
                  sizes="80px"
                  className="object-contain"
                  {...imageDeliveryProps("club-logo")}
                />
              </div>
            )}
            <div>
              <p className="font-display text-xl font-black uppercase italic">
                {club.name}
              </p>
              {/* The club's own slogan, not template chrome: it comes from
                  onzio.site_branding.footer_tagline (editable at
                  /admin/branding) and falls back to the approved academy@1
                  wording. whitespace-pre-line keeps the club's own line break,
                  which is what reproduces the two-line lockup. */}
              {footerTagline ? (
                <p className="mt-2 whitespace-pre-line font-body text-sm text-white/65">
                  {footerTagline}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-4 font-display text-xs font-bold uppercase text-white/45">
              Explore
            </p>
            <ul className="grid grid-cols-2 gap-x-5 gap-y-3">
              {academyFooterLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-body text-sm text-white/75 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 font-display text-xs font-bold uppercase text-white/45">
              Connect
            </p>
            {email && (
              <a
                className="block break-words font-body text-sm text-white/75 hover:text-white"
                href={`mailto:${email}`}
              >
                {email}
              </a>
            )}
            {phone && phoneDigits && (
              <a
                className="mt-2 block font-body text-sm text-white/75 hover:text-white"
                href={`tel:${phoneDigits}`}
              >
                {phone}
              </a>
            )}
            {socialLinks.length > 0 && (
              <div className="mt-4 flex gap-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="relative h-6 w-6 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <Image
                      src={social.icon}
                      alt=""
                      fill
                      sizes="24px"
                      className="object-contain brightness-0 invert"
                      {...imageDeliveryProps("small-graphic")}
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/10 px-6 py-3 font-body text-xs text-white/40 sm:flex-row sm:justify-between lg:px-10">
          <span>
            © {new Date().getFullYear()} {club.name}
          </span>
          <span>All rights reserved.</span>
        </div>
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
          {activeFooterLinks.map((link) => (
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
