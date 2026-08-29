"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import {
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/AdminPage";
import {
  AdminSectionRail,
  type AdminSectionRailItem,
} from "@/components/admin/AdminSectionRail";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import FileUpload from "@/components/admin/FileUpload";
import ScaledSlideshowPreview from "@/components/admin/ScaledSlideshowPreview";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  DBBehindTheRoseSection,
  DBHomepageHeroContent,
  DBHomepageSlideshowPhoto,
  DBHomepageStorySection,
} from "@/lib/db-types";
import {
  buildHomepageStoryMutationPayload,
  canAddHomepageSlideshowPhoto,
  DEFAULT_BEHIND_THE_ROSE_SECTION,
  DEFAULT_HOMEPAGE_HERO_CONTENT,
  DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS,
  DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS,
  diffHomepageSlideshowPhotos,
  emptyHomepageStoryDraft,
  homepageStoragePathFromPublicUrl,
  homepageStoryToDraft,
  MAX_HOMEPAGE_SLIDESHOW_PHOTOS,
  normalizeYouTubeEmbedUrl,
  validateHomepageStoryDraft,
  type DraftHomepagePhoto,
  type HomepageStoryDraft,
  type HomepageStoryValidationErrors,
} from "@/lib/homepage-content";
import {
  defaultHomepageStoryContent,
  HOMEPAGE_STORY_LIMITS,
} from "@/lib/homepage-story-content";
import { fetchHomepageContent } from "@/lib/queries";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/admin-client";
import { siteRouteOptionsWithFallback, type SiteRouteOption } from "@/lib/site-routes";
import { useDelayedLoading } from "@/lib/use-delayed-loading";

type AdminTab = "hero" | "slideshow" | "story" | "behind";

const ADMIN_TAB_ORDER: AdminTab[] = ["hero", "slideshow", "story", "behind"];

const TAB_LABELS: Record<AdminTab, string> = {
  hero: "Hero",
  slideshow: "Slideshow",
  story: "Story",
  behind: "Behind the Rose",
};

type HeroFields = {
  eyebrow: string;
  headline_line_one: string;
  headline_line_two: string;
  intro: string;
  primary_cta_label: string;
  primary_cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
};

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

