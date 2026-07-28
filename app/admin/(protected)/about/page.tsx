"use client";

import { useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import AboutClubPageClient from "@/components/AboutClubPageClient";
import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import type {
  DBAboutPageContent,
  DBClubLogoPageContent,
} from "@/lib/db-types";
import {
  aboutStoragePathFromPublicUrl,
  DEFAULT_ABOUT_PAGE_CONTENT,
  DEFAULT_CLUB_LOGO_PAGE_CONTENT,
  normalizeClubLogoColorCards,
  normalizeAboutValues,
  normalizeClubLogoFeatures,
  normalizeStoryParagraphs,
  type AboutValue,
  type ClubLogoFeature,
} from "@/lib/about-content";
import { fetchAboutClubContent } from "@/lib/queries";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { createClient } from "@/lib/admin-client";

type AdminTab = "about" | "logo";
type AboutPanel = "story" | "values" | "closing";
type LogoPanel = "images" | "features" | "colors";
type UploadTarget =
  | { kind: "aboutFeature" }
  | { kind: "logoAnnotated" }
  | { kind: "logoMap" }
  | { kind: "logoColorCard"; index: number }
  | { kind: "logoFeaturePatch"; index: number }
  | { kind: "logoFeatureIcon"; index: number };

const inputStyle: CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.5rem",
  color: "white",
  padding: "0.72rem 0.82rem",
  fontSize: "0.9rem",
  outline: "none",
};

function toAboutDraft(content: DBAboutPageContent): DBAboutPageContent {
  return {
    ...content,
    story_paragraphs: normalizeStoryParagraphs(content.story_paragraphs),
    values: normalizeAboutValues(content.values),
  };
}

function toLogoDraft(content: DBClubLogoPageContent): DBClubLogoPageContent {
  return {
    ...content,
    features: normalizeClubLogoFeatures(content.features),
    color_cards: normalizeClubLogoColorCards(content.color_cards),
  };
}

