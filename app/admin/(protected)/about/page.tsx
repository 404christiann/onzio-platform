"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";
import { useRouter } from "next/navigation";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import AdminLoading, { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Textarea } from "@/components/ui/textarea";
import ScaledAboutPreview from "@/components/admin/ScaledAboutPreview";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
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

const ADMIN_TAB_ORDER: AdminTab[] = ["about", "logo"];
const ABOUT_PANEL_ORDER: AboutPanel[] = ["story", "values", "closing"];
const LOGO_PANEL_ORDER: LogoPanel[] = ["images", "features", "colors"];
type UploadTarget =
  | { kind: "aboutFeature" }
  | { kind: "logoAnnotated" }
  | { kind: "logoMap" }
  | { kind: "logoColorCard"; index: number }
  | { kind: "logoFeaturePatch"; index: number }
  | { kind: "logoFeatureIcon"; index: number };

/**
 * Where academy@1's About closing button points. Operator-owned per DCFC-D007,
 * so it lives in code rather than in an admin free-text field. This is the
 * destination the button already resolved to — `about_page_content
 * .closing_cta_href` is `/schedule` for Diverse City and `/schedule` is also
 * the shipped default in lib/about-content.ts — not a new destination.
 */
const ACADEMY_ABOUT_CLOSING_CTA_HREF = "/schedule";

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
  const club = useClubContext();
  const router = useRouter();
  // editorial@1 (Lions) doesn't support an About page -- the nav item is
  // already hidden in AdminShell.tsx, this blocks direct URL access too.
  const isEditorialTemplate = club.presentationTemplateKey === "editorial@1";
  useEffect(() => {
    if (isEditorialTemplate) router.replace("/admin");
  }, [isEditorialTemplate, router]);
  // DCFC-D007: club owners edit copy, Onzio operators own navigation
  // destinations. The About closing button follows the precedent already set by
  // DevelopingNextGeneration's "Our Story" button — the label stays editable,
  // the destination is fixed in code. academy@1's button already resolves to
  // /schedule (both the stored value and the shipped default), so pinning it
  // changes nothing about where the button goes; it only removes a free-text
  // href field that could save a broken path.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const [activeTab, setActiveTab] = useState<AdminTab>("about");
  const [tabDirection, setTabDirection] = useState<SlidingPanelDirection>(1);
  const [aboutPanel, setAboutPanel] = useState<AboutPanel>("story");
  const [aboutPanelDirection, setAboutPanelDirection] =
    useState<SlidingPanelDirection>(1);
  const [logoPanel, setLogoPanel] = useState<LogoPanel>("images");
  const [logoPanelDirection, setLogoPanelDirection] =
    useState<SlidingPanelDirection>(1);
  const selectTab = (next: AdminTab) => {
    setActiveTab((current) => {
      if (next === current) return current;
      setTabDirection(
        ADMIN_TAB_ORDER.indexOf(next) > ADMIN_TAB_ORDER.indexOf(current) ? 1 : -1,
      );
      return next;
    });
  };
  const selectAboutPanel = (next: AboutPanel) => {
    setAboutPanel((current) => {
      if (next === current) return current;
      setAboutPanelDirection(
        ABOUT_PANEL_ORDER.indexOf(next) > ABOUT_PANEL_ORDER.indexOf(current)
          ? 1
          : -1,
      );
      return next;
    });
  };
  const selectLogoPanel = (next: LogoPanel) => {
    setLogoPanel((current) => {
      if (next === current) return current;
      setLogoPanelDirection(
        LOGO_PANEL_ORDER.indexOf(next) > LOGO_PANEL_ORDER.indexOf(current)
          ? 1
          : -1,
      );
      return next;
    });
  };
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
        closing_cta_href: isAcademy
          ? ACADEMY_ABOUT_CLOSING_CTA_HREF
          : aboutDraft.closing_cta_href.trim() || "/schedule",
        updated_at: new Date().toISOString(),
      };
      const logoPayload = {
        ...logoDraft,
        features: normalizeClubLogoFeatures(logoDraft.features),
        color_cards: normalizeClubLogoColorCards(logoDraft.color_cards),
        updated_at: new Date().toISOString(),
      };

      // academy@1 sites have no /club-logo page, so its content row is never
      // read; skipping the upsert keeps the unreachable editor from writing.
      const [aboutResult, logoResult] = await Promise.all([
        supabase.from("about_page_content").upsert([aboutPayload]),
        isAcademy
          ? Promise.resolve({ error: null })
          : supabase.from("club_logo_page_content").upsert([logoPayload]),
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

  if (isEditorialTemplate) return null;

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-foreground"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          About
        </h1>
        <p className="font-body mt-1 text-muted-foreground" style={{ fontSize: "1rem" }}>
          {isAcademy
            ? "Edit the public About page."
            : "Edit the About Club and Club Logo public pages."}
        </p>
      </div>

      {loading ? (
        <AdminLoading className="font-display text-sm uppercase tracking-widest" />
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)]">
          <section
            className="flex min-w-0 max-h-[calc(100vh-9rem)] flex-col self-start overflow-hidden rounded-xl border border-border bg-background p-4 sm:p-5"
          >
            {/* academy@1 has no reachable /club-logo route (templateRegistry
                lists no club-logo in defaultRoutes/supportedRoutes), so the
                Club Logo editor is unreachable content for that template —
                same shape as DCFC-D130's sponsors decision. With one tab left
                the switcher itself is hidden; every other template keeps both
                tabs untouched. */}
            {!isAcademy && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
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
                      selectTab(tab.id);
                      if (tab.id === "about") {
                        setAboutPanel("story");
                        setAboutPanelDirection(1);
                      }
                      if (tab.id === "logo") {
                        setLogoPanel("images");
                        setLogoPanelDirection(1);
                      }
                    }}
                    disabled={saving || uploading}
                    className={`font-display rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors ${
                      selected ? "bg-foreground text-background" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            )}

            {activeTab === "about" ? (
              <SectionNav
                tabs={[
                  { id: "story", label: "Story" },
                  { id: "values", label: "Values" },
                  { id: "closing", label: "Closing" },
                ]}
                value={aboutPanel}
                onChange={selectAboutPanel}
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
                onChange={selectLogoPanel}
                disabled={saving || uploading}
              />
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <SlidingPanel activeKey={activeTab} direction={tabDirection}>
              {activeTab === "about" ? (
                <SlidingPanel activeKey={aboutPanel} direction={aboutPanelDirection}>
                  {aboutPanel === "story" && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
                      <div className="space-y-3">
                        <Field label="Page Title">
                          <input
                            value={aboutDraft.hero_title}
                            onChange={(event) => setAboutField("hero_title", event.target.value)}
                            className={ADMIN_INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Story Paragraphs" help="Each line becomes one paragraph.">
                          <Textarea
                            value={aboutDraft.story_paragraphs.join("\n")}
                            onChange={(event) => setStoryText(event.target.value)}
                            rows={9}
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
                          className={ADMIN_INPUT_CLASS}
                        />
                      </Field>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {aboutDraft.values.map((value, index) => (
                          <div key={index} className="rounded-lg border border-border p-3">
                            <Field label={`Value ${index + 1} Title`}>
                              <input
                                value={value.title}
                                onChange={(event) => setValue(index, "title", event.target.value)}
                                className={ADMIN_INPUT_CLASS}
                              />
                            </Field>
                            <Field label={`Value ${index + 1} Description`}>
                              <Textarea
                                value={value.description}
                                onChange={(event) => setValue(index, "description", event.target.value)}
                                rows={5}
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
                        <Textarea
                          value={aboutDraft.closing_text}
                          onChange={(event) => setAboutField("closing_text", event.target.value)}
                          rows={5}
                        />
                      </Field>
                      <div className="grid gap-3">
                        <Field label="Button Text" flush>
                          <input
                            value={aboutDraft.closing_cta_label}
                            onChange={(event) => setAboutField("closing_cta_label", event.target.value)}
                            className={ADMIN_INPUT_CLASS}
                          />
                        </Field>
                        {isAcademy ? (
                          <Field label="Button Goes To" flush>
                            <p className="font-body text-sm text-muted-foreground">
                              {ACADEMY_ABOUT_CLOSING_CTA_HREF} — the Schedule page.
                              Contact Onzio to change where this button goes.
                            </p>
                          </Field>
                        ) : (
                          <Field label="Button Link" flush>
                            <input
                              value={aboutDraft.closing_cta_href}
                              onChange={(event) => setAboutField("closing_cta_href", event.target.value)}
                              className={ADMIN_INPUT_CLASS}
                            />
                          </Field>
                        )}
                      </div>
                    </div>
                  )}
                </SlidingPanel>
              ) : (
                <SlidingPanel activeKey={logoPanel} direction={logoPanelDirection}>
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
                              className={`font-display rounded-md border px-2 py-2 text-[0.65rem] uppercase tracking-widest transition-colors ${
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-card text-muted-foreground"
                              }`}
                            >
                              {feature.title.replace("The ", "")}
                            </button>
                          );
                        })}
                      </div>

                      {logoDraft.features[selectedLogoFeature] && (
                        <div className="rounded-lg border border-border p-3">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
                            <div className="space-y-3">
                              <Field label={`Feature ${selectedLogoFeature + 1} Title`}>
                                <input
                                  value={logoDraft.features[selectedLogoFeature].title}
                                  onChange={(event) => setLogoFeature(selectedLogoFeature, "title", event.target.value)}
                                  className={ADMIN_INPUT_CLASS}
                                />
                              </Field>
                              <Field label={`Feature ${selectedLogoFeature + 1} Description`}>
                                <Textarea
                                  value={logoDraft.features[selectedLogoFeature].description}
                                  onChange={(event) => setLogoFeature(selectedLogoFeature, "description", event.target.value)}
                                  rows={8}
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
                                    className={ADMIN_INPUT_CLASS}
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
                                    className={ADMIN_INPUT_CLASS}
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
                    <div className="rounded-lg border border-border p-3">
                      <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                        Brand Color Cards
                      </p>
                      <p className="font-body mb-3 text-xs text-muted-foreground">
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
                </SlidingPanel>
              )}
              </SlidingPanel>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null)}
              />

              {error && (
                <p className="font-body mb-3 text-sm text-destructive">
                  Error: {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="font-display w-full rounded-lg bg-brand py-3 text-sm font-bold uppercase tracking-widest text-white transition-opacity hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
                {saving ? "Saving..." : uploading ? "Uploading..." : "Save About Pages"}
              </button>
            </div>
          </section>

          <section className="min-w-0">
            <p className="font-display mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              {activeTab === "about" ? "About Preview" : "Club Logo Preview"}
            </p>
            <p className="font-body mb-3 text-xs text-muted-foreground">
              Desktop website view, scaled to fit. The layout stays in the
              proportions visitors see instead of re-flowing to this panel.
            </p>
            <div className="h-[760px] overflow-auto rounded-lg border border-border bg-white">
              {activeTab === "about" ? (
                <ScaledAboutPreview variant="about" content={aboutDraft} />
              ) : (
                <ScaledAboutPreview variant="logo" content={logoDraft} />
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
      <label className={ADMIN_LABEL_CLASS}>
        {label}
      </label>
      {children}
      {help && (
        <p className="font-body mt-1 text-xs text-muted-foreground">
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
    <div className="mt-3 grid gap-1 rounded-lg bg-card p-1 sm:grid-cols-3">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            disabled={disabled}
            className={`font-display rounded-md px-3 py-2 text-[0.68rem] uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
              selected ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
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
      <p className="font-display mb-1 text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className={compact
        ? "grid min-w-0 gap-2 rounded-lg border border-border p-2"
        : "grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-lg border border-border p-2 sm:grid-cols-[72px_minmax(0,1fr)]"
      }>
        <div className={compact
          ? "relative h-24 min-w-0 overflow-hidden rounded-md bg-black"
          : "relative h-14 min-w-0 overflow-hidden rounded-md bg-black sm:h-16"
        }>
          <Image src={url} alt={label} fill sizes={compact ? "210px" : "84px"} className="object-contain" />
        </div>
        <div className="flex min-w-0 flex-col">
          <p
            className="font-body min-w-0 truncate text-xs text-muted-foreground"
            title={url}
          >
            {url}
          </p>
          <button
            type="button"
            onClick={onReplace}
            disabled={disabled}
            className="font-display mt-2 w-full max-w-full rounded-md bg-card px-2 py-2 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
