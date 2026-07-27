"use client";

import { useClubId } from "@/components/ClubContextProvider";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import type {
  DBBehindTheRoseSection,
  DBHomepageSlideshowPhoto,
} from "@/lib/db-types";
import {
  canAddHomepageSlideshowPhoto,
  DEFAULT_BEHIND_THE_ROSE_SECTION,
  DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS,
  DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS,
  diffHomepageSlideshowPhotos,
  homepageStoragePathFromPublicUrl,
  MAX_HOMEPAGE_SLIDESHOW_PHOTOS,
  normalizeYouTubeEmbedUrl,
  type DraftHomepagePhoto,
} from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";
import { createClient } from "@/lib/admin-client";

type AdminTab = "slideshow" | "behind";

type SlideshowFields = {
  season_label: string;
};

type BehindFields = {
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  video_url: string;
  video_title: string;
  caption: string;
};

type TextBehindField = Exclude<keyof BehindFields, "visible">;

const EMPTY_BEHIND_FIELDS: BehindFields = {
  visible: DEFAULT_BEHIND_THE_ROSE_SECTION.visible,
  eyebrow: DEFAULT_BEHIND_THE_ROSE_SECTION.eyebrow,
  title: DEFAULT_BEHIND_THE_ROSE_SECTION.title,
  description: DEFAULT_BEHIND_THE_ROSE_SECTION.description,
  video_url: DEFAULT_BEHIND_THE_ROSE_SECTION.video_url,
  video_title: DEFAULT_BEHIND_THE_ROSE_SECTION.video_title,
  caption: DEFAULT_BEHIND_THE_ROSE_SECTION.caption,
};

const EMPTY_SLIDESHOW_FIELDS: SlideshowFields = {
  season_label: DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS.season_label,
};

const inputStyle: CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.5rem",
  color: "white",
  padding: "0.75rem 0.85rem",
  fontSize: "0.95rem",
  outline: "none",
};

function behindSectionToFields(section: DBBehindTheRoseSection): BehindFields {
  return {
    visible: section.visible,
    eyebrow: section.eyebrow,
    title: section.title,
    description: section.description,
    video_url: section.video_url,
    video_title: section.video_title,
    caption: section.caption,
  };
}

