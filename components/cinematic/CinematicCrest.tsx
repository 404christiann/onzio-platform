"use client";

import type { CSSProperties } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBClubLogoPageContent } from "@/lib/db-types";
import "./cinematic.css";
import "./crest.css";

/** Same content and section targets as the existing Logo editor. */
export default function CinematicCrest({ content, editorEmptySections = false }: {
  content: DBClubLogoPageContent;
  editorEmptySections?: boolean;
}) {
  const club = useClubContext();
  return <div className="cinematic-site identity-page" data-cinematic-crest>
    <section className="identity-intro" aria-labelledby="identity-title">
      <div className="identity-heading" data-about-editor-section="fixed-hero">
        <h1 id="identity-title">Our Club Identity</h1>
        <p>Official club crest and colors</p>
      </div>
      {(content.annotated_image_url || editorEmptySections) && <div className="crest-diagram" data-about-editor-section="images" data-about-editor-index={0}>
        {content.annotated_image_url ? <NativeImage src={content.annotated_image_url}
          alt={`${club.name} annotated crest`} fallbackVariant="logo" />
          : editorEmptySections && <p className="identity-empty">Add the annotated crest artwork</p>}
      </div>}
    </section>
    {(content.features.length > 0 || editorEmptySections) && <section className="identity-features" aria-label="Crest features">
      {editorEmptySections && content.features.length === 0 && <div className="identity-empty" data-about-editor-section="features">Add the first crest feature</div>}
      {content.features.map((feature, index) => <article className="identity-feature" key={index}
        data-about-editor-section="features" data-about-editor-index={index}>
        <div className="feature-patch">{feature.patch_url && <NativeImage src={feature.patch_url}
          alt={`${feature.title} highlighted in the ${club.name} crest`} fallbackVariant="logo" loading="lazy" />}</div>
        <div className="feature-copy">
          <div className="feature-heading">
            <h2 title={feature.title}>{feature.title}</h2>
            {feature.icon_url && <div className="feature-icon" style={{
              "--crest-icon-size": `${feature.icon_size}px`,
              "--crest-icon-scale": feature.icon_scale,
            } as CSSProperties}><NativeImage src={feature.icon_url} alt="" loading="lazy" /></div>}
          </div>
          <p>{feature.description}</p>
        </div>
        <span className="feature-number" aria-hidden="true">{index + 1}</span>
      </article>)}
    </section>}
    {(content.map_image_url || content.color_cards.length > 0 || editorEmptySections) && <section className="identity-place" aria-label="Club map and official brand colors">
      {(content.map_image_url || editorEmptySections) && <div data-about-editor-section="images" data-about-editor-index={1} className="identity-map">
        {content.map_image_url ? <NativeImage src={content.map_image_url} alt={`${club.name} home map`} fallbackVariant="photo" loading="lazy" />
          : editorEmptySections && <p className="identity-empty">Add the club map artwork</p>}
      </div>}
      <div className="identity-colors" data-about-editor-section={content.color_cards.length === 0 ? "colors" : undefined}>
        {editorEmptySections && content.color_cards.length === 0 && <div className="identity-empty">Add the first color card</div>}
        {content.color_cards.map((card, index) => <div key={index} data-about-editor-section="colors" data-about-editor-index={index}>
          {card.image_url ? <NativeImage src={card.image_url} alt={`${card.label} official brand color`} fallbackVariant="photo" loading="lazy" />
            : editorEmptySections && <p className="identity-empty">{card.label || "Add color artwork"}</p>}
        </div>)}
      </div>
    </section>}
  </div>;
}