const EMPTY_HERO_FIELDS: HeroFields = {
  eyebrow: DEFAULT_HOMEPAGE_HERO_CONTENT.eyebrow,
  headline_line_one: DEFAULT_HOMEPAGE_HERO_CONTENT.headline_line_one,
  headline_line_two: DEFAULT_HOMEPAGE_HERO_CONTENT.headline_line_two,
  intro: DEFAULT_HOMEPAGE_HERO_CONTENT.intro,
  primary_cta_label: DEFAULT_HOMEPAGE_HERO_CONTENT.primary_cta_label,
  primary_cta_href: DEFAULT_HOMEPAGE_HERO_CONTENT.primary_cta_href,
  secondary_cta_label: DEFAULT_HOMEPAGE_HERO_CONTENT.secondary_cta_label,
  secondary_cta_href: DEFAULT_HOMEPAGE_HERO_CONTENT.secondary_cta_href,
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

function heroContentToFields(hero: DBHomepageHeroContent): HeroFields {
  return {
    eyebrow: hero.eyebrow,
    headline_line_one: hero.headline_line_one,
    headline_line_two: hero.headline_line_two,
    intro: hero.intro,
    primary_cta_label: hero.primary_cta_label,
    primary_cta_href: hero.primary_cta_href,
    secondary_cta_label: hero.secondary_cta_label,
    secondary_cta_href: hero.secondary_cta_href,
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
  const club = useClubContext();
  // `academy@1`'s homepage mounts PhotoSlideshow and BehindTheRose but neither
  // renders anything for this template: the slideshow has no photos and the
  // Behind the Rose singleton has no row. Editing them here could only ever
  // create content the club can never see — and saving would have written Rose
  // City's default video and copy into this club's row — so both tabs, both
  // preview blocks, and both writes are hidden for academy@1. Every other
  // template keeps the four-tab editor unchanged.
  const hidesLegacyHomepageSections =
    club.presentationTemplateKey === "academy@1";
  // editorial@1 (Lions) has no "behind the rose" section type in
  // templateRegistry.supportedSections, so its public homepage never renders
  // this content. Filtering it out of the tab order itself (not just the
  // rendered tab list) keeps slide-direction/active-tab indexing correct even
  // if "behind" was ever the active tab.
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const tabOrder = isEditorial
    ? ADMIN_TAB_ORDER.filter((tab) => tab !== "behind")
    : ADMIN_TAB_ORDER;
  const hidesBehindTheRoseSection = hidesLegacyHomepageSections || isEditorial;
  const [activeTab, setActiveTab] = useState<AdminTab>("hero");
  const [tabDirection, setTabDirection] = useState<SlidingPanelDirection>(1);
  const selectTab = (next: AdminTab) => {
    setActiveTab((current) => {
      if (next === current) return current;
      setTabDirection(
        tabOrder.indexOf(next) > tabOrder.indexOf(current) ? 1 : -1,
      );
      return next;
    });
  };
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
  const [heroFields, setHeroFields] = useState<HeroFields>(EMPTY_HERO_FIELDS);
  const [behindFields, setBehindFields] = useState<BehindFields>(EMPTY_BEHIND_FIELDS);
  // The story band lives in its own table (onzio.homepage_story_section) and is
  // deliberately NOT behind_the_rose_section: both sections are mounted on the
  // same homepage, so sharing one row would render the same copy twice.
  const [storyFields, setStoryFields] = useState<HomepageStoryDraft>(() =>
    emptyHomepageStoryDraft(club.name),
  );
  const [storyErrors, setStoryErrors] = useState<HomepageStoryValidationErrors>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const showFullLoader = useDelayedLoading(loading, 400);
  const [linkablePrograms, setLinkablePrograms] = useState<
    { slug: string; navLabel: string; displayTitle: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Per-section dirty tracking is presentational-only: it drives the rail's
  // dirty-dots and the save button's "which sections changed" copy. Save
  // itself remains a single combined write (see handleSave) — this state
  // never splits it into per-section saves.
  const [dirtySections, setDirtySections] = useState<Set<AdminTab>>(new Set());
  const dirty = dirtySections.size > 0;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchHomepageContent(clubId),
      createClient().from("homepage_story_section").select("*").limit(1),
      createClient()
        .from("programs")
        .select("slug, nav_label, display_title")
        .eq("status", "active")
        .order("sort_order", { ascending: true }),
    ])
      .then(([
        { hero, slideshowPhotos, slideshowSettings, behindTheRose },
        storyResult,
        programsResult,
      ]) => {
        if (storyResult.error) throw new Error(storyResult.error.message);
        if (programsResult.error) throw new Error(programsResult.error.message);
        setLinkablePrograms(
          (programsResult.data ?? []).map((row: { slug: string; nav_label: string; display_title: string }) => ({
            slug: row.slug,
            navLabel: row.nav_label,
            displayTitle: row.display_title,
          })),
        );
        setStoryFields(
          homepageStoryToDraft(
            ((storyResult.data ?? []) as DBHomepageStorySection[])[0] ?? null,
            club.name,
          ),
        );
        setStoryErrors({});
        setOriginalPhotos(slideshowPhotos);
        setDraftPhotos(
          slideshowPhotos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            alt: photo.alt,
          })),
        );
        setSlideshowFields({ season_label: slideshowSettings.season_label });
        setHeroFields(heroContentToFields(hero));
        setBehindFields(behindSectionToFields(behindTheRose));
        setDirtySections(new Set());
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load homepage content");
      })
      .finally(() => setLoading(false));
  }, [club.name, clubId]);

  function markDirty(section: AdminTab) {
    setDirtySections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
    setSaved(false);
  }

  function setBehindField(field: TextBehindField, value: string) {
    setBehindFields((current) => ({ ...current, [field]: value }));
    markDirty("behind");
  }

  function setHeroField(field: keyof HeroFields, value: string) {
    setHeroFields((current) => ({ ...current, [field]: value }));
    markDirty("hero");
  }

  function setStoryField(
    field: Exclude<keyof HomepageStoryDraft, "visible">,
    value: string,
  ) {
    setStoryFields((current) => ({ ...current, [field]: value }));
    setStoryErrors((current) => ({ ...current, [field]: undefined }));
    markDirty("story");
  }

  function setSlideshowField(field: keyof SlideshowFields, value: string) {
    setSlideshowFields((current) => ({ ...current, [field]: value }));
    markDirty("slideshow");
  }

  function setPhotoAlt(index: number, value: string) {
    setDraftPhotos((current) =>
      current.map((photo, photoIndex) =>
        photoIndex === index ? { ...photo, alt: value } : photo,
      ),
    );
    markDirty("slideshow");
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setDraftPhotos((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    markDirty("slideshow");
  }

  async function removePhoto(index: number) {
    const photo = draftPhotos[index];
    setDraftPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    markDirty("slideshow");

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
    markDirty("slideshow");
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
    }
  }

  async function handleSave() {
    const cleanedHeroFields = {
      eyebrow: heroFields.eyebrow.trim(),
      headline_line_one: heroFields.headline_line_one.trim(),
      headline_line_two: heroFields.headline_line_two.trim(),
      intro: heroFields.intro.trim(),
      primary_cta_label: heroFields.primary_cta_label.trim(),
      primary_cta_href: heroFields.primary_cta_href.trim(),
      secondary_cta_label: heroFields.secondary_cta_label.trim(),
      secondary_cta_href: heroFields.secondary_cta_href.trim(),
    };
    const cleanedBehindFields = {
      ...behindFields,
      eyebrow: behindFields.eyebrow.trim(),
      title: behindFields.title.trim(),
      description: behindFields.description.trim(),
      video_url: normalizeYouTubeEmbedUrl(behindFields.video_url),
      video_title: behindFields.video_title.trim(),
      caption: behindFields.caption.trim(),
    };

    if (
      !hidesBehindTheRoseSection &&
      cleanedBehindFields.visible &&
      !cleanedBehindFields.video_url
    ) {
      setError("Add a video URL or turn off Behind the Rose.");
      return;
    }

    const storyValidation = validateHomepageStoryDraft(storyFields);
    if (Object.keys(storyValidation).length > 0) {
      setStoryErrors(storyValidation);
      selectTab("story");
      setError("Review the highlighted Story fields before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error: heroError } = await supabase
        .from("homepage_hero_content")
        .upsert([{
          ...cleanedHeroFields,
          updated_at: new Date().toISOString(),
        }]);
      if (heroError) throw new Error(heroError.message);

      if (!hidesLegacyHomepageSections) {
        const { error: slideshowSettingsError } = await supabase
          .from("homepage_slideshow_settings")
          .upsert([{
            id: 1,
            season_label: slideshowFields.season_label.trim(),
            updated_at: new Date().toISOString(),
          }]);
        if (slideshowSettingsError) throw new Error(slideshowSettingsError.message);
      }

      if (!hidesBehindTheRoseSection) {
        const { error: behindError } = await supabase
          .from("behind_the_rose_section")
          .upsert([{
            id: 1,
            ...cleanedBehindFields,
            updated_at: new Date().toISOString(),
          }]);
        if (behindError) throw new Error(behindError.message);
      }

      const { data: storyRow, error: storyError } = await supabase
        .from("homepage_story_section")
        .upsert(buildHomepageStoryMutationPayload(storyFields))
        .select("*")
        .single();
      if (storyError) throw new Error(storyError.message);
      if (storyRow) {
        setStoryFields(
          homepageStoryToDraft(storyRow as DBHomepageStorySection, club.name),
        );
      }

      const { toDelete, toInsert, toUpdate } = hidesLegacyHomepageSections
        ? { toDelete: [], toInsert: [], toUpdate: [] }
        : diffHomepageSlideshowPhotos(originalPhotos, draftPhotos);

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
      setHeroFields(heroContentToFields(fresh.hero));
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
  const storyDefaults = defaultHomepageStoryContent(club.name);

  // Rail items follow tabOrder (already template-filtered — see isEditorial
  // above) so slide-direction indexing and rail ordering never diverge.
  // slideshow/behind additionally carry `hidden` for academy@1 (and behind
  // for editorial@1 via hidesBehindTheRoseSection), which keeps them out of
  // the rail and the DOM entirely, matching the old tab-pill filter.
  // count/tag surface each section's own state at a glance in the rail —
  // slideshow shows how many of the 6 photo slots are filled, and story /
  // behind show whether the section is currently visible on the public
  // homepage (independent of the rail's dirty dot, which only reflects
  // unsaved edits).
  const sectionItems: AdminSectionRailItem[] = tabOrder.map((tab) => ({
    id: tab,
    label: TAB_LABELS[tab],
    dirty: dirtySections.has(tab),
    count:
      tab === "slideshow"
        ? `${draftPhotos.length}/${MAX_HOMEPAGE_SLIDESHOW_PHOTOS}`
        : undefined,
    tag:
      tab === "story"
        ? storyFields.visible
          ? "Visible"
          : "Hidden"
        : tab === "behind"
          ? behindFields.visible
            ? "Visible"
            : "Hidden"
          : undefined,
    hidden:
      tab === "slideshow"
        ? hidesLegacyHomepageSections
        : tab === "behind"
          ? hidesBehindTheRoseSection
          : false,
  }));

  // The rail lists which sections changed; the header button stays a flat
  // "Save Homepage" (see the "Unsaved changes in …" status beside it below)
  // rather than folding the list into the button label.
  const changedSectionLabels = tabOrder
    .filter((tab) => dirtySections.has(tab))
    .map((tab) => TAB_LABELS[tab]);

  return (
    <AdminPage className="overflow-x-clip">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        eyebrow="Public website"
        title="Homepage"
        description={
          hidesLegacyHomepageSections
            ? "Manage the homepage hero and the story section beside your club video."
            : "Manage homepage slideshow photos and the Behind the Rose video section."
        }
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
                    Unsaved changes in {changedSectionLabels.join(", ")}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="rounded-lg bg-primary px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <AdminLoadingDots className="mr-2" />}
                {saving ? "Saving…" : "Save Homepage"}
              </button>
            </>
          ) : undefined
        }
      />

      {loading ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading homepage" />
        ) : (
          <div
            className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,26rem)]"
            role="status"
            aria-label="Loading homepage"
          >
            <div className="flex flex-col gap-2 self-start">
              <Skeleton className="h-9 w-full rounded-lg" />
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
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,26rem)]">
          <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
            <AdminSectionRail
              items={sectionItems}
              value={activeTab}
              onChange={(id) => selectTab(id as AdminTab)}
            />
            <p className="font-body rounded-xl border border-border bg-card px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
              One Save Homepage button covers every section below — the dot
              marks which one you changed.
            </p>
          </div>

          <AdminPanel className="self-start p-4 sm:p-5">
            <SlidingPanel activeKey={activeTab} direction={tabDirection}>
            {activeTab === "hero" && (
              <div className="space-y-4">
                <SectionHeader
                  title="Hero"
                  description="The band at the very top of your homepage"
                />
                <Field label="Eyebrow">
                  <input
                    value={heroFields.eyebrow}
                    onChange={(event) => setHeroField("eyebrow", event.target.value)}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Headline Line One">
                    <input
                      value={heroFields.headline_line_one}
                      onChange={(event) => setHeroField("headline_line_one", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Headline Line Two">
                    <input
                      value={heroFields.headline_line_two}
                      onChange={(event) => setHeroField("headline_line_two", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                </div>
                <Field label="Intro">
                  <Textarea
                    value={heroFields.intro}
                    onChange={(event) => setHeroField("intro", event.target.value)}
                    rows={4}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Primary Button">
                    <input
                      value={heroFields.primary_cta_label}
                      onChange={(event) => setHeroField("primary_cta_label", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Primary Link">
                    <NativeSelect
                      value={heroFields.primary_cta_href}
                      onChange={(event) => setHeroField("primary_cta_href", event.target.value)}
                    >
                      {siteRouteOptionsWithFallback(linkablePrograms, heroFields.primary_cta_href).map(
                        (option: SiteRouteOption) => (
                          <NativeSelectOption key={option.href} value={option.href}>
                            {option.label}
                          </NativeSelectOption>
                        ),
                      )}
                    </NativeSelect>
                  </Field>
                  <Field label="Secondary Button">
                    <input
                      value={heroFields.secondary_cta_label}
                      onChange={(event) => setHeroField("secondary_cta_label", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Secondary Link">
                    <NativeSelect
                      value={heroFields.secondary_cta_href}
                      onChange={(event) => setHeroField("secondary_cta_href", event.target.value)}
                    >
                      {siteRouteOptionsWithFallback(linkablePrograms, heroFields.secondary_cta_href).map(
                        (option: SiteRouteOption) => (
                          <NativeSelectOption key={option.href} value={option.href}>
                            {option.label}
                          </NativeSelectOption>
                        ),
                      )}
                    </NativeSelect>
                  </Field>
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  Both links pick from your live site routes, so a button can
                  never point at a page that does not exist.
                </p>
              </div>
            )}

            {activeTab === "slideshow" && (
              <div>
                <SectionHeader
                  title="Homepage Slideshow"
                  description="Up to 6 ordered photos. Remove one before adding another."
                  trailing={
                    <span className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {draftPhotos.length}/{MAX_HOMEPAGE_SLIDESHOW_PHOTOS}
                    </span>
                  }
                />

                <Field label="Slideshow Label" help="Shown in the bottom-left corner of the public slideshow.">
                  <input
                    value={slideshowFields.season_label}
                    onChange={(event) => setSlideshowField("season_label", event.target.value)}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {draftPhotos.map((photo, index) => {
                    const missingAlt = !photo.alt.trim();
                    return (
                    <div key={photo.id ?? photo.url} className="min-w-0">
                      <div
                        className="group relative aspect-video w-full overflow-hidden rounded-lg border border-border"
                      >
                        <Image
                          src={photo.url}
                          alt={photo.alt || `Homepage slide ${index + 1}`}
                          fill
                          sizes="220px"
                          className="object-cover"
                        />
                        {missingAlt && (
                          <span
                            title="Missing alt text"
                            aria-label="Missing alt text"
                            className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning text-warning-foreground"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void removePhoto(index)}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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
                        aria-invalid={missingAlt || undefined}
                        className={`mt-2 ${ADMIN_INPUT_CLASS}`}
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
                    );
                  })}

                  <FileUpload
                    className="col-span-2 sm:col-span-4"
                    label="Add homepage slideshow photos"
                    accept="image/*"
                    multiple
                    onUpload={(files) => void handleUpload(files)}
                    uploading={uploading}
                    disabled={!canAddHomepageSlideshowPhoto(draftPhotos.length)}
                  />
                </div>

                {!canAddHomepageSlideshowPhoto(draftPhotos.length) && (
                  <p className="font-body mt-2 text-xs text-muted-foreground">
                    {MAX_HOMEPAGE_SLIDESHOW_PHOTOS} photo max.
                  </p>
                )}
              </div>
            )}

            {activeTab === "story" && (
              <div className="space-y-4">
                <SectionHeader
                  title="Story"
                  description="Beside the club video on your homepage"
                />
                <p className="font-body text-xs text-muted-foreground">
                  Every field below starts filled in with the standard wording
                  — edit it, or clear a field to keep it updating
                  automatically if the standard wording ever changes. The
                  video itself is set by Onzio.
                </p>

                <label className="flex items-center justify-between gap-4 rounded-lg bg-card p-3">
                  <span>
                    <span className="font-display block text-xs uppercase tracking-widest text-foreground">
                      Visible on homepage
                    </span>
                    <span className="font-body mt-1 block text-xs text-muted-foreground">
                      Turn off to hide the section without deleting its saved content.
                    </span>
                  </span>
                  <Checkbox
                    checked={storyFields.visible}
                    onCheckedChange={(checked) => {
                      setStoryFields((current) => ({
                        ...current,
                        visible: checked,
                      }));
                      markDirty("story");
                    }}
                    className="size-5"
                  />
                </label>

                <Field label="Heading" help={storyErrors.heading}>
                  <input
                    value={storyFields.heading}
                    onChange={(event) => setStoryField("heading", event.target.value)}
                    maxLength={HOMEPAGE_STORY_LIMITS.heading}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
                <Field label="First Paragraph" help={storyErrors.bodyPrimary}>
                  <Textarea
                    value={storyFields.bodyPrimary}
                    onChange={(event) => setStoryField("bodyPrimary", event.target.value)}
                    maxLength={HOMEPAGE_STORY_LIMITS.bodyPrimary}
                    rows={5}
                    aria-invalid={Boolean(storyErrors.bodyPrimary)}
                  />
                </Field>
                <Field label="Second Paragraph" help={storyErrors.bodySecondary}>
                  <Textarea
                    value={storyFields.bodySecondary}
                    onChange={(event) => setStoryField("bodySecondary", event.target.value)}
                    maxLength={HOMEPAGE_STORY_LIMITS.bodySecondary}
                    rows={4}
                    aria-invalid={Boolean(storyErrors.bodySecondary)}
                  />
                </Field>
                <Field label="Button Label" help={storyErrors.ctaLabel}>
                  <input
                    value={storyFields.ctaLabel}
                    onChange={(event) => setStoryField("ctaLabel", event.target.value)}
                    maxLength={HOMEPAGE_STORY_LIMITS.ctaLabel}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
              </div>
            )}

            {activeTab === "behind" && (
              <div className="space-y-4">
                <SectionHeader title="Behind the Rose" description="Video feature section" />
                <label className="flex items-center justify-between gap-4 rounded-lg bg-card p-3">
                  <span>
                    <span className="font-display block text-xs uppercase tracking-widest text-foreground">
                      Visible on homepage
                    </span>
                    <span className="font-body mt-1 block text-xs text-muted-foreground">
                      Turn off to hide the section without deleting its saved content.
                    </span>
                  </span>
                  <Checkbox
                    checked={behindFields.visible}
                    onCheckedChange={(checked) => {
                      setBehindFields((current) => ({ ...current, visible: checked }));
                      markDirty("behind");
                    }}
                    className="size-5"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Eyebrow">
                    <input
                      value={behindFields.eyebrow}
                      onChange={(event) => setBehindField("eyebrow", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Title">
                    <input
                      value={behindFields.title}
                      onChange={(event) => setBehindField("title", event.target.value)}
                      className={ADMIN_INPUT_CLASS}
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <Textarea
                    value={behindFields.description}
                    onChange={(event) => setBehindField("description", event.target.value)}
                    rows={4}
                  />
                </Field>
                <Field label="Video URL" help="Paste a YouTube watch, short, or embed URL.">
                  <input
                    type="url"
                    value={behindFields.video_url}
                    onChange={(event) => setBehindField("video_url", event.target.value)}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
                <Field label="Video Title">
                  <input
                    value={behindFields.video_title}
                    onChange={(event) => setBehindField("video_title", event.target.value)}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
                <Field label="Caption">
                  <input
                    value={behindFields.caption}
                    onChange={(event) => setBehindField("caption", event.target.value)}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
              </div>
            )}
            </SlidingPanel>

            {error && (
              <p className="font-body mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </AdminPanel>

          <AdminPanel className="overflow-hidden p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
            <div className="mb-4">
              <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Homepage Preview
              </p>
            </div>

            <div
              className="mb-6 overflow-hidden rounded-lg border border-border p-5 sm:p-7"
              style={{
                background: "linear-gradient(132deg, #1B2958 0%, #1B2958 48%, #AD3234 142%)",
              }}
            >
              {heroFields.eyebrow && (
                <p className="font-display mb-3 text-xs font-bold uppercase tracking-widest text-white/60">
                  {heroFields.eyebrow}
                </p>
              )}
              <h2 className="font-display text-3xl font-black not-italic uppercase leading-none text-white sm:text-5xl">
                <span className="block">{heroFields.headline_line_one || "Homepage hero"}</span>
                {heroFields.headline_line_two && (
                  <span className="block text-[#F0F0F0]">{heroFields.headline_line_two}</span>
                )}
              </h2>
              {heroFields.intro && (
                <p className="font-body mt-4 max-w-xl text-sm leading-relaxed text-white/70">
                  {heroFields.intro}
                </p>
              )}
            </div>

            {hidesLegacyHomepageSections ? (
              <div
                className="overflow-hidden rounded-lg p-6 sm:p-8"
                style={{ backgroundColor: "#F9FAFD" }}
              >
                <p
                  className="font-display mb-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#6B7E94" }}
                >
                  Story section
                </p>
                <h3
                  className="font-display text-3xl font-black uppercase italic leading-none sm:text-4xl"
                  style={{ color: "#1E3653" }}
                >
                  {storyFields.heading || storyDefaults.heading}
                </h3>
                <p
                  className="font-body mt-4 text-sm leading-relaxed"
                  style={{ color: "#51667E" }}
                >
                  {storyFields.bodyPrimary || storyDefaults.bodyPrimary}
                </p>
                {(storyFields.bodySecondary || storyDefaults.bodySecondary) && (
                  <p
                    className="font-body mt-3 text-sm leading-relaxed"
                    style={{ color: "#51667E" }}
                  >
                    {storyFields.bodySecondary || storyDefaults.bodySecondary}
                  </p>
                )}
                {(storyFields.ctaLabel || storyDefaults.ctaLabel) && (
                  <span
                    className="font-display mt-6 inline-block px-6 py-3 text-xs font-bold uppercase text-white"
                    style={{ backgroundColor: "#FF1616" }}
                  >
                    {storyFields.ctaLabel || storyDefaults.ctaLabel}
                  </span>
                )}
                {!storyFields.visible && (
                  <p
                    className="font-display mt-6 text-xs uppercase tracking-widest"
                    style={{ color: "#6B7E94" }}
                  >
                    Hidden — this section is turned off and will not appear on
                    your homepage.
                  </p>
                )}
              </div>
            ) : (
            <>
            {/* editorial@1's public slideshow is EditorialMatchdaySlideshow, so
                the preview mounts that real component (scaled to the admin
                column) instead of a hand-rolled still of draftPhotos[0]. Every
                other template still renders the classic PhotoSlideshow, whose
                still below is left untouched. */}
            {isEditorial ? (
              <ScaledSlideshowPreview photos={draftPhotos} />
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-border">
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
                        <div className="h-0.5 w-8 bg-destructive" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center">
                      <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                        Slideshow hidden until a photo is added.
                      </p>
                    </div>
                  )}
                </div>

                {/* The season label is a classic-template caption; the
                    editorial slideshow never renders it. */}
                <p className="font-display mt-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {slideshowFields.season_label}
                </p>
              </>
            )}

            {!isEditorial && behindFields.visible && (
              <div className="mt-6 rounded-lg bg-background p-5 text-center">
                <p className="font-display mb-2 text-xs font-bold uppercase tracking-widest text-destructive">
                  {behindFields.eyebrow}
                </p>
                <h2 className="font-display text-3xl font-black uppercase leading-none text-foreground sm:text-5xl">
                  {behindFields.title}
                </h2>
                <p className="font-body mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
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
                <p className="font-display mt-4 text-xs uppercase tracking-widest text-muted-foreground">
                  {behindFields.caption}
                </p>
              </div>
            )}
            </>
            )}
          </AdminPanel>
        </div>
      )}
    </AdminPage>
  );
}

/**
 * Full-bleed title/description strip pinned to the top of a section's
 * editor panel, matching the mockup's per-section header row (each section
 * — Hero, Slideshow, Story, Behind the Rose — carries a short name and a
 * one-line description of what it edits, separated from the fields below
 * by a border). `trailing` is used by Slideshow for its "n/6" count.
 */
function SectionHeader({
  title,
  description,
  trailing,
}: {
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-foreground">
          {title}
        </p>
        {description && (
          <p className="font-body mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {trailing}
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
      <span className={ADMIN_LABEL_CLASS}>
        {label}
      </span>
      {children}
      {help && (
        <span className="font-body mt-1 block text-xs text-muted-foreground">
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
      className="flex h-7 flex-1 items-center justify-center rounded-md bg-card text-xs text-muted-foreground transition-opacity hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