async function uploadHomepagePhoto(file: File): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `slideshow/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("homepage").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("homepage").getPublicUrl(path);
  return data.publicUrl;
}

async function deleteHomepageStorageUrls(urls: string[]): Promise<void> {
  const paths = urls
    .map(homepageStoragePathFromPublicUrl)
    .filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase.storage.from("homepage").remove(paths);
  if (error) throw new Error(error.message);
}

export default function AdminHomepagePage() {
  const clubId = useClubId();
  const [activeTab, setActiveTab] = useState<AdminTab>("slideshow");
  const [draftPhotos, setDraftPhotos] = useState<DraftHomepagePhoto[]>(
    DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS.map((photo) => ({
      id: photo.id,
      url: photo.url,
      alt: photo.alt,
    })),
  );
  const [originalPhotos, setOriginalPhotos] = useState<DBHomepageSlideshowPhoto[]>(
    DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS,
  );
  const [slideshowFields, setSlideshowFields] = useState<SlideshowFields>(
    EMPTY_SLIDESHOW_FIELDS,
  );
  const [behindFields, setBehindFields] = useState<BehindFields>(EMPTY_BEHIND_FIELDS);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchHomepageContent(clubId)
      .then(({ slideshowPhotos, slideshowSettings, behindTheRose }) => {
        setOriginalPhotos(slideshowPhotos);
        setDraftPhotos(
          slideshowPhotos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            alt: photo.alt,
          })),
        );
        setSlideshowFields({ season_label: slideshowSettings.season_label });
        setBehindFields(behindSectionToFields(behindTheRose));
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load homepage content");
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function setBehindField(field: TextBehindField, value: string) {
    setBehindFields((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function setSlideshowField(field: keyof SlideshowFields, value: string) {
    setSlideshowFields((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function setPhotoAlt(index: number, value: string) {
    setDraftPhotos((current) =>
      current.map((photo, photoIndex) =>
        photoIndex === index ? { ...photo, alt: value } : photo,
      ),
    );
    markDirty();
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setDraftPhotos((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    markDirty();
  }

  async function removePhoto(index: number) {
    const photo = draftPhotos[index];
    setDraftPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    markDirty();

    if (photo?.id === null) {
      try {
        await deleteHomepageStorageUrls([photo.url]);
      } catch (deleteError: unknown) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to remove uploaded file");
      }
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = Math.max(0, MAX_HOMEPAGE_SLIDESHOW_PHOTOS - draftPhotos.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    markDirty();
    try {
      const uploaded: DraftHomepagePhoto[] = [];
      for (const file of selected) {
        uploaded.push({
          id: null,
          url: await uploadHomepagePhoto(file),
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        });
      }
      setDraftPhotos((current) =>
        [...current, ...uploaded].slice(0, MAX_HOMEPAGE_SLIDESHOW_PHOTOS),
      );
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    const cleanedBehindFields = {
      ...behindFields,
      eyebrow: behindFields.eyebrow.trim(),
      title: behindFields.title.trim(),
      description: behindFields.description.trim(),
      video_url: normalizeYouTubeEmbedUrl(behindFields.video_url),
      video_title: behindFields.video_title.trim(),
      caption: behindFields.caption.trim(),
    };

    if (cleanedBehindFields.visible && !cleanedBehindFields.video_url) {
      setError("Add a video URL or turn off Behind the Rose.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error: slideshowSettingsError } = await supabase
        .from("homepage_slideshow_settings")
        .upsert([{
          id: 1,
          season_label: slideshowFields.season_label.trim(),
          updated_at: new Date().toISOString(),
        }]);
      if (slideshowSettingsError) throw new Error(slideshowSettingsError.message);

      const { error: behindError } = await supabase
        .from("behind_the_rose_section")
        .upsert([{
          id: 1,
          ...cleanedBehindFields,
          updated_at: new Date().toISOString(),
        }]);
      if (behindError) throw new Error(behindError.message);

      const { toDelete, toInsert, toUpdate } = diffHomepageSlideshowPhotos(
        originalPhotos,
        draftPhotos,
      );

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("homepage_slideshow_photos")
          .delete()
          .in("id", toDelete.map((photo) => photo.id));
        if (deleteError) throw new Error(deleteError.message);
      }

      for (const update of toUpdate) {
        const { error: updateError } = await supabase
          .from("homepage_slideshow_photos")
          .update({ alt: update.alt, sort_order: update.sort_order })
          .eq("id", update.id);
        if (updateError) throw new Error(updateError.message);
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("homepage_slideshow_photos")
          .insert(toInsert);
        if (insertError) throw new Error(insertError.message);
      }

      await deleteHomepageStorageUrls(toDelete.map((photo) => photo.url));

      const fresh = await fetchHomepageContent(clubId);
      setOriginalPhotos(fresh.slideshowPhotos);
      setDraftPhotos(
        fresh.slideshowPhotos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          alt: photo.alt,
        })),
      );
      setSlideshowFields({
        season_label: fresh.slideshowSettings.season_label,
      });
      setBehindFields(behindSectionToFields(fresh.behindTheRose));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const saveDisabled = saving || uploading || !dirty;

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          Homepage
        </h1>
        <p
          className="font-body mt-1"
          style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}
        >
          Manage homepage slideshow photos and the Behind the Rose video section.
        </p>
      </div>

      {loading ? (
        <p
          className="font-display text-sm uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Loading…
        </p>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
          <section
            className="min-w-0 self-start rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              {[
                { id: "slideshow" as const, label: "Slideshow", count: `${draftPhotos.length}/${MAX_HOMEPAGE_SLIDESHOW_PHOTOS}` },
                { id: "behind" as const, label: "Behind the Rose", count: null },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="font-display flex-1 rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors"
                    style={{
                      backgroundColor: isActive ? "#FFFFFF" : "transparent",
                      color: isActive ? "#141414" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {tab.label}
                    {tab.count && (
                      <span style={{ color: isActive ? "rgba(20,20,20,0.45)" : "rgba(255,255,255,0.25)" }}>
                        {" "}
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeTab === "slideshow" && (
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p
                      className="font-display text-xs uppercase tracking-widest"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      Homepage Slideshow
                    </p>
                    <p
                      className="font-body mt-1 text-xs"
                      style={{ color: "rgba(255,255,255,0.22)" }}
                    >
                      Up to 6 ordered photos. Remove one before adding another.
                    </p>
                  </div>
                  <span
                    className="font-display text-xs uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    {draftPhotos.length}/{MAX_HOMEPAGE_SLIDESHOW_PHOTOS}
                  </span>
                </div>

                <Field label="Slideshow Label" help="Shown in the bottom-left corner of the public slideshow.">
                  <input
                    value={slideshowFields.season_label}
                    onChange={(event) => setSlideshowField("season_label", event.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {draftPhotos.map((photo, index) => (
                    <div key={photo.id ?? photo.url} className="min-w-0">
                      <div
                        className="group relative aspect-video w-full overflow-hidden rounded-lg"
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <Image
                          src={photo.url}
                          alt={photo.alt || `Homepage slide ${index + 1}`}
                          fill
                          sizes="220px"
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => void removePhoto(index)}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          style={{ backgroundColor: "#E7001B" }}
                          aria-label={`Remove homepage slide ${index + 1}`}
                        >
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                      <input
                        value={photo.alt}
                        onChange={(event) => setPhotoAlt(index, event.target.value)}
                        placeholder={`Slide ${index + 1} alt text`}
                        className="mt-2"
                        style={{ ...inputStyle, padding: "0.55rem 0.65rem", fontSize: "0.82rem" }}
                      />
                      <div className="mt-1 flex gap-1">
                        <OrderButton
                          label={`Move homepage slide ${index + 1} left`}
                          disabled={index === 0}
                          onClick={() => movePhoto(index, -1)}
                        >
                          ←
                        </OrderButton>
                        <OrderButton
                          label={`Move homepage slide ${index + 1} right`}
                          disabled={index === draftPhotos.length - 1}
                          onClick={() => movePhoto(index, 1)}
                        >
                          →
                        </OrderButton>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || !canAddHomepageSlideshowPhoto(draftPhotos.length)}
                    className="flex aspect-video w-full flex-col items-center justify-center rounded-lg transition-colors"
                    style={{
                      border: "1px dashed rgba(255,255,255,0.15)",
                      backgroundColor: uploading ? "rgba(255,255,255,0.03)" : "transparent",
                      color: "rgba(255,255,255,0.3)",
                      cursor:
                        uploading || !canAddHomepageSlideshowPhoto(draftPhotos.length)
                          ? "not-allowed"
                          : "pointer",
                      opacity: canAddHomepageSlideshowPhoto(draftPhotos.length) ? 1 : 0.4,
                    }}
                    aria-label="Add homepage slideshow photos"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span
                      className="font-display mt-1 uppercase"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.08em" }}
                    >
                      {uploading ? "Uploading" : "Add"}
                    </span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleUpload(event.target.files)}
                  />
                </div>

                {!canAddHomepageSlideshowPhoto(draftPhotos.length) && (
                  <p
                    className="font-body mt-2 text-xs"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    {MAX_HOMEPAGE_SLIDESHOW_PHOTOS} photo max.
                  </p>
                )}
              </div>
            )}

            {activeTab === "behind" && (
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-4 rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span>
                    <span className="font-display block text-xs uppercase tracking-widest text-white">
                      Visible on homepage
                    </span>
                    <span className="font-body mt-1 block text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                      Turn off to hide the section without deleting its saved content.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={behindFields.visible}
                    onChange={(event) => {
                      setBehindFields((current) => ({ ...current, visible: event.target.checked }));
                      markDirty();
                    }}
                    className="h-5 w-5 accent-[#E7001B]"
                  />
                </label>

                <Field label="Eyebrow">
                  <input
                    value={behindFields.eyebrow}
                    onChange={(event) => setBehindField("eyebrow", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Title">
                  <input
                    value={behindFields.title}
                    onChange={(event) => setBehindField("title", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={behindFields.description}
                    onChange={(event) => setBehindField("description", event.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </Field>
                <Field label="Video URL" help="Paste a YouTube watch, short, or embed URL.">
                  <input
                    type="url"
                    value={behindFields.video_url}
                    onChange={(event) => setBehindField("video_url", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Video Title">
                  <input
                    value={behindFields.video_title}
                    onChange={(event) => setBehindField("video_title", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Caption">
                  <input
                    value={behindFields.caption}
                    onChange={(event) => setBehindField("caption", event.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            {error && (
              <p className="font-body mt-4 text-sm" style={{ color: "#E7001B" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveDisabled}
              className="font-display mt-5 w-full rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition-opacity"
              style={{
                backgroundColor: "#E7001B",
                color: "white",
                opacity: saveDisabled ? 0.5 : 1,
                cursor: saveDisabled ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save Homepage"}
            </button>
          </section>

          <section
            className="min-w-0 overflow-hidden rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="mb-4">
              <p
                className="font-display text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Homepage Preview
              </p>
            </div>

            <div className="overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              {draftPhotos[0] ? (
                <div className="relative aspect-[16/9] w-full">
                  <Image
                    src={draftPhotos[0].url}
                    alt={draftPhotos[0].alt || "Homepage slideshow preview"}
                    fill
                    sizes="(min-width: 1280px) 760px, 90vw"
                    className="object-cover"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <span className="font-display text-xs tracking-widest text-white/60">
                      01 / {String(draftPhotos.length).padStart(2, "0")}
                    </span>
                    <div className="h-0.5 w-8" style={{ backgroundColor: "#E7001B" }} />
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center">
                  <p className="font-display text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Slideshow hidden until a photo is added.
                  </p>
                </div>
              )}
            </div>

            <p className="font-display mt-3 text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
              {slideshowFields.season_label}
            </p>

            {behindFields.visible && (
              <div className="mt-6 rounded-lg p-5 text-center" style={{ backgroundColor: "#0e0e0e" }}>
                <p className="font-display mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "#E7001B" }}>
                  {behindFields.eyebrow}
                </p>
                <h2 className="font-display text-3xl font-black uppercase leading-none text-white sm:text-5xl">
                  {behindFields.title}
                </h2>
                <p className="font-body mx-auto mt-4 max-w-xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {behindFields.description}
                </p>
                <div className="mt-5 aspect-video w-full bg-black" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}>
                  <iframe
                    src={normalizeYouTubeEmbedUrl(behindFields.video_url)}
                    title={behindFields.video_title || "Behind the Rose video"}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="font-display mt-4 text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {behindFields.caption}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.38)" }}>
        {label}
      </span>
      {children}
      {help && (
        <span className="font-body mt-1 block text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
          {help}
        </span>
      )}
    </label>
  );
}

function OrderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 flex-1 items-center justify-center rounded-md text-xs transition-opacity"
      style={{
        backgroundColor: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.45)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
