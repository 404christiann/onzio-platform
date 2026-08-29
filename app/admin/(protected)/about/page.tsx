"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import {
  AdminSectionRail,
  type AdminSectionRailItem,
} from "@/components/admin/AdminSectionRail";
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

// The editor used to be two top-level tabs (About / Club Logo), each with
// three sub-panels. AdminSectionRail flattens that into one rail of six
// entries, visually grouped into two clusters ("About Club" / "Club Logo")
// — see the rail rendering below. SectionId carries both former panel-id
// namespaces in one flat union so a single SlidingPanel + AdminSectionRail
// pair can drive all six.
type SectionId = "story" | "values" | "closing" | "images" | "features" | "colors";

const ABOUT_SECTIONS: SectionId[] = ["story", "values", "closing"];
const LOGO_SECTIONS: SectionId[] = ["images", "features", "colors"];
const SECTION_ORDER: SectionId[] = [...ABOUT_SECTIONS, ...LOGO_SECTIONS];
const SECTION_LABELS: Record<SectionId, string> = {
  story: "Story",
  values: "Values",
  closing: "Closing",
  images: "Images",
  features: "Features",
  colors: "Colors",
};

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
  // DCFC-D007: club owners edit copy, Onzio operators own navigation
  // destinations. The About closing button follows the precedent already set by
  // DevelopingNextGeneration's "Our Story" button — the label stays editable,
  // the destination is fixed in code. academy@1's button already resolves to
  // /schedule (both the stored value and the shipped default), so pinning it
  // changes nothing about where the button goes; it only removes a free-text
  // href field that could save a broken path.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  // editorial@1 genuinely has an About page -- components/editorial/
  // EditorialHeader.tsx's nav and EditorialFooter.tsx both link /club/about,
  // and app/%5Fclubs/[slug]/club/about/page.tsx renders EditorialAboutPage
  // from this very editor's about_page_content row. (An earlier revision hid
  // this whole page for editorial@1 after checking Nav.tsx's lionsNavLinks,
  // which is dead code for this template -- Lions never mounts Nav.tsx.)
  //
  // The Club Logo tab is the part that stays hidden: templateRegistry's
  // editorial@1 entry lists no "club-logo" in defaultRoutes/supportedRoutes,
  // and nothing on the editorial site links /club/logo, so its content row is
  // never read -- exactly the academy@1 situation this gate already covered.
  const hasClubLogoPage = !isAcademy && !isEditorial;
  const [activeSection, setActiveSection] = useState<SectionId>("story");
  const [sectionDirection, setSectionDirection] =
    useState<SlidingPanelDirection>(1);
  const selectSection = (next: SectionId) => {
    setActiveSection((current) => {
      if (next === current) return current;
      setSectionDirection(
        SECTION_ORDER.indexOf(next) > SECTION_ORDER.indexOf(current) ? 1 : -1,
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
  const showFullLoader = useDelayedLoading(loading, 400);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Per-section dirty tracking is presentational-only: it drives the rail's
  // dirty-dots. Save itself remains a single combined write (see
  // handleSave) — this state never splits it into per-section saves. Same
  // pattern as app/admin/(protected)/homepage/page.tsx.
  const [dirtySections, setDirtySections] = useState<Set<SectionId>>(
    new Set(),
  );
  const dirty = dirtySections.size > 0;
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
        setDirtySections(new Set());
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load about content");
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  function markDirty(section: SectionId) {
    setDirtySections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
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
      let dirtySection: SectionId = "story";
      if (target.kind === "aboutFeature") {
        queueReplacedUrl(aboutDraft.feature_image_url);
        setAboutDraft((current) => ({ ...current, feature_image_url: nextUrl }));
        dirtySection = "story";
      }
      if (target.kind === "logoAnnotated") {
        queueReplacedUrl(logoDraft.annotated_image_url);
        setLogoDraft((current) => ({ ...current, annotated_image_url: nextUrl }));
        dirtySection = "images";
      }
      if (target.kind === "logoMap") {
        queueReplacedUrl(logoDraft.map_image_url);
        setLogoDraft((current) => ({ ...current, map_image_url: nextUrl }));
        dirtySection = "images";
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
        dirtySection = "colors";
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
        dirtySection = "features";
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
        dirtySection = "features";
      }
      markDirty(dirtySection);
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      uploadTargetRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setAboutField(field: keyof DBAboutPageContent, value: string, section: SectionId) {
    setAboutDraft((current) => ({ ...current, [field]: value }));
    markDirty(section);
  }

  function setStoryText(value: string) {
    setAboutDraft((current) => ({
      ...current,
      story_paragraphs: value.split("\n").map((line) => line.trim()).filter(Boolean),
    }));
    markDirty("story");
  }

  function setValue(index: number, field: keyof AboutValue, value: string) {
    setAboutDraft((current) => ({
      ...current,
      values: current.values.map((item, valueIndex) =>
        valueIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
    markDirty("values");
  }

  function setLogoFeature(index: number, field: keyof ClubLogoFeature, value: string | number) {
    setLogoDraft((current) => ({
      ...current,
      features: current.features.map((feature, featureIndex) =>
        featureIndex === index ? { ...feature, [field]: value } : feature,
      ),
    }));
    markDirty("features");
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

      // academy@1 and editorial@1 sites have no /club/logo page, so their
      // content row is never read; skipping the upsert keeps the unreachable
      // editor from writing.
      const [aboutResult, logoResult] = await Promise.all([
        supabase.from("about_page_content").upsert([aboutPayload]),
        hasClubLogoPage
          ? supabase.from("club_logo_page_content").upsert([logoPayload])
          : Promise.resolve({ error: null }),
      ]);
      const saveError = aboutResult.error ?? logoResult.error;
      if (saveError) throw new Error(saveError.message);

      await deleteStorageUrls("about-page", pendingDeleteUrls, ["content/"]);
      setAboutDraft(aboutPayload);
      setLogoDraft(logoPayload);
      setPendingDeleteUrls([]);
      setDirtySections(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const saveDisabled = saving || uploading || !dirty;
  const isLogoSection = LOGO_SECTIONS.includes(activeSection);

  // Rail items are grouped into two visually-labeled clusters ("About Club"
  // / "Club Logo") but share one flat activeSection/SlidingPanel pair — see
  // the SectionId comment above. The Club Logo cluster (heading + rail) is
  // wrapped in {hasClubLogoPage && (...)}, and its three items additionally
  // carry `hidden` for defensiveness/consistency with AdminSectionRail's
  // "never let hidden rows leak" contract, matching homepage's pattern.
  const aboutClubItems: AdminSectionRailItem[] = ABOUT_SECTIONS.map((id) => ({
    id,
    label: SECTION_LABELS[id],
    dirty: dirtySections.has(id),
  }));
  const clubLogoItems: AdminSectionRailItem[] = LOGO_SECTIONS.map((id) => ({
    id,
    label: SECTION_LABELS[id],
    dirty: dirtySections.has(id),
    hidden: !hasClubLogoPage,
  }));

  return (
    <AdminPage className="overflow-x-clip">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        title="About"
        description={hasClubLogoPage
            ? "Edit the About Club and Club Logo public pages."
            : "Edit the public About page."}
        actions={
          !loading ? (
            <>
              {dirty && (
                <div className="flex items-center gap-2 border-r border-border pr-3">
                  <span
                    className="h-2 w-2 flex-none rounded-full bg-warning"
                    aria-hidden="true"
                  />
                  <span className="font-body whitespace-nowrap text-sm text-muted-foreground">
                    Unsaved changes
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="rounded-lg bg-primary px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
                {saving ? "Saving..." : uploading ? "Uploading..." : "Save About Pages"}
              </button>
            </>
          ) : undefined
        }
      />

      {loading ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading about page" />
        ) : (
          <div
            className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,1fr)]"
            role="status"
            aria-label="Loading about page"
          >
            <div className="flex flex-col gap-2 self-start">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-4 sm:p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
            <div className="self-start">
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        )
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,1fr)]">
          <div className="flex min-w-0 flex-col gap-4 self-start">
            <div>
              <p className={`${ADMIN_LABEL_CLASS} px-1`}>About Club</p>
              <AdminSectionRail
                items={aboutClubItems}
                value={activeSection}
                onChange={(id) => selectSection(id as SectionId)}
              />
            </div>

            {/* academy@1 and editorial@1 have no reachable /club/logo route
                (templateRegistry lists no club-logo in defaultRoutes/
                supportedRoutes for either), so the Club Logo editor is
                unreachable content for both templates — same shape as
                DCFC-D130's sponsors decision. With no items left the whole
                cluster is hidden; every other template keeps both clusters
                untouched. */}
            {hasClubLogoPage && (
            <div>
              <p className={`${ADMIN_LABEL_CLASS} px-1`}>Club Logo</p>
              <AdminSectionRail
                items={clubLogoItems}
                value={activeSection}
                onChange={(id) => selectSection(id as SectionId)}
              />
            </div>
            )}

            {hasClubLogoPage && (
            <p className="font-body rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              One Save changes covers both pages. Club Logo is hidden for
              templates with no /club/logo route.
            </p>
            )}
          </div>

          <AdminPanel className="flex flex-col self-start p-4 sm:p-5">
            <SlidingPanel activeKey={activeSection} direction={sectionDirection}>
              {activeSection === "story" && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
                  <div className="space-y-3">
                    <Field label="Page Title">
                      <input
                        value={aboutDraft.hero_title}
                        onChange={(event) => setAboutField("hero_title", event.target.value, "story")}
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

              {activeSection === "values" && (
                <div className="space-y-3">
                  <Field label="Values Heading">
                    <input
                      value={aboutDraft.values_heading}
                      onChange={(event) => setAboutField("values_heading", event.target.value, "values")}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
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

              {activeSection === "closing" && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="Closing Text">
                    <Textarea
                      value={aboutDraft.closing_text}
                      onChange={(event) => setAboutField("closing_text", event.target.value, "closing")}
                      rows={5}
                    />
                  </Field>
                  <div className="grid gap-3">
                    <Field label="Button Text" flush>
                      <input
                        value={aboutDraft.closing_cta_label}
                        onChange={(event) => setAboutField("closing_cta_label", event.target.value, "closing")}
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
                          onChange={(event) => setAboutField("closing_cta_href", event.target.value, "closing")}
                          className={ADMIN_INPUT_CLASS}
                        />
                      </Field>
                    )}
                  </div>
                </div>
              )}

              {activeSection === "images" && (
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

              {activeSection === "features" && (
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

              {activeSection === "colors" && (
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

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null)}
            />

            {error && (
              <p className="font-body mt-4 border-t border-border pt-4 text-sm text-destructive">
                Error: {error}
              </p>
            )}
          </AdminPanel>

          <AdminPanel className="overflow-hidden p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
            <p className="font-display mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              {isLogoSection ? "Club Logo Preview" : "About Preview"}
            </p>
            <p className="font-body mb-3 text-xs text-muted-foreground">
              Desktop website view, scaled to fit. The layout stays in the
              proportions visitors see instead of re-flowing to this panel.
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              {isLogoSection ? (
                <ScaledAboutPreview variant="logo" content={logoDraft} />
              ) : (
                <ScaledAboutPreview variant="about" content={aboutDraft} />
              )}
            </div>
          </AdminPanel>
        </div>
      )}
    </AdminPage>
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
          {url ? (
            <Image src={url} alt={label} fill sizes={compact ? "210px" : "84px"} className="object-contain" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <span className="font-display text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground">
                No image
              </span>
            </div>
          )}
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
