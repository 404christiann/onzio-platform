import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import type { DBAboutPageContent, DBSiteSponsorLogo } from "@/lib/db-types";

export default function ClubhouseAboutPage({
  content,
  sponsors,
}: {
  content: DBAboutPageContent;
  sponsors: DBSiteSponsorLogo[];
}) {
  const storyMark = content.values[0]?.title.match(/\b(20\d{2})\b/)?.[1]?.slice(-2) ?? "14";
  const paragraphs = content.story_paragraphs.filter(Boolean);
  const mission = content.closing_text || "Roar as one for Columbus.";

  return (
    <div className="clubhouse-route-page clubhouse-about-page">
      <header className="clubhouse-route-hero clubhouse-about-hero">
        <div>
          <p className="clubhouse-eyebrow">Our club</p>
          <h1>
            From Columbus.
            <br />
            <em>For the Capital City.</em>
          </h1>
        </div>
      </header>

      <section className="clubhouse-about-manifesto">
        <span className="clubhouse-about-story-mark">{storyMark}</span>
        <div className="clubhouse-about-story">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <blockquote>{mission}</blockquote>
      </section>

      <section className="clubhouse-about-proof">
        <div className="clubhouse-about-proof-copy">
          <p className="clubhouse-eyebrow">{content.values_heading}</p>
          <h2>{content.hero_title}</h2>
          <div>
            {content.values.map((value) => (
              <article key={value.title}>
                <span>{value.title}</span>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </div>
        {content.feature_image_url && (
          <div className="clubhouse-about-feature-image">
            <ResilientImage
              src={content.feature_image_url}
              alt="Lions Football Club matchday"
              fill
              fallbackVariant="photo"
              sizes="(max-width: 900px) 100vw, 46vw"
              className="object-cover"
            />
          </div>
        )}
      </section>

      <section className="clubhouse-about-partners">
        <p className="clubhouse-eyebrow">Proud partners</p>
        <div>
          {sponsors.map((sponsor) => (
            <span key={sponsor.id}>{sponsor.name}</span>
          ))}
        </div>
      </section>

      <section className="clubhouse-about-cta">
        <p>{content.closing_text}</p>
        {content.closing_cta_label && content.closing_cta_href && (
          <Link href={content.closing_cta_href}>{content.closing_cta_label}</Link>
        )}
      </section>
    </div>
  );
}
