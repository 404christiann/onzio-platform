"use client";

import { useId, type ReactNode } from "react";
import { EditorField, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { IconCaretDown, IconCaretUp } from "@/components/admin/icons";
import { ImageFieldWithDescription, ObjectListField, StringListField, ValidationMessage } from "@/components/admin/ui/editor-kit";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import type { SiteRouteOption } from "@/lib/site-routes";
import { newLogoColorCard, newLogoFeature } from "@/lib/about-editor/collections";
import styles from "./AboutEditor.module.css";
import { CrestIconSizing } from "./CrestIconSizing";
import { ABOUT_TARGETS, colorTarget, featureTarget, storyParagraphTarget, valueTarget } from "./about-edit-targets";
import {
  ABOUT_LIMITS, moveCard, newCardId,
  type AboutDraft, type AboutDrafts, type AboutErrors, type KeyedColorCard, type KeyedFeature, type KeyedValue, type LogoDraft, type SectionId,
} from "./about-sections";

/** Which image a field edits. Cards are named by their own id, so an upload still lands on the right card after a move. */
export type UploadTarget =
  | { kind: "aboutFeature" } | { kind: "logoAnnotated" } | { kind: "logoMap" }
  | { kind: "logoColorCard"; id: string } | { kind: "logoFeaturePatch"; id: string } | { kind: "logoFeatureIcon"; id: string };

export type AboutFieldsApi = {
  drafts: AboutDrafts;
  locked: boolean;
  uploading: boolean;
  errors: AboutErrors;
  destinations: { options: readonly SiteRouteOption[]; loaded: boolean; available: boolean; error: string | null; retry: () => void };
  setAbout: (edit: (draft: AboutDraft) => AboutDraft) => void;
  setLogo: (edit: (draft: LogoDraft) => LogoDraft) => void;
  /** The old image of a card that was removed or replaced; it is deleted after the save. */
  retire: (page: "about" | "logo", url: string) => void;
  upload: (target: UploadTarget, file: File) => Promise<boolean | { error: string }>;
  onMediaPending: (pending: boolean) => void;
};

/** Photographs (the Feature image) keep the wide photo limits. */
const PHOTO_RULES = { allowedTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 15 * 1024 * 1024 } as const;
/** Graphics (crest, map, patch, icon, swatch) are uploaded as kind "graphic": PNG or WebP only, 5 MB. */
const GRAPHIC_RULES = { allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 } as const;

/** A text field with its limit and, once a save was refused, the message the rules give for it. */
function Field({ label, value, max, locked, error, hint, multiline, target, onChange }: {
  label: string; value: string; max: number; locked: boolean; error?: string; hint?: ReactNode; multiline?: boolean; target?: EditTargetId; onChange: (value: string) => void;
}) {
  const base = useId(), errorId = `${base}-error`, limitId = `${base}-limit`;
  const atLimit = value.length >= max;
  const described = [error ? errorId : null, atLimit ? limitId : null].filter(Boolean).join(" ") || undefined;
  return <div className={styles.fieldWrap} {...editTargetProps(target)}>
    <EditorField label={label} value={value} max={max} disabled={locked} hint={hint} multiline={multiline} invalid={!!error || atLimit} describedBy={described} onChange={onChange} />
    {error && <ValidationMessage id={errorId} live="polite">{error}</ValidationMessage>}
    {atLimit && <ValidationMessage id={limitId} live="polite">{label} is at its limit of {max} characters.</ValidationMessage>}
  </div>;
}

/** Move earlier and later for one card. The first card cannot go earlier and the last cannot go later. */
function MoveTools({ index, length, name, locked, onMove }: { index: number; length: number; name: string; locked: boolean; onMove: (delta: -1 | 1) => void }) {
  return <div className={styles.tools} role="group" aria-label={`Order of ${name}`}>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} earlier`} data-move-earlier="" disabled={locked || index === 0} onClick={() => onMove(-1)}><IconCaretUp size={16} aria-hidden="true" />Earlier</button>
    <button type="button" className={`admin-press ${styles.tool}`} aria-label={`Move ${name} later`} data-move-later="" disabled={locked || index === length - 1} onClick={() => onMove(1)}><IconCaretDown size={16} aria-hidden="true" />Later</button>
  </div>;
}

function Destination({ api, error }: { api: AboutFieldsApi; error?: string }) {
  const id = useId(), { drafts, locked, destinations } = api;
  const href = drafts.about.closing_cta_href;
  return <div className={styles.fieldWrap} {...editTargetProps(ABOUT_TARGETS.closingDestination)}>
    <div className={kit.field}>
      <label htmlFor={id}>Button goes to</label>
      <select id={id} value={href} disabled={locked || !destinations.loaded} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => api.setAbout(draft => ({ ...draft, closing_cta_href: event.target.value }))}>
        {!destinations.available && <option value={href} disabled>{href ? `Current link unavailable (${href}). Choose a page` : "Choose a page"}</option>}
        {destinations.options.map(option => <option key={option.href} value={option.href}>{option.label} · {option.href}</option>)}
      </select>
      <span className={kit.hint}>Pages in your website menu that this button can link to.</span>
    </div>
    {error && <ValidationMessage id={`${id}-error`} live="polite">{error}</ValidationMessage>}
    {destinations.error && <ValidationMessage live="assertive">{destinations.error}
      <button type="button" className={`admin-press ${styles.keep}`} onClick={destinations.retry}>Retry pages</button></ValidationMessage>}
  </div>;
}

/** The fields of one card. Each edits the same content key it always did. */
export function AboutSectionFields({ api, id }: { api: AboutFieldsApi; id: SectionId }) {
  const { drafts, locked, errors, uploading } = api;
  const { about, logo } = drafts;

  if (id === "hero") return <div className={styles.stack}>
    <Field label="Page heading" value={about.hero_title} max={ABOUT_LIMITS.hero} locked={locked} error={errors.hero} hint="Shown at the top of the About page." target={ABOUT_TARGETS.heroHeading} onChange={value => api.setAbout(draft => ({ ...draft, hero_title: value }))} />
  </div>;

  if (id === "story") return <div className={styles.stack}>
    <StringListField label="Story paragraphs" description="Each paragraph is its own block on the page. Empty paragraphs are left out when you save." items={about.story_paragraphs} max={ABOUT_LIMITS.paragraphs}
      itemLabel="paragraph" maxLength={ABOUT_LIMITS.paragraph} multiline disabled={locked} itemTarget={storyParagraphTarget} onChange={items => api.setAbout(draft => ({ ...draft, story_paragraphs: items }))} />
    <ImageFieldWithDescription label="Feature image" description="Shown beside the story. Leave it empty and the story runs full width." previewUrl={about.feature_image_url} initials="Add a feature image" size={96} {...PHOTO_RULES} target={ABOUT_TARGETS.storyImage}
      disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending}
      onUpload={files => api.upload({ kind: "aboutFeature" }, files[0])}
      onRemove={() => { api.retire("about", about.feature_image_url); api.setAbout(draft => ({ ...draft, feature_image_url: "" })); }} />
  </div>;

  if (id === "values") return <div className={styles.stack}>
    <Field label="Values heading" value={about.values_heading} max={ABOUT_LIMITS.heading} locked={locked} hint="Leave blank to use “Our Values”." target={ABOUT_TARGETS.valuesHeading} onChange={value => api.setAbout(draft => ({ ...draft, values_heading: value }))} />
    <ObjectListField<KeyedValue> label="Values" description="The Values section is hidden on the page while there are none." items={about.values} max={ABOUT_LIMITS.values} getId={value => value._id}
      createItem={() => ({ _id: newCardId(), title: "", description: "" })} itemLabel="value" disabled={locked}
      onChange={items => api.setAbout(draft => ({ ...draft, values: items }))}
      renderItem={(value, index, update) => <>
        <MoveTools index={index} length={about.values.length} name={`value ${index + 1}`} locked={locked} onMove={delta => api.setAbout(draft => ({ ...draft, values: moveCard(draft.values, value._id, delta) }))} />
        <Field label="Title" value={value.title} max={ABOUT_LIMITS.valueTitle} locked={locked} error={errors[`values.${value._id}`]} target={valueTarget(value._id, "title")} onChange={title => update({ title })} />
        <Field label="Description" value={value.description} max={ABOUT_LIMITS.valueDescription} locked={locked} multiline target={valueTarget(value._id, "description")} onChange={description => update({ description })} />
      </>} />
  </div>;

  if (id === "closing") return <div className={styles.stack}>
    <Field label="Closing text" value={about.closing_text} max={ABOUT_LIMITS.closing} locked={locked} multiline target={ABOUT_TARGETS.closingText} onChange={value => api.setAbout(draft => ({ ...draft, closing_text: value }))} />
    <Field label="Button text" value={about.closing_cta_label} max={ABOUT_LIMITS.cta} locked={locked} hint="Leave blank to hide the button." target={ABOUT_TARGETS.closingButtonLabel} onChange={value => api.setAbout(draft => ({ ...draft, closing_cta_label: value }))} />
    <Destination api={api} error={errors.href} />
    <p className={styles.note}>The Closing section is hidden on the page when the text and the button text are both empty.</p>
  </div>;

  if (id === "images") return <div className={styles.stack}>
    <ImageFieldWithDescription label="Annotated crest image" description="Shown large at the top of the Club Logo page." previewUrl={logo.annotated_image_url} initials="Add the annotated crest" size={96} {...GRAPHIC_RULES} target={ABOUT_TARGETS.imagesAnnotated}
      disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending} onUpload={files => api.upload({ kind: "logoAnnotated" }, files[0])} />
    <ImageFieldWithDescription label="Map image" description="Shown above the color cards." previewUrl={logo.map_image_url} initials="Add the map image" size={96} {...GRAPHIC_RULES} target={ABOUT_TARGETS.imagesMap}
      disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending} onUpload={files => api.upload({ kind: "logoMap" }, files[0])} />
  </div>;

  if (id === "features") return <div className={styles.stack}>
    <ObjectListField<KeyedFeature> label="Crest features" description="One entry for each part of the crest the page explains." items={logo.features} max={ABOUT_LIMITS.features} getId={feature => feature._id}
      createItem={() => ({ ...newLogoFeature(), _id: newCardId() })} itemLabel="crest feature" itemsLabel="crest features" disabled={locked}
      onChange={items => {
        // A removed feature's pictures are deleted after the save, as the classic editor does.
        for (const gone of logo.features.filter(feature => !items.some(item => item._id === feature._id))) { api.retire("logo", gone.patch_url); api.retire("logo", gone.icon_url); }
        api.setLogo(draft => ({ ...draft, features: items }));
      }}
      renderItem={(feature, index, update) => <>
        <MoveTools index={index} length={logo.features.length} name={`crest feature ${index + 1}`} locked={locked} onMove={delta => api.setLogo(draft => ({ ...draft, features: moveCard(draft.features, feature._id, delta) }))} />
        <Field label="Title" value={feature.title} max={ABOUT_LIMITS.featureTitle} locked={locked} target={featureTarget(feature._id, "title")} onChange={title => update({ title })} />
        <Field label="Description" value={feature.description} max={ABOUT_LIMITS.featureDescription} locked={locked} multiline target={featureTarget(feature._id, "description")} onChange={description => update({ description })} />
        <div className={styles.row2}>
          <ImageFieldWithDescription label="Patch" description="The patch picture beside the text." previewUrl={feature.patch_url} initials="Add a patch" size={72} {...GRAPHIC_RULES} target={featureTarget(feature._id, "patch")}
            disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending} onUpload={files => api.upload({ kind: "logoFeaturePatch", id: feature._id }, files[0])} />
          <ImageFieldWithDescription label="Icon" description="The small icon on the crest." previewUrl={feature.icon_url} initials="Add an icon" size={72} {...GRAPHIC_RULES} target={featureTarget(feature._id, "icon")}
            disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending} onUpload={files => api.upload({ kind: "logoFeatureIcon", id: feature._id }, files[0])} />
        </div>
        {/* By id and from the latest draft: a drag commits at low priority, so this card's render may be a frame behind. */}
        <CrestIconSizing features={logo.features} index={index} locked={locked}
          sizeTarget={featureTarget(feature._id, "iconSize")} scaleTarget={featureTarget(feature._id, "iconScale")}
          onChange={patch => api.setLogo(draft => ({ ...draft, features: draft.features.map(item => item._id === feature._id ? { ...item, ...patch } : item) }))} />
      </>} />
  </div>;

  return <div className={styles.stack}>
    <ObjectListField<KeyedColorCard> label="Color cards" description="Up to six color cards below the club map." items={logo.color_cards} max={ABOUT_LIMITS.colors} getId={card => card._id}
      createItem={() => ({ ...newLogoColorCard(), _id: newCardId() })} itemLabel="color card" itemsLabel="color cards" disabled={locked}
      onChange={items => {
        for (const gone of logo.color_cards.filter(card => !items.some(item => item._id === card._id))) api.retire("logo", gone.image_url);
        api.setLogo(draft => ({ ...draft, color_cards: items }));
      }}
      renderItem={(card, index, update) => <>
        <MoveTools index={index} length={logo.color_cards.length} name={`color card ${index + 1}`} locked={locked} onMove={delta => api.setLogo(draft => ({ ...draft, color_cards: moveCard(draft.color_cards, card._id, delta) }))} />
        <Field label="Color label" value={card.label} max={ABOUT_LIMITS.colorLabel} locked={locked} target={colorTarget(card._id, "label")} onChange={label => update({ label })} />
        <ImageFieldWithDescription label="Swatch image" description="The picture of this color." previewUrl={card.image_url} initials="Add a swatch" size={72} {...GRAPHIC_RULES} target={colorTarget(card._id, "image")}
          disabled={locked} uploading={uploading} onPendingChange={api.onMediaPending} onUpload={files => api.upload({ kind: "logoColorCard", id: card._id }, files[0])} />
      </>} />
  </div>;
}
