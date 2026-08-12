import Link from "next/link";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { ClubIdentityContent } from "@/lib/club-identity";
import type { DBSiteSocialLink } from "@/lib/db-types";

/**
 * Editorial public site footer, ported from the approved concept mockup
 * (soccerplatformmockups src/components/layout/SiteFooter.tsx).
 *
 * Compact four-column desktop / two-column mobile layout: brand crest,
 * Explore links, Matchday contact details, and Follow social icons.
 * The crest-on-dark variant falls back to the full-color crest when a club
 * ships no dark crest. Starter never mounts sponsor content, so this
 * footer has no partners block at all.
 */
export default function EditorialFooter({
  clubName,
  crestOnDarkUrl,
  identity,
  socialLinks,
}: {
  clubName: string;
  crestOnDarkUrl: string;
  identity: ClubIdentityContent | null;
  socialLinks: DBSiteSocialLink[];
}) {
  const instagram = socialLinks.find((link) => link.id === "instagram");
  const youtube = socialLinks.find((link) => link.id === "youtube");

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          {crestOnDarkUrl ? (
            <Image
              src={crestOnDarkUrl}
              alt={`${clubName} crest`}
              width={80}
              height={79}
              {...imageDeliveryProps("club-logo")}
            />
          ) : null}
        </div>

        <div className="footer-links">
          <span className="footer-label">Explore</span>
          <Link href="/roster">Roster</Link>
          <Link href="/schedule">Schedule</Link>
          <Link href="/tryouts">Tryouts</Link>
        </div>

        <div className="footer-matchday">
          <span className="footer-label">Matchday</span>
          {identity?.venue && <p>{identity.venue}</p>}
          {identity?.contactAddress && <p>{identity.contactAddress}</p>}
          {identity?.contactEmail && (
            <a href={`mailto:${identity.contactEmail}`}>
              {identity.contactEmail}
            </a>
          )}
        </div>

        {(instagram || youtube) && (
          <div className="footer-social">
            <span className="footer-label">Follow</span>
            <div className="footer-social-links">
              {instagram && (
                <a
                  href={instagram.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${clubName} on Instagram`}
                  title="Instagram"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4.25" />
                    <circle
                      className="social-icon-fill"
                      cx="17.4"
                      cy="6.7"
                      r="1.15"
                    />
                  </svg>
                </a>
              )}
              {youtube && (
                <a
                  href={youtube.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${clubName} on YouTube`}
                  title="YouTube"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="2.5" y="5.25" width="19" height="13.5" rx="4" />
                    <path className="social-icon-fill" d="m10 9 5 3-5 3Z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {clubName}. All rights reserved.
        </span>
      </div>
    </footer>
  );
}
