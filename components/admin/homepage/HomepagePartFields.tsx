"use client";

import ResilientNativeImage from "@/components/ResilientNativeImage";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EditorActionButton, EditorGroup, EditorReorderButtons, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import { isSafeCinematicDestination, type CinematicArtworkSlot } from "@/lib/cinematic-homepage-content";
import { HOMEPAGE_HERO_EYEBROW_MAX } from "@/lib/homepage-editor/contract";
import type { HomepageDraft, HomepagePhoto } from "@/lib/homepage-editor/model";
import { siteRouteOptionsWithFallback } from "@/lib/site-routes";
import { useClubContext } from "@/components/ClubContextProvider";
import type { HeroVideoController } from "@/lib/homepage-editor/hero-video-upload";
import HeroVideoControl from "./HeroVideoControl";
import CinematicHomepageFields from "./CinematicHomepageFields";
import type { PartId } from "./homepage-parts";

type Program = { slug: string; navLabel: string; displayTitle: string };

/** What the fields need from useHomepageEditor. Passed as one object so the dialog stays a thin switch. */
export type HomepagePartEditor = {
  draft: HomepageDraft;
  disabled: boolean;
  maxPhotos: number;
  programs: Program[];
  photoCaptionEditable: boolean;
  videoSourceSet: boolean;
  field: (field: string, value: string | boolean) => void;
  setRevamp: (content: NonNullable<HomepageDraft["revamp"]>) => void;
  setPhotos: (photos: HomepagePhoto[]) => void;
  updatePhoto: (id: string, update: Partial<HomepagePhoto>) => void;
  removePhoto: (id: string) => void;
  retryPhoto: (id: string) => void;
  addPhotos: () => void;
  replaceArtwork: (slot: CinematicArtworkSlot, file: File) => void;
  retryArtwork: (slot: CinematicArtworkSlot) => void;
  /** Rose City (cinematic@2) only. Absent for every other template, which keeps "set by Onzio". */
  heroVideo?: HeroVideoController | null;
};

