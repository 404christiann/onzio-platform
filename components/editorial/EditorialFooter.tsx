import Link from "next/link";
import Image from "@/components/ResilientImage";
import PoweredByOnzio from "@/components/PoweredByOnzio";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { ClubIdentityContent } from "@/lib/editorial-identity";
import type { ContactProfileContent } from "@/lib/queries";
import type { DBSiteSocialLink } from "@/lib/db-types";

/**
 * Editorial public site footer, ported (visual design) from the approved
 * concept mockup via the superseded reference branch's EditorialFooter.tsx.
 *
 * The reference branch read contactEmail/contactPhone off club_identity;
 * that table no longer carries either column on this branch (Lions E1
 * deliberately keeps contact info in onzio.contact_profile), so those two
 * lines are rewired to fetchContactProfile's publicEmail/publicPhone
 * instead. venue/contactAddress still come from club_identity, unchanged.
 */
export default function EditorialFooter({
  clubName,
  crestOnDarkUrl,
  identity,
  contactProfile,
  socialLinks,
  storeEnabled,
}: {
  clubName: string;
  crestOnDarkUrl: string;
  identity: ClubIdentityContent | null;
  contactProfile: ContactProfileContent | null;
  socialLinks: DBSiteSocialLink[];
  storeEnabled: boolean;
}) {
  // A row with a blank href means the platform is intentionally hidden (see
  // lib/social-links.ts normalizeSiteSocialLinks) — treat it the same as
  // "not configured" rather than rendering a dead `<a href="">`.
  const instagram = socialLinks.find(
    (link) => link.id === "instagram" && link.href.trim() !== "",
  );
  const youtube = socialLinks.find(
    (link) => link.id === "youtube" && link.href.trim() !== "",
  );
  const footerTagline =
    [identity?.identityHeadingTop, identity?.identityHeadingEm]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || identity?.mission;
  const footerClubName = identity?.shortName?.trim() || clubName;

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <div className="footer-brand-lockup">
            {crestOnDarkUrl ? (
              <Image
                src={crestOnDarkUrl}
                alt={`${clubName} crest`}
                width={112}
                height={111}
                {...imageDeliveryProps("club-logo")}
              />
            ) : null}
            <div>
              <strong>{footerClubName}</strong>
              {footerTagline ? <p>{footerTagline}</p> : null}
            </div>
          </div>
        </div>

        <nav className="footer-links" aria-label="Footer navigation">
          <span className="footer-label">Explore</span>
          <div className="footer-link-grid">
            <div>
              <Link href="/club/about">Club</Link>
              <Link href="/roster">Roster</Link>
              <Link href="/tryouts">Tryouts</Link>
            </div>
            <div>
              <Link href="/schedule">Schedule</Link>
              {storeEnabled ? <Link href="/shop">Store</Link> : null}
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </nav>

        <div className="footer-connect">
          <span className="footer-label">Connect</span>
          {contactProfile?.publicEmail && (
            <a href={`mailto:${contactProfile.publicEmail}`}>
              {contactProfile.publicEmail}
            </a>
          )}
          {contactProfile?.publicPhone && (
            <a href={`tel:${contactProfile.publicPhone}`}>
              {contactProfile.publicPhone}
            </a>
          )}
          {identity?.venue && <p>{identity.venue}</p>}
          {(instagram || youtube) && (
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
          )}
        </div>
      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {footerClubName}
        </span>
        <PoweredByOnzio
          className="footer-powered-by"
          textClassName="footer-powered-by-text"
        />
        <span className="footer-bottom-right">All rights reserved.</span>
      </div>
    </footer>
  );
}
