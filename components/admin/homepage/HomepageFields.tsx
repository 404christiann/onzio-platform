"use client";

import { useState } from "react";
import { defaultHomepageStoryContent } from "@/lib/homepage-story-content";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { siteRouteOptionsWithFallback } from "@/lib/site-routes";
import type { HomepageDraft, PieceId } from "@/lib/homepage-editor/model";
import { HOMEPAGE_PIECE_LABELS } from "@/lib/homepage-editor/preview-context";

type Program = { slug: string; navLabel: string; displayTitle: string };

export type HomepageFieldsProps = {
  piece: PieceId;
  clubName: string;
  draft: HomepageDraft;
  disabled: boolean;
  change: (field: string, value: string | boolean) => void;
  programs: Program[];
  more: boolean;
};

const inputClass = "hp-field input";
const textareaClass = "hp-field textarea";
const selectClass = "hp-field select";

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="font-body text-sm text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextField({ label, id, value, disabled, maxLength, onChange }: {
  label: string;
  id: string;
  value: string;
  disabled: boolean;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id}>
      <input id={id} className={inputClass} value={value} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AreaField({ label, id, value, disabled, maxLength, onChange }: {
  label: string;
  id: string;
  value: string;
  disabled: boolean;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id}>
      <Textarea id={id} className={textareaClass} value={value} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function RouteField({ label, id, value, disabled, programs, onChange }: {
  label: string;
  id: string;
  value: string;
  disabled: boolean;
  programs: Program[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id}>
      <NativeSelect id={id} className={selectClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {siteRouteOptionsWithFallback(programs, value).map((option) => (
          <NativeSelectOption key={`${id}-${option.href}`} value={option.href}>{option.label}</NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

export default function HomepageFields({ piece, clubName, draft, disabled, change: commit, programs, more }: HomepageFieldsProps) {
  // Resolved defaults are a display convenience, never a mutation of the raw
  // baseline. Once a field is edited, keep a deliberate blank visible too.
  const [editedFields, setEditedFields] = useState<ReadonlySet<string>>(() => new Set());
  const defaults = defaultHomepageStoryContent(clubName);
  const storyValue = (field: keyof typeof defaults) => editedFields.has(`story.${field}`) || draft.story[field].trim()
    ? draft.story[field] : defaults[field];
  function change(field: string, value: string | boolean) {
    setEditedFields(previous => new Set(previous).add(field));
    commit(field, value);
  }
  if (piece === "hero.eyebrow") {
    return <TextField label={HOMEPAGE_PIECE_LABELS[piece]} id="hero-eyebrow" value={draft.hero.eyebrow} disabled={disabled} maxLength={20_000} onChange={(value) => change("hero.eyebrow", value)} />;
  }
  if (piece === "hero.heading") {
    return <fieldset className="space-y-3"><legend className="font-body text-sm text-foreground">Main heading</legend><TextField label="Line one" id="hero-headline-line-one" value={draft.hero.headline_line_one} disabled={disabled} maxLength={80} onChange={(value) => change("hero.headline_line_one", value)} /><TextField label="Line two" id="hero-headline-line-two" value={draft.hero.headline_line_two} disabled={disabled} maxLength={80} onChange={(value) => change("hero.headline_line_two", value)} /></fieldset>;
  }
  if (piece === "hero.intro") {
    return <AreaField label={HOMEPAGE_PIECE_LABELS[piece]} id="hero-intro" value={draft.hero.intro} disabled={disabled} maxLength={320} onChange={(value) => change("hero.intro", value)} />;
  }
  if (piece === "hero.cta") {
    return <fieldset className="space-y-4"><legend className="font-body text-sm text-foreground">Top buttons</legend><fieldset className="space-y-3"><legend className="font-body text-sm text-foreground">First button</legend><TextField label="Button text" id="hero-primary-label" value={draft.hero.primary_cta_label} disabled={disabled} maxLength={20_000} onChange={(value) => change("hero.primary_cta_label", value)} />{more && <RouteField label="Where the button goes" id="hero-primary-href" value={draft.hero.primary_cta_href} disabled={disabled} programs={programs} onChange={(value) => change("hero.primary_cta_href", value)} />}</fieldset><fieldset className="space-y-3"><legend className="font-body text-sm text-foreground">Second button</legend><TextField label="Button text" id="hero-secondary-label" value={draft.hero.secondary_cta_label} disabled={disabled} maxLength={20_000} onChange={(value) => change("hero.secondary_cta_label", value)} />{more && <RouteField label="Where the button goes" id="hero-secondary-href" value={draft.hero.secondary_cta_href} disabled={disabled} programs={programs} onChange={(value) => change("hero.secondary_cta_href", value)} />}</fieldset></fieldset>;
  }
  if (piece === "story.text") {
    return <fieldset className="space-y-3"><legend className="font-body text-sm text-foreground">Your club&apos;s story</legend><TextField label="Main heading" id="story-heading" value={storyValue("heading")} disabled={disabled} maxLength={120} onChange={(value) => change("story.heading", value)} /><fieldset className="space-y-2"><legend className="font-body text-sm text-foreground">First paragraph</legend><AreaField label="Short paragraph" id="story-body-primary" value={storyValue("bodyPrimary")} disabled={disabled} maxLength={1200} onChange={(value) => change("story.bodyPrimary", value)} /></fieldset><fieldset className="space-y-2"><legend className="font-body text-sm text-foreground">Second paragraph</legend><AreaField label="Short paragraph" id="story-body-secondary" value={storyValue("bodySecondary")} disabled={disabled} maxLength={1200} onChange={(value) => change("story.bodySecondary", value)} /></fieldset></fieldset>;
  }
  if (piece === "story.cta") {
    return <TextField label="Button text" id="story-cta-label" value={storyValue("ctaLabel")} disabled={disabled} maxLength={40} onChange={(value) => change("story.ctaLabel", value)} />;
  }
  if (piece === "video") {
    return <fieldset className="space-y-3"><legend className="font-body text-sm text-foreground">Video feature</legend><TextField label="Small heading" id="video-eyebrow" value={draft.video.eyebrow} disabled={disabled} maxLength={20_000} onChange={(value) => change("video.eyebrow", value)} /><TextField label="Main heading" id="video-title" value={draft.video.title} disabled={disabled} maxLength={20_000} onChange={(value) => change("video.title", value)} /><AreaField label="Short paragraph" id="video-description" value={draft.video.description} disabled={disabled} maxLength={20_000} onChange={(value) => change("video.description", value)} /><TextField label="Video title" id="video-accessible-name" value={draft.video.video_title} disabled={disabled} maxLength={20_000} onChange={(value) => change("video.video_title", value)} /><TextField label="Caption" id="video-caption" value={draft.video.caption} disabled={disabled} maxLength={20_000} onChange={(value) => change("video.caption", value)} /></fieldset>;
  }
  if (piece === "photos") {
    if (!more) return null;
    return <TextField label="Slideshow label" id="photos-season-label" value={draft.photos.seasonLabel} disabled={disabled} maxLength={20_000} onChange={(value) => change("photos.seasonLabel", value)} />;
  }
  return <p className="font-body text-sm text-muted-foreground">{HOMEPAGE_PIECE_LABELS[piece]} is managed in its existing editor.</p>;
}