async function uploadAboutImage(
  file: File,
  stablePath?: string,
  kind: "photo" | "graphic" = "photo",
): Promise<string> {
  const supabase = createClient();
  const bucket = kind === "graphic" ? "Aboutassets" : "about-page";
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = stablePath ?? `content/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: stablePath ? "0" : undefined,
    upsert: Boolean(stablePath),
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return stablePath ? `${data.publicUrl}?v=${Date.now()}` : data.publicUrl;
}

export default function AdminAboutPage() {
  const clubId = useClubId();
  const [activeTab, setActiveTab] = useState<AdminTab>("about");
  const [aboutPanel, setAboutPanel] = useState<AboutPanel>("story");
  const [logoPanel, setLogoPanel] = useState<LogoPanel>("images");
  const [selectedLogoFeature, setSelectedLogoFeature] = useState(0);
  const [aboutDraft, setAboutDraft] = useState<DBAboutPageContent>(
    toAboutDraft(DEFAULT_ABOUT_PAGE_CONTENT),
  );
  const [logoDraft, setLogoDraft] = useState<DBClubLogoPageContent>(
    toLogoDraft(DEFAULT_CLUB_LOGO_PAGE_CONTENT),
  );
  const [pendingDeleteUrls, setPendingDeleteUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<UploadTarget | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAboutClubContent(clubId)
      .then(({ about, logo }) => {
        const nextAbout = toAboutDraft(about);
        const nextLogo = toLogoDraft(logo);
        setAboutDraft(nextAbout);
        setLogoDraft(nextLogo);
        setPendingDeleteUrls([]);
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load about content");
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function queueReplacedUrl(url: string) {
    if (!aboutStoragePathFromPublicUrl(url)) return;
    setPendingDeleteUrls((current) => current.includes(url) ? current : [...current, url]);
  }

  function openUploader(target: UploadTarget) {
    uploadTargetRef.current = target;
    fileRef.current?.click();
  }

  async function handleImageUpload(file: File | null) {
    const target = uploadTargetRef.current;
    if (!file || !target) return;

    setUploading(true);
    setError(null);
    try {
      const stableColorPath = target.kind === "logoColorCard"
        ? `content/club-logo-colors/color-${target.index + 1}.png`
        : undefined;
      const nextUrl = await uploadAboutImage(
        file,
        stableColorPath,
        target.kind === "aboutFeature" ? "photo" : "graphic",
      );
      if (target.kind === "aboutFeature") {
        queueReplacedUrl(aboutDraft.feature_image_url);
        setAboutDraft((current) => ({ ...current, feature_image_url: nextUrl }));
      }
      if (target.kind === "logoAnnotated") {
        queueReplacedUrl(logoDraft.annotated_image_url);
        setLogoDraft((current) => ({ ...current, annotated_image_url: nextUrl }));
      }
      if (target.kind === "logoMap") {
        queueReplacedUrl(logoDraft.map_image_url);
        setLogoDraft((current) => ({ ...current, map_image_url: nextUrl }));
      }
      if (target.kind === "logoColorCard") {
        const replacedUrl = logoDraft.color_cards[target.index]?.image_url;
        if (replacedUrl && aboutStoragePathFromPublicUrl(replacedUrl) !== stableColorPath) {
          queueReplacedUrl(replacedUrl);
        }
        setLogoDraft((current) => ({
          ...current,
          color_cards: current.color_cards.map((card, index) =>
            index === target.index ? { ...card, image_url: nextUrl } : card,
          ),
        }));
      }
      if (target.kind === "logoFeaturePatch") {
        const replacedUrl = logoDraft.features[target.index]?.patch_url;
        if (replacedUrl) queueReplacedUrl(replacedUrl);
        setLogoDraft((current) => ({
          ...current,
          features: current.features.map((feature, index) =>
            index === target.index ? { ...feature, patch_url: nextUrl } : feature,
          ),
        }));
      }
      if (target.kind === "logoFeatureIcon") {
        const replacedUrl = logoDraft.features[target.index]?.icon_url;
        if (replacedUrl) queueReplacedUrl(replacedUrl);
        setLogoDraft((current) => ({
          ...current,
          features: current.features.map((feature, index) =>
            index === target.index ? { ...feature, icon_url: nextUrl } : feature,
          ),
        }));
      }
      markDirty();
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      uploadTargetRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setAboutField(field: keyof DBAboutPageContent, value: string) {
    setAboutDraft((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function setStoryText(value: string) {
    setAboutDraft((current) => ({
      ...current,
      story_paragraphs: value.split("\n").map((line) => line.trim()).filter(Boolean),
    }));
    markDirty();
  }

  function setValue(index: number, field: keyof AboutValue, value: string) {
    setAboutDraft((current) => ({
      ...current,
      values: current.values.map((item, valueIndex) =>
        valueIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
    markDirty();
  }

  function setLogoFeature(index: number, field: keyof ClubLogoFeature, value: string | number) {
    setLogoDraft((current) => ({
      ...current,
      features: current.features.map((feature, featureIndex) =>
        featureIndex === index ? { ...feature, [field]: value } : feature,
      ),
    }));
    markDirty();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();
      const aboutPayload = {
        ...aboutDraft,
        hero_title: aboutDraft.hero_title.trim() || DEFAULT_ABOUT_PAGE_CONTENT.hero_title,
        story_paragraphs: normalizeStoryParagraphs(aboutDraft.story_paragraphs),
        values_heading: aboutDraft.values_heading.trim() || DEFAULT_ABOUT_PAGE_CONTENT.values_heading,
        values: normalizeAboutValues(aboutDraft.values),
        closing_text: aboutDraft.closing_text.trim(),
        closing_cta_label: aboutDraft.closing_cta_label.trim(),
        closing_cta_href: aboutDraft.closing_cta_href.trim() || "/schedule",
        updated_at: new Date().toISOString(),
      };
      const logoPayload = {
        ...logoDraft,
        features: normalizeClubLogoFeatures(logoDraft.features),
        color_cards: normalizeClubLogoColorCards(logoDraft.color_cards),
        updated_at: new Date().toISOString(),
      };

      const [aboutResult, logoResult] = await Promise.all([
        supabase.from("about_page_content").upsert([aboutPayload]),
        supabase.from("club_logo_page_content").upsert([logoPayload]),
      ]);
      const saveError = aboutResult.error ?? logoResult.error;
      if (saveError) throw new Error(saveError.message);

      await deleteStorageUrls("about-page", pendingDeleteUrls, ["content/"]);
      setAboutDraft(aboutPayload);
      setLogoDraft(logoPayload);
      setPendingDeleteUrls([]);
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
          About
        </h1>
        <p className="font-body mt-1" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}>
          Edit the About Club and Club Logo public pages.
        </p>
      </div>

      {loading ? (
        <p className="font-display text-sm uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading...
        </p>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)]">
          <section
            className="flex min-w-0 max-h-[calc(100vh-9rem)] flex-col self-start overflow-hidden rounded-xl p-4 sm:p-5"
            style={{ backgroundColor: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              {[
                { id: "about" as const, label: "About" },
                { id: "logo" as const, label: "Club Logo" },
              ].map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === "about") setAboutPanel("story");
                      if (tab.id === "logo") setLogoPanel("images");
                    }}
                    disabled={saving || uploading}
                    className="font-display rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors"
                    style={{
                      backgroundColor: selected ? "#FFFFFF" : "transparent",
                      color: selected ? "#141414" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "about" ? (
              <SectionNav
                tabs={[
                  { id: "story", label: "Story" },
                  { id: "values", label: "Values" },
                  { id: "closing", label: "CTA" },
                ]}
                value={aboutPanel}
                onChange={setAboutPanel}
                disabled={saving || uploading}
              />
            ) : (
              <SectionNav
                tabs={[
                  { id: "images", label: "Images" },
                  { id: "features", label: "Features" },
                  { id: "colors", label: "Colors" },
                ]}
                value={logoPanel}
                onChange={setLogoPanel}
                disabled={saving || uploading}
              />
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {activeTab === "about" ? (
                <div>
                  {aboutPanel === "story" && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
                      <div className="space-y-3">
                        <Field label="Page Title">
                          <input
                            value={aboutDraft.hero_title}
                            onChange={(event) => setAboutField("hero_title", event.target.value)}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Story Paragraphs" help="Each line becomes one paragraph.">
                          <textarea
                            value={aboutDraft.story_paragraphs.join("\n")}
                            onChange={(event) => setStoryText(event.target.value)}
                            rows={9}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </Field>
                      </div>
                      <ImageControl
                        label="Feature Image"
                        url={aboutDraft.feature_image_url}
                        onReplace={() => openUploader({ kind: "aboutFeature" })}
                        disabled={uploading || saving}
                        compact
                      />
                    </div>
                  )}

                  {aboutPanel === "values" && (
                    <div className="space-y-3">
                      <Field label="Values Heading">
                        <input
                          value={aboutDraft.values_heading}
                          onChange={(event) => setAboutField("values_heading", event.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {aboutDraft.values.map((value, index) => (
                          <div key={index} className="rounded-lg border border-white/10 p-3">
                            <Field label={`Value ${index + 1} Title`}>
                              <input
                                value={value.title}
                                onChange={(event) => setValue(index, "title", event.target.value)}
                                style={inputStyle}
                              />
                            </Field>
                            <Field label={`Value ${index + 1} Description`}>
                              <textarea
                                value={value.description}
                                onChange={(event) => setValue(index, "description", event.target.value)}
                                rows={5}
                                style={{ ...inputStyle, resize: "vertical" }}
                              />
                            </Field>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aboutPanel === "closing" && (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Field label="Closing Text">
                        <textarea
                          value={aboutDraft.closing_text}
                          onChange={(event) => setAboutField("closing_text", event.target.value)}
                          rows={5}
                          style={{ ...inputStyle, resize: "vertical" }}
                        />
                      </Field>
                      <div className="grid gap-3">
                        <Field label="CTA Label" flush>
                          <input
                            value={aboutDraft.closing_cta_label}
                            onChange={(event) => setAboutField("closing_cta_label", event.target.value)}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="CTA Link" flush>
                          <input
                            value={aboutDraft.closing_cta_href}
                            onChange={(event) => setAboutField("closing_cta_href", event.target.value)}
                            style={inputStyle}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {logoPanel === "images" && (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <ImageControl
                        label="Annotated Crest Image"
                        url={logoDraft.annotated_image_url}
                        onReplace={() => openUploader({ kind: "logoAnnotated" })}
                        disabled={uploading || saving}
                        compact
                      />
                      <ImageControl
                        label="Map Image"
                        url={logoDraft.map_image_url}
                        onReplace={() => openUploader({ kind: "logoMap" })}
                        disabled={uploading || saving}
                        compact
                      />
                    </div>
                  )}

                  {logoPanel === "features" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {logoDraft.features.map((feature, index) => {
                          const selected = selectedLogoFeature === index;
                          return (
                            <button
                              key={feature.title}
                              type="button"
                              onClick={() => setSelectedLogoFeature(index)}
                              disabled={saving || uploading}
                              className="font-display rounded-md border px-2 py-2 text-[0.65rem] uppercase tracking-widest transition-colors"
                              style={{
                                backgroundColor: selected ? "white" : "rgba(255,255,255,0.04)",
                                borderColor: selected ? "white" : "rgba(255,255,255,0.08)",
                                color: selected ? "#141414" : "rgba(255,255,255,0.55)",
                              }}
                            >
                              {feature.title.replace("The ", "")}
                            </button>
                          );
                        })}
                      </div>

                      {logoDraft.features[selectedLogoFeature] && (
                        <div className="rounded-lg border border-white/10 p-3">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
                            <div className="space-y-3">
                              <Field label={`Feature ${selectedLogoFeature + 1} Title`}>
                                <input
                                  value={logoDraft.features[selectedLogoFeature].title}
                                  onChange={(event) => setLogoFeature(selectedLogoFeature, "title", event.target.value)}
                                  style={inputStyle}
                                />
                              </Field>
                              <Field label={`Feature ${selectedLogoFeature + 1} Description`}>
                                <textarea
                                  value={logoDraft.features[selectedLogoFeature].description}
                                  onChange={(event) => setLogoFeature(selectedLogoFeature, "description", event.target.value)}
                                  rows={8}
                                  style={{ ...inputStyle, resize: "vertical" }}
                                />
                              </Field>
                            </div>
                            <div className="grid gap-3">
                              <ImageControl
                                label="Patch"
                                url={logoDraft.features[selectedLogoFeature].patch_url}
                                onReplace={() => openUploader({ kind: "logoFeaturePatch", index: selectedLogoFeature })}
                                disabled={uploading || saving}
                                compact
                              />
                              <ImageControl
                                label="Icon"
                                url={logoDraft.features[selectedLogoFeature].icon_url}
                                onReplace={() => openUploader({ kind: "logoFeatureIcon", index: selectedLogoFeature })}
                                disabled={uploading || saving}
                                compact
                              />
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="Icon Size" flush>
                                  <input
                                    type="number"
                                    min={24}
                                    max={140}
                                    value={logoDraft.features[selectedLogoFeature].icon_size}
                                    onChange={(event) => setLogoFeature(selectedLogoFeature, "icon_size", Number(event.target.value))}
                                    style={inputStyle}
                                  />
                                </Field>
                                <Field label="Icon Scale" flush>
                                  <input
                                    type="number"
                                    min={0.5}
                                    max={4}
                                    step={0.05}
                                    value={logoDraft.features[selectedLogoFeature].icon_scale}
                                    onChange={(event) => setLogoFeature(selectedLogoFeature, "icon_scale", Number(event.target.value))}
                                    style={inputStyle}
                                  />
                                </Field>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {logoPanel === "colors" && (
                    <div className="rounded-lg border border-white/10 p-3">
                      <p
                        className="font-display text-xs uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        Brand Color Cards
                      </p>
                      <p className="font-body mb-3 text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                        Six fixed slots render below the Pasadena map.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {logoDraft.color_cards.map((card, index) => (
                          <ImageControl
                            key={card.label}
                            label={card.label}
                            url={card.image_url}
                            onReplace={() => openUploader({ kind: "logoColorCard", index })}
                            disabled={uploading || saving}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null)}
              />

              {error && (
                <p className="font-body mb-3 text-sm" style={{ color: "#E7001B" }}>
                  Error: {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="font-display w-full rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition-opacity"
                style={{
                  backgroundColor: "#E7001B",
                  color: "white",
                  opacity: saveDisabled ? 0.5 : 1,
                  cursor: saveDisabled ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : uploading ? "Uploading..." : "Save About Pages"}
              </button>
            </div>
          </section>

          <section className="min-w-0">
            <p
              className="font-display mb-3 text-xs uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {activeTab === "about" ? "About Preview" : "Club Logo Preview"}
            </p>
            <div
              className="h-[760px] overflow-auto rounded-lg bg-white"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {activeTab === "about" ? (
                <AboutClubPageClient content={aboutDraft} animate={false} />
              ) : (
                <ClubLogoPageClient content={logoDraft} animate={false} />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  help,
  flush = false,
  children,
}: {
  label: string;
  help?: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={flush ? "" : "mt-3 first:mt-0"}>
      <label
        className="font-display mb-1 block text-xs uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {label}
      </label>
      {children}
      {help && (
        <p className="font-body mt-1 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          {help}
        </p>
      )}
    </div>
  );
}

function SectionNav<T extends string>({
  tabs,
  value,
  onChange,
  disabled,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 grid gap-1 rounded-lg p-1 sm:grid-cols-3" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            disabled={disabled}
            className="font-display rounded-md px-3 py-2 text-[0.68rem] uppercase tracking-widest transition-colors"
            style={{
              backgroundColor: selected ? "rgba(231,0,27,0.9)" : "transparent",
              color: selected ? "white" : "rgba(255,255,255,0.45)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ImageControl({
  label,
  url,
  onReplace,
  disabled,
  compact = false,
}: {
  label: string;
  url: string;
  onReplace: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <p
        className="font-display mb-1 text-xs uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {label}
      </p>
      <div className={compact
        ? "grid min-w-0 gap-2 rounded-lg border border-white/10 p-2"
        : "grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-lg border border-white/10 p-2 sm:grid-cols-[72px_minmax(0,1fr)]"
      }>
        <div className={compact
          ? "relative h-24 min-w-0 overflow-hidden rounded-md bg-black"
          : "relative h-14 min-w-0 overflow-hidden rounded-md bg-black sm:h-16"
        }>
          <Image src={url} alt={label} fill sizes={compact ? "210px" : "84px"} className="object-contain" />
        </div>
        <div className="flex min-w-0 flex-col">
          <p
            className="font-body min-w-0 truncate text-xs"
            style={{ color: "rgba(255,255,255,0.32)" }}
            title={url}
          >
            {url}
          </p>
          <button
            type="button"
            onClick={onReplace}
            disabled={disabled}
            className="font-display mt-2 w-full max-w-full rounded-md px-2 py-2 text-[0.65rem] font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.65)",
              opacity: disabled ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
