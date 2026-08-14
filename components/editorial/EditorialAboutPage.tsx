"use client";

import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientImage from "@/components/ResilientImage";
import type { DBAboutPageContent } from "@/lib/db-types";

/** Editorial club-story page, using the shared About-page content contract. */
export default function EditorialAboutPage({
  content,
}: {
  content: DBAboutPageContent;
}) {
  const club = useClubContext();

  return (
    <div className="interior club-page">
      <header className="interior-hero">
        <h1>{content.hero_title}</h1>
        <span className="head-rule" aria-hidden="true" />
      </header>

      <section
        className={`manifesto${content.feature_image_url ? "" : " manifesto-single"}`}
      >
        <div className="manifesto-copy">
          {content.story_paragraphs.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </div>
        {content.feature_image_url ? (
          <div className="manifesto-media">
            <ResilientImage
              src={content.feature_image_url}
              alt={`${club.name} about page feature`}
              fallbackVariant="photo"
              fill
              sizes="(max-width: 768px) 100vw, 420px"
              className="manifesto-image"
            />
          </div>
        ) : null}
      </section>

      {content.values.length > 0 ? (
        <section className="value-section">
          <p className="eyebrow">{content.values_heading}</p>
          <div className="value-grid">
            {content.values.map((value, index) => (
              <article className="value-card" key={`${value.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {content.closing_text ||
      (content.closing_cta_label && content.closing_cta_href) ? (
        <section className="about-closing">
          {content.closing_text ? <p>{content.closing_text}</p> : null}
          {content.closing_cta_label && content.closing_cta_href ? (
            <Link href={content.closing_cta_href}>
              {content.closing_cta_label}
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