function Text({ label, value, max, disabled, multiline, onChange }: { label: string; value: string; max: number; disabled: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className={kit.field}><span className={kit.fieldLabel}>{label}</span>{multiline
    ? <textarea value={value} maxLength={max} disabled={disabled} onChange={event => onChange(event.target.value)} />
    : <input value={value} maxLength={max} disabled={disabled} onChange={event => onChange(event.target.value)} />}</label>;
}

function Route({ label, value, disabled, programs, onChange }: { label: string; value: string; disabled: boolean; programs: Program[]; onChange: (value: string) => void }) {
  const { storeEnabled } = useClubContext();
  return <label className={kit.field}><span className={kit.fieldLabel}>{label}</span>
    <NativeSelect className="min-h-11 rounded-[10px] text-base" disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
      {siteRouteOptionsWithFallback(programs, value, { storeEnabled }).map(option => <NativeSelectOption key={option.href} value={option.href}>{option.label}</NativeSelectOption>)}
    </NativeSelect></label>;
}

function HeroFields({ e }: { e: HomepagePartEditor }) {
  const { hero } = e.draft;
  const text = (label: string, field: keyof typeof hero & string, max: number, multiline = false) =>
    <Text label={label} value={hero[field as keyof typeof hero]} max={max} disabled={e.disabled} multiline={multiline} onChange={value => e.field(`hero.${field}`, value)} />;
  return <div className={kit.stack}>
    {text("Small heading", "eyebrow", HOMEPAGE_HERO_EYEBROW_MAX)}
    {text("Intro", "intro", 320, true)}
    <EditorGroup legend="Main heading">{text("Line one", "headline_line_one", 80)}{text("Line two", "headline_line_two", 80)}</EditorGroup>
    <EditorGroup legend="First button">{text("Button text", "primary_cta_label", 20_000)}<Route label="Where it goes" value={hero.primary_cta_href} disabled={e.disabled} programs={e.programs} onChange={value => e.field("hero.primary_cta_href", value)} /></EditorGroup>
    <EditorGroup legend="Second button">{text("Button text", "secondary_cta_label", 20_000)}<Route label="Where it goes" value={hero.secondary_cta_href} disabled={e.disabled} programs={e.programs} onChange={value => e.field("hero.secondary_cta_href", value)} /></EditorGroup>
    {e.heroVideo
      ? <HeroVideoControl controller={e.heroVideo} disabled={e.disabled} />
      : <p className={kit.hint}>The background video and poster are set by Onzio.</p>}
  </div>;
}

function PhotosFields({ e }: { e: HomepagePartEditor }) {
  const items = e.draft.photos.items;
  const move = (index: number, delta: -1 | 1) => {
    const next = [...items]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    e.setPhotos(next.map((photo, order) => ({ ...photo, order })));
  };
  return <div className={kit.stack}>
    <p className={kit.hint}>Up to {e.maxPhotos} photos. Each needs a short description for people who can’t see it.</p>
    <p role="status" className={kit.hint}>{items.length} of {e.maxPhotos} photos used</p>
    {items.map((photo, index) => <EditorGroup key={photo.clientId} legend={`Photo ${index + 1}`}>
      <div className={kit.imagePreview}>{photo.url ? <ResilientNativeImage src={photo.url} alt={photo.alt} /> : <span className={kit.imageEmpty}>No image yet</span>}</div>
      <Text label="Describe this photo" value={photo.alt} max={20_000} disabled={e.disabled} onChange={value => e.updatePhoto(photo.clientId, { alt: value })} />
      <p className={kit.hint}>Helps people using screen readers understand the photo.</p>
      <EditorReorderButtons index={index} length={items.length} disabled={e.disabled} noun="photo" removeLabel="Remove photo" onMove={delta => move(index, delta)} onRemove={() => e.removePhoto(photo.clientId)} />
      {photo.upload === "uploading" && <p role="status" className={kit.hint}>Adding your photo…</p>}
      {photo.upload === "failed" && <div role="alert" className={`${kit.notice} grid gap-2`} data-tone="error"><p>{photo.error?.message}</p><div><EditorActionButton onClick={() => e.retryPhoto(photo.clientId)}>Try this photo again</EditorActionButton></div></div>}
    </EditorGroup>)}
    <div><EditorActionButton disabled={e.disabled || items.length >= e.maxPhotos} onClick={e.addPhotos}>Add photo</EditorActionButton></div>
  </div>;
}

function VideoFields({ e }: { e: HomepagePartEditor }) {
  const { video } = e.draft;
  const text = (label: string, field: "eyebrow" | "title" | "description", max: number, multiline = false) =>
    <Text label={label} value={video[field]} max={max} disabled={e.disabled} multiline={multiline} onChange={value => e.field(`video.${field}`, value)} />;
  return <div className={kit.stack}>
    <p className={kit.hint}>The video itself is set by Onzio.{!e.videoSourceSet && " Contact Onzio to add a video."}</p>
    {text("Small heading", "eyebrow", 20_000)}
    {text("Heading", "title", 20_000)}
    {text("Description", "description", 20_000, true)}
  </div>;
}

/** The https-only check the save contract applies, shown before Save rather than after it. */
function FormsWarnings({ e }: { e: HomepagePartEditor }) {
  const destinations = e.draft.revamp?.navigation.destinations;
  if (!destinations) return null;
  const bad = (["tryouts", "mediaCredentials", "nationalAnthem"] as const).filter(key => destinations[key] && !isSafeCinematicDestination(destinations[key]));
  if (!bad.length) return null;
  return <ValidationMessage live="polite">Use a full HTTPS address (it starts with https://) for each form link. Saving is blocked until they are fixed or cleared.</ValidationMessage>;
}

export default function HomepagePartFields({ part, e }: { part: PartId; e: HomepagePartEditor }) {
  if (part === "hero") return <HeroFields e={e} />;
  if (part === "photos") return <PhotosFields e={e} />;
  if (part === "video") return <VideoFields e={e} />;
  const revamp = e.draft.revamp;
  if (!revamp) return null;
  const piece = ({
    raffle: "revamp.raffle", match: "revamp.match", prices: "revamp.prices", ticket: "revamp.ticket", championship: "revamp.championship",
    sponsors: "revamp.sponsors", menu: "revamp.navigation", forms: "revamp.navigation",
  } as const)[part];
  return <>
    {part === "forms" && <FormsWarnings e={e} />}
    <CinematicHomepageFields piece={piece} part={part === "menu" ? "menu" : part === "forms" ? "forms" : undefined} content={revamp} disabled={e.disabled} change={e.setRevamp} replaceArtwork={e.replaceArtwork} retryArtwork={e.retryArtwork} />
  </>;
}
