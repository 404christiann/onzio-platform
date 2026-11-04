"use client";

import Link from "next/link";
import NativeImage from "@/components/ResilientNativeImage";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBAboutPageContent } from "@/lib/db-types";
import "./cinematic.css";
import "./about.css";

/** The public page and admin canvas share authored content and section targets. */
export default function CinematicAbout({ content, editorEmptySections = false }: {
  content: DBAboutPageContent;
  editorEmptySections?: boolean;
}) {
  const club = useClubContext();
  const hasClosing = Boolean(content.closing_text || (content.closing_cta_label && content.closing_cta_href));
  return <div className="cinematic-site about-2027" data-cinematic-about>
    <header className="about-heading" data-about-editor-section="hero">
      <h1>{content.hero_title}</h1><div className="about-rule" aria-hidden="true" />
    </header>
    {(content.story_paragraphs.length > 0 || content.feature_image_url || editorEmptySections) && <section
      className={`about-story${content.feature_image_url ? "" : " about-story-text-only"}`}
      data-about-editor-section="story" aria-label="Our club story">
      <div className="about-paragraphs">{content.story_paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {editorEmptySections && content.story_paragraphs.length === 0 && <p>Add your club story</p>}
      </div>
      {content.feature_image_url && <NativeImage className="about-photo" src={content.feature_image_url}
        alt={`${club.name} about page feature`} fallbackVariant="photo" />}
    </section>}
    {(content.values_heading || content.values.length > 0 || editorEmptySections) && <section
      className="about-values" data-about-editor-section="values" aria-label={content.values_heading || "Club values"}>
      {content.values_heading && <h2>{content.values_heading}</h2>}
      <div className="about-values-grid">{content.values.map((value, index) => <article key={index}>
        <span className="about-value-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <h3>{value.title}</h3><p>{value.description}</p>
      </article>)}</div>
      {editorEmptySections && content.values.length === 0 && <p className="about-empty">Add your first club value</p>}
    </section>}
    {(hasClosing || editorEmptySections) && <section className="about-closing" data-about-editor-section="closing" aria-label="Closing invitation">
      {content.closing_text && <h2>{content.closing_text}</h2>}
      {content.closing_cta_label && content.closing_cta_href && <Link className="about-schedule" href={content.closing_cta_href}>{content.closing_cta_label}</Link>}
      {editorEmptySections && !hasClosing && <p className="about-empty">Add a closing invitation</p>}
    </section>}
  </div>;
}
