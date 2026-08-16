import { PathwaySection } from "@/components/pathway/PathwaySection";

/**
 * pathway.mission — Home's closing mission statement (MLA P1, Home sections
 * pass).
 *
 * The source material is a square social-media graphic: the club crest and a
 * mission quote set over a photo with a gradient wash and a "follow us" icon
 * row. That is a different medium — baked-in text over a filtered photo is
 * how a feed post shouts for attention, not how a website closes a page —
 * so this section keeps the graphic's *content* (the quote, the
 * this-is-just-the-beginning sentiment, the social links) and re-sets it in
 * the template's own language: a centered typographic pull-quote on the
 * calm paper ground, with the social row as quiet circular icon actions
 * underneath. Deliberately text-forward and photo-free: the same photograph
 * the graphic uses already anchors the Home leader band, and repeating it
 * two sections later would dilute both.
 *
 * Icons are inline SVGs following the editorial template's footer
 * convention (stroke shapes on currentColor, aria-hidden, with the link
 * itself labelled) — no icon dependency for three marks.
 */

export type PathwaySocialNetwork = "instagram" | "facebook" | "x";

export type PathwaySocialLink = {
  network: PathwaySocialNetwork;
  label: string;
  href: string;
};

export type PathwayMissionProps = {
  eyebrow?: string;
  quote: string;
  attribution?: string;
  socialLabel?: string;
  socialLinks?: PathwaySocialLink[];
};

function SocialIcon({ network }: { network: PathwaySocialNetwork }) {
  switch (network) {
    case "instagram":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.25" />
          <circle className="pathway-social-icon-fill" cx="17.4" cy="6.7" r="1.15" />
        </svg>
      );
    case "facebook":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M14.75 4.5h-1.9a3.1 3.1 0 0 0-3.1 3.1v2.65H7.5v3h2.25v6.25h3v-6.25h2.4l.45-3h-2.85V7.85a.85.85 0 0 1 .85-.85h2.15Z" />
        </svg>
      );
    case "x":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m4.5 4.5 6.05 7.9-6.2 7.1h2.3l4.95-5.67 4.35 5.67h5.55l-6.35-8.3 5.9-6.7h-2.3l-4.65 5.32L10.05 4.5Z" />
        </svg>
      );
  }
}

export default function PathwayMission({
  eyebrow,
  quote,
  attribution,
  socialLabel,
  socialLinks,
}: PathwayMissionProps) {
  return (
    <PathwaySection className="pathway-mission-section">
      <div className="pathway-mission">
        {eyebrow && <span className="pathway-eyebrow">{eyebrow}</span>}
        <blockquote className="pathway-mission-quote">
          <p>{quote}</p>
        </blockquote>
        {attribution && (
          <p className="pathway-mission-attribution">{attribution}</p>
        )}
        {socialLinks && socialLinks.length > 0 && (
          <div className="pathway-mission-social">
            {socialLabel && (
              <span className="pathway-mission-social-label">{socialLabel}</span>
            )}
            <ul className="pathway-social-row">
              {socialLinks.map((link) => (
                <li key={link.network}>
                  <a
                    className="pathway-social-link"
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    title={link.label}
                  >
                    <SocialIcon network={link.network} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PathwaySection>
  );
}
