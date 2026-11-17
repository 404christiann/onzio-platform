"use client";

import Image from "@/components/ResilientImage";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PoweredByOnzio from "@/components/PoweredByOnzio";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import {
  fetchContactProfile,
  fetchSiteSocialLinks,
  type ContactProfileContent,
} from "@/lib/queries";
import { DEFAULT_SITE_SOCIAL_LINKS } from "@/lib/social-links";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { academyFooterLinks } from "./navigation";

/**
 * Optional draft overrides used only by the /admin/branding "Footer preview"
 * panel, so it can show unsaved tagline/social-link edits in the real
 * Footer markup. When omitted (every real public-site usage), Footer's
 * behavior is unchanged: it fetches and renders live data exactly as
 * before.
 */
export type FooterOverrides = {
  tagline?: string;
  socialLinks?: Partial<Record<SiteSocialPlatform, string>>;
};

export default function Footer({ overrides }: { overrides?: FooterOverrides } = {}) {
  const club = useClubContext();
  const clubId = club.id;
  const { clubLogoUrl, footerTagline: liveFooterTagline } = useClubBranding();
  const footerTagline = overrides?.tagline ?? liveFooterTagline;
  const [socialLinks, setSocialLinks] =
    useState<DBSiteSocialLink[]>([]);
  const [contactProfile, setContactProfile] =
    useState<ContactProfileContent | null>(null);

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
    fetchSiteSocialLinks(clubId)
      .then(setSocialLinks)
      .catch((error) => {
        console.error("Footer social links:", error);
        setSocialLinks([]);
      });
  }, [clubId]);

  useEffect(() => {
    fetchContactProfile(clubId)
      .then(setContactProfile)
      .catch((error) => {
        console.error("Footer contact profile:", error);
        setContactProfile(null);
      });
  }, [clubId]);

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
          {displaySocialLinks.length > 0 && (
            <div className="mt-4 flex gap-4">
              {displaySocialLinks.map((social) => (
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
      <PoweredByOnzio
        className="px-6 pb-5 lg:px-10"
        textClassName="font-body text-xs text-white/40"
      />
    </footer>
  );
}
