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
}: {
  clubName: string;
  crestOnDarkUrl: string;
  identity: ClubIdentityContent | null;
  contactProfile: ContactProfileContent | null;
  socialLinks: DBSiteSocialLink[];
}) {
  const instagram = socialLinks.find((link) => link.id === "instagram");
  const youtube = socialLinks.find((link) => link.id === "youtube");

  return (
    <footer className="site-footer bg-ed-ink px-5 py-16 text-ed-on-dark md:px-8">
      <div className="footer-main mx-auto grid max-w-[1180px] gap-10 border-t border-white/15 pt-10 md:grid-cols-[1.1fr_0.8fr_1fr_0.8fr]">
        <div className="footer-brand">
          {crestOnDarkUrl ? (
            <Image
              className="size-20 object-contain"
              src={crestOnDarkUrl}
              alt={`${clubName} crest`}
              width={80}
              height={79}
              {...imageDeliveryProps("club-logo")}
            />
          ) : null}
        </div>

        <div className="footer-links grid content-start gap-3">
          <span className="footer-label font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">Explore</span>
          <Link href="/roster">Roster</Link>
          <Link href="/schedule">Schedule</Link>
          <Link href="/tryouts">Tryouts</Link>
        </div>

        <div className="footer-matchday grid content-start gap-3">
          <span className="footer-label font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">Matchday</span>
          {identity?.venue && <p>{identity.venue}</p>}
          {identity?.contactAddress && <p>{identity.contactAddress}</p>}
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
        </div>

        {(instagram || youtube) && (
          <div className="footer-social grid content-start gap-3">
            <span className="footer-label font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">Follow</span>
            <div className="footer-social-links flex gap-2">
              {instagram && (
                <a
                  href={instagram.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${clubName} on Instagram`}
                  title="Instagram"
                >
                  <svg className="size-6 fill-none stroke-current stroke-2 [&_.social-icon-fill]:fill-current [&_.social-icon-fill]:stroke-0" aria-hidden="true" viewBox="0 0 24 24">
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
                  <svg className="size-6 fill-none stroke-current stroke-2 [&_.social-icon-fill]:fill-current [&_.social-icon-fill]:stroke-0" aria-hidden="true" viewBox="0 0 24 24">
                    <rect x="2.5" y="5.25" width="19" height="13.5" rx="4" />
                    <path className="social-icon-fill" d="m10 9 5 3-5 3Z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="footer-bottom mx-auto mt-10 max-w-[1180px] border-t border-white/15 pt-6 text-sm text-ed-on-dark-nav">
        <span>
          © {new Date().getFullYear()} {clubName}. All rights reserved.
        </span>
      </div>
      <PoweredByOnzio
        className="footer-powered-by"
        textClassName="footer-powered-by-text"
      />
    </footer>
  );
}
