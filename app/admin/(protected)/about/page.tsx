"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { AboutContentSkeleton } from "@/components/admin/AdminContentSkeletons";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import AboutPageCanvas, { type AboutCanvasTarget } from "@/components/admin/about/AboutPageCanvas";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
import type { DBAboutPageContent, DBClubLogoPageContent, DBSiteSponsorLogo } from "@/lib/db-types";
import type { SiteRouteOption } from "@/lib/site-routes";
import { aboutPageEditableContent, prepareAboutPageSave } from "@/lib/about-editor/save";
import {
  aboutStoragePathFromPublicUrl,
  EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT,
  DEFAULT_ABOUT_PAGE_CONTENT,
  DEFAULT_CLUB_LOGO_PAGE_CONTENT,
  normalizeClubLogoColorCards,
  normalizeAboutValues,
  normalizeClubLogoFeatures,
  normalizeStoryParagraphs,
  type AboutValue,
  type ClubLogoFeature,
} from "@/lib/about-content";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import { loadAboutEditor, saveAboutEditor } from "@/lib/about-editor/recovery";
import { aboutEditorSaveSchema, type AboutEditorSaveRequest, type AboutEditorSnapshot } from "@/lib/about-editor/contract";
import { newAboutValue, newLogoFeature, newLogoColorCard, removeCollectionItem } from "@/lib/about-editor/collections";
import PageEditorInspector from "@/components/admin/PageEditorInspector";
import { usePageEditorScrollport } from "@/components/admin/usePageEditorScrollport";
import { createClient } from "@/lib/admin-client";
import "@/components/admin/about/about-editor.css";

type SectionId = "hero" | "story" | "values" | "closing" | "images" | "features" | "colors";

const ABOUT_SECTIONS: SectionId[] = ["hero", "story", "values", "closing"];
const LOGO_SECTIONS: SectionId[] = ["images", "features", "colors"];
const SECTION_ORDER: SectionId[] = [...ABOUT_SECTIONS, ...LOGO_SECTIONS];
const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Page heading",
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
    story_paragraphs: normalizeStoryParagraphs(content.story_paragraphs, []),
    values: normalizeAboutValues(content.values, []),
  };
}

function toLogoDraft(content: DBClubLogoPageContent): DBClubLogoPageContent {
  return {
    ...content,
    features: normalizeClubLogoFeatures(content.features, []),
    color_cards: normalizeClubLogoColorCards(content.color_cards, []),
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
  const [pageChoice, setPageChoice] = useState<"about" | "logo">("about");
  const [selectedTarget, setSelectedTarget] = useState<AboutCanvasTarget | null>(null);
  const [phonePreview, setPhonePreview] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setPhonePreview(true);
  }, []);
  const [selectedLogoImage, setSelectedLogoImage] = useState(0);
  const [selectedLogoColor, setSelectedLogoColor] = useState(0);
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
  const [pendingDeleteUrls, setPendingDeleteUrls] = useState<{ about: string[]; logo: string[] }>({ about: [], logo: [] });
  const [snapshots, setSnapshots] = useState<Partial<Record<"about" | "logo", AboutEditorSnapshot>>>({});
  const [pendingOperations, setPendingOperations] = useState<Partial<Record<"about" | "logo", AboutEditorSaveRequest>>>({});
  const [conflictedPages, setConflictedPages] = useState<Set<"about" | "logo">>(new Set());
  const [cleanupOperations, setCleanupOperations] = useState<Partial<Record<"about" | "logo", string>>>({});
  const draftLocked = Boolean(pendingOperations[pageChoice]) || conflictedPages.has(pageChoice);
  const [sponsors, setSponsors] = useState<DBSiteSponsorLogo[]>([]);
  const [availableDestinations, setAvailableDestinations] = useState<SiteRouteOption[]>([]);
  const [destinationsLoaded, setDestinationsLoaded] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [destinationAttempt, setDestinationAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollport = usePageEditorScrollport(767, !loading);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Section edits contribute to the dirty state of their public page.
  // Switching pages preserves both drafts; Save writes the selected page.
  const [dirtySections, setDirtySections] = useState<Set<SectionId>>(
    new Set(),
  );
  const dirtyAbout = ABOUT_SECTIONS.some((section) => dirtySections.has(section));
  const dirtyLogo = LOGO_SECTIONS.some((section) => dirtySections.has(section));
  const dirty = pageChoice === "about" ? dirtyAbout : dirtyLogo;
  const destinationAvailable = isAcademy || availableDestinations.some((option) => option.href === aboutDraft.closing_cta_href);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<UploadTarget | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    Promise.all([
      loadAboutEditor("about"),
      hasClubLogoPage ? loadAboutEditor("logo") : Promise.resolve(null),
      fetchSiteSponsorLogos("carousel", clubId),
    ])
      .then(([about, logo, nextSponsors]) => {
        const nextAbout = toAboutDraft({ ...EMPTY_ABOUT_PAGE_CONTENT, ...about.content } as DBAboutPageContent);
        const nextLogo = toLogoDraft({ ...EMPTY_CLUB_LOGO_PAGE_CONTENT, ...logo?.content } as DBClubLogoPageContent);
        setSnapshots({ about, ...(logo ? { logo } : {}) });
        setAboutDraft(nextAbout);
        setLogoDraft(nextLogo);
        setSponsors(nextSponsors);
        setPendingDeleteUrls({ about: [], logo: [] });
        setDirtySections(new Set());
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load about content");
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, [clubId, loadAttempt, hasClubLogoPage]);

  useEffect(() => {
    if (isAcademy) {
      setAvailableDestinations([]);
      setDestinationsLoaded(true);
      setDestinationError(null);
      return;
    }
    let active = true;
    setDestinationsLoaded(false);
    setDestinationError(null);
    fetch("/api/admin/about-destinations", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Available button destinations could not be loaded");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("options" in result) || !Array.isArray(result.options)) {
        throw new Error("Available button destinations could not be loaded");
      }
      return result.options.filter((option: unknown): option is SiteRouteOption =>
        !!option && typeof option === "object" && "href" in option && typeof option.href === "string" &&
        "label" in option && typeof option.label === "string",
      );
    }).then((options) => {
      if (!active) return;
      setAvailableDestinations(options);
      setDestinationsLoaded(true);
    }).catch((caught: unknown) => {
      if (active) setDestinationError(caught instanceof Error ? caught.message : "Available pages could not be loaded");
    });
    return () => { active = false; };
  }, [clubId, isAcademy, destinationAttempt]);

  function markDirty(section: SectionId) {
    setDirtySections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
    setSaved(false);
  }

  function queueReplacedUrl(url: string, page: "about" | "logo") {
    if (!aboutStoragePathFromPublicUrl(url)) return;
    setPendingDeleteUrls((current) => current[page].includes(url)
      ? current
      : { ...current, [page]: [...current[page], url] });
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
        queueReplacedUrl(aboutDraft.feature_image_url, "about");
        setAboutDraft((current) => ({ ...current, feature_image_url: nextUrl }));
        dirtySection = "story";
      }
      if (target.kind === "logoAnnotated") {
        queueReplacedUrl(logoDraft.annotated_image_url, "logo");
        setLogoDraft((current) => ({ ...current, annotated_image_url: nextUrl }));
        dirtySection = "images";
      }
      if (target.kind === "logoMap") {
        queueReplacedUrl(logoDraft.map_image_url, "logo");
        setLogoDraft((current) => ({ ...current, map_image_url: nextUrl }));
        dirtySection = "images";
      }
      if (target.kind === "logoColorCard") {
        const replacedUrl = logoDraft.color_cards[target.index]?.image_url;
        if (replacedUrl && aboutStoragePathFromPublicUrl(replacedUrl) !== stableColorPath) {
          queueReplacedUrl(replacedUrl, "logo");
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
        if (replacedUrl) queueReplacedUrl(replacedUrl, "logo");
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
        if (replacedUrl) queueReplacedUrl(replacedUrl, "logo");
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

  function setAboutField<K extends keyof DBAboutPageContent>(field: K, value: DBAboutPageContent[K], section: SectionId) {
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

  function selectPage(next: "about" | "logo") {
    if (saving || uploading || next === pageChoice || (next === "logo" && !hasClubLogoPage)) return;
    setPageChoice(next);
    setSelectedTarget(null);
    selectSection(next === "about" ? "story" : "images");
    setError(null);
    setSaved(false);
  }

  function selectCanvasTarget(target: AboutCanvasTarget, index: number) {
    setSelectedTarget(target);
    if (target === "features") setSelectedLogoFeature(index);
    if (target === "colors") setSelectedLogoColor(index);
    if (target === "images") setSelectedLogoImage(index);
    if (target !== "fixed-hero" && target !== "sponsors") selectSection(target);
  }

  useEffect(() => {
    if (!dirtyAbout && !dirtyLogo && Object.keys(pendingOperations).length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyAbout, dirtyLogo, pendingOperations]);

  function acceptSnapshot(snapshot: AboutEditorSnapshot) {
    const page = snapshot.page;
    setSnapshots(current => ({ ...current, [page]: snapshot }));
    if (page === "about") setAboutDraft(toAboutDraft({ ...EMPTY_ABOUT_PAGE_CONTENT, ...snapshot.content } as DBAboutPageContent));
    else setLogoDraft(toLogoDraft({ ...EMPTY_CLUB_LOGO_PAGE_CONTENT, ...snapshot.content } as DBClubLogoPageContent));
    setDirtySections(current => new Set([...current].filter(section => page === "about" ? !ABOUT_SECTIONS.includes(section) : !LOGO_SECTIONS.includes(section))));
    setPendingDeleteUrls(current => ({ ...current, [page]: [] }));
    setPendingOperations(current => { const next = { ...current }; delete next[page]; return next; });
    setConflictedPages(current => new Set([...current].filter(value => value !== page)));
  }

  async function reloadLatestPage() {
    if (!window.confirm("Replace this page's draft with the latest saved page? The other page's draft will stay here.")) return;
    setSaving(true);
    try { acceptSnapshot(await loadAboutEditor(pageChoice)); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Latest page could not be loaded."); }
    finally { setSaving(false); }
  }

  async function retryCleanup() {
    const operation = cleanupOperations[pageChoice]; if (!operation) return;
    setSaving(true);
    try {
      const snapshot = await loadAboutEditor(pageChoice, operation);
      if (snapshot.operation?.status !== "committed") throw new Error("Cleanup could not be confirmed. Try again.");
      if (!snapshot.operation.receipt.cleanupPending) {
        setCleanupOperations(current => { const next = { ...current }; delete next[pageChoice]; return next; }); setError(null);
      } else setError("Page saved. Old image cleanup is still pending; retry cleanup when ready.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Cleanup could not be confirmed."); }
    finally { setSaving(false); }
  }

  async function handleSave() {
    if (saving || uploading || conflictedPages.has(pageChoice)) return;
    const pending = pendingOperations[pageChoice];
    if (!pending && pageChoice === "about" && !isAcademy && (!destinationsLoaded || !destinationAvailable)) {
      setError("Choose a page available to this club for the closing button before saving."); return;
    }
    const snapshot = snapshots[pageChoice]; if (!snapshot) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const prepared = prepareAboutPageSave({ page: pageChoice, about: aboutDraft, logo: logoDraft, academy: isAcademy, now: new Date().toISOString() });
      const request = pending ?? aboutEditorSaveSchema.parse({ page: prepared.page, content: aboutPageEditableContent(prepared),
        operationId: crypto.randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision,
        retiredMediaUrls: pendingDeleteUrls[pageChoice] });
      const outcome = await saveAboutEditor(request);
      if (outcome.status === "committed") {
        acceptSnapshot(outcome.snapshot); setSaved(true); setTimeout(() => setSaved(false), 3000);
        if (outcome.snapshot.cleanupPending) {
          setCleanupOperations(current => ({ ...current, [request.page]: request.operationId }));
          setError("Page saved. Old image cleanup is pending; retry cleanup when ready.");
        }
      } else if (outcome.status === "uncertain") {
        setPendingOperations(current => ({ ...current, [request.page]: outcome.request })); setError(outcome.message);
      } else {
        setPendingOperations(current => { const next = { ...current }; delete next[request.page]; return next; });
        if (outcome.status === "conflict") setConflictedPages(current => new Set([...current, request.page]));
        setError(outcome.message);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review the page fields and try again."); }
    finally { setSaving(false); }
  }

  const saveDisabled = saving || uploading || loadFailed || conflictedPages.has(pageChoice) || (!dirty && !pendingOperations[pageChoice]) || (!pendingOperations[pageChoice] && pageChoice === "about" && !isAcademy && (!destinationsLoaded || !destinationAvailable));
  const isLogoSection = pageChoice === "logo";

  return (
    <div ref={scrollport.workspace} style={{ maxHeight: scrollport.maxHeight }} className="min-w-0 overflow-y-auto overscroll-y-contain md:overflow-visible">
    <AdminPage className="aep-root overflow-x-clip [&>*]:shrink-0">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        title="About"
        description="Tap a section of the public page to edit it. Save changes to one page at a time."
        actions={
          !loading ? (
            <>
              {(dirtyAbout || dirtyLogo) && (
                <div className="flex items-center gap-2 border-r border-border pr-3">
                  <span
                    className="h-2 w-2 flex-none rounded-full bg-warning"
                    aria-hidden="true"
                  />
                  <span className="font-body whitespace-nowrap text-sm text-muted-foreground">
                    {dirtyAbout && dirtyLogo ? "Both pages have unsaved changes" : `${dirtyAbout ? "About" : "Club Logo"} has unsaved changes`}
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
                {saving ? "Saving..." : uploading ? "Uploading..." : pendingOperations[pageChoice] ? "Retry exact save" : `Save ${isLogoSection ? "Club Logo" : "About"}`}
              </button>
            </>
          ) : undefined
        }
      />

      <nav className="aep-page-nav" aria-label="Public page">
        <button type="button" aria-pressed={pageChoice === "about"} onClick={() => selectPage("about")}>About page{dirtyAbout ? " •" : ""}</button>
        {hasClubLogoPage && <button type="button" aria-pressed={pageChoice === "logo"} onClick={() => selectPage("logo")}>Club Logo page{dirtyLogo ? " •" : ""}</button>}
      </nav>

      {loading ? (
        <AboutContentSkeleton hasClubLogoPage={hasClubLogoPage} />
      ) : loadFailed ? (
        <AdminPanel className="aep-load-error">
          <p role="alert">{error ?? "The public page could not be loaded."}</p>
          <button type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Retry loading</button>
        </AdminPanel>
      ) : (
        <div className="aep-layout">
          <section className="aep-canvas" aria-label={`${isLogoSection ? "Club Logo" : "About"} public page canvas`}>
            <div className="aep-canvas-top"><span>{isLogoSection ? "/club/logo" : "/club/about"}</span><div className="aep-device-toggle" aria-label="Preview size"><button type="button" aria-pressed={!phonePreview} onClick={() => setPhonePreview(false)}>Desktop</button><button type="button" aria-pressed={phonePreview} onClick={() => setPhonePreview(true)}>Phone</button></div></div>
            <AboutPageCanvas page={pageChoice} about={aboutDraft} logo={logoDraft} sponsors={sponsors} phone={phonePreview} selected={selectedTarget} onSelect={selectCanvasTarget} />
          </section>

          <PageEditorInspector open={selectedTarget !== null} onClose={() => setSelectedTarget(null)} label="About section tools" breakpoint={767} className="aep-inspector" data-open={selectedTarget !== null}>
            <div className="aep-inspector-head"><div><p className={ADMIN_LABEL_CLASS}>{isLogoSection ? "Club Logo page" : "About page"}</p><h2>{selectedTarget ? selectedTarget === "fixed-hero" ? "Clubhouse heading" : selectedTarget === "sponsors" ? "Proud partners" : SECTION_LABELS[activeSection] : "Select a section"}</h2></div>{selectedTarget && <button type="button" onClick={() => setSelectedTarget(null)}>Done</button>}</div>
            {selectedTarget === null ? <p className="aep-empty">Tap a section in the public page to open its tools.</p> : selectedTarget === "fixed-hero" ? <p className="aep-ownership">This heading is part of the Clubhouse template. Contact Onzio to change its wording.</p> : selectedTarget === "sponsors" ? <div className="aep-ownership"><p>These partners are shared content, managed in Sponsors.</p><a href="/admin/sponsors">Open Sponsors →</a></div> : <fieldset disabled={saving || uploading || draftLocked} className="aep-fields">
            <SlidingPanel activeKey={activeSection} direction={sectionDirection}>
              {activeSection === "hero" && (
                <Field label="Page heading">
                  <input
                    value={aboutDraft.hero_title}
                    onChange={(event) => setAboutField("hero_title", event.target.value, "hero")}
                    className={ADMIN_INPUT_CLASS}
                  />
                </Field>
              )}
              {activeSection === "story" && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
                  <div className="space-y-3">
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
                  <button type="button" className="aep-collection-button" disabled={aboutDraft.values.length >= 24} onClick={() => setAboutField("values", [...aboutDraft.values, newAboutValue()], "values")}>Add value</button>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {aboutDraft.values.map((value, index) => (
                      <div key={index} className="rounded-lg border border-border p-3">
                        <button type="button" className="aep-collection-button" onClick={() => setAboutField("values", removeCollectionItem(aboutDraft.values, index), "values")}>Remove value {index + 1}</button>
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
                      <Field label="Button Goes To" flush>
                        <NativeSelect
                          aria-label="Button goes to"
                          value={aboutDraft.closing_cta_href}
                          onChange={(event) => setAboutField("closing_cta_href", event.target.value, "closing")}
                          className={ADMIN_INPUT_CLASS}
                          disabled={!destinationsLoaded}
                        >
                          {!destinationAvailable && <NativeSelectOption value={aboutDraft.closing_cta_href} disabled>
                            Current link unavailable — choose a page
                          </NativeSelectOption>}
                          {availableDestinations.map((option) => <NativeSelectOption key={option.href} value={option.href}>{option.label}</NativeSelectOption>)}
                        </NativeSelect>
                        <p className="font-body mt-1 text-xs text-muted-foreground">
                          {destinationAvailable ? `Selected page: ${aboutDraft.closing_cta_href}` : "Choose a page available to this club before saving."}
                        </p>
                        {destinationError && <div className="aep-destination-error"><p role="alert">{destinationError}</p><button type="button" onClick={() => setDestinationAttempt((current) => current + 1)}>Retry pages</button></div>}
                      </Field>
                    )}
                  </div>
                </div>
              )}

              {activeSection === "images" && (
                <div className="grid gap-3">
                  {selectedLogoImage === 0 ? <ImageControl
                    label="Annotated Crest Image"
                    url={logoDraft.annotated_image_url}
                    onReplace={() => openUploader({ kind: "logoAnnotated" })}
                    disabled={uploading || saving}
                    compact
                  /> : <ImageControl
                    label="Map Image"
                    url={logoDraft.map_image_url}
                    onReplace={() => openUploader({ kind: "logoMap" })}
                    disabled={uploading || saving}
                    compact
                  />}
                </div>
              )}

              {activeSection === "features" && (
                <div className="space-y-3">
                  <button type="button" className="aep-collection-button" disabled={logoDraft.features.length >= 24} onClick={() => {
                    setSelectedLogoFeature(logoDraft.features.length); setLogoDraft(current => ({ ...current, features: [...current.features, newLogoFeature()] })); markDirty("features");
                  }}>Add crest feature</button>
                  {logoDraft.features[selectedLogoFeature] && <button type="button" className="aep-collection-button" onClick={() => {
                    const removed = logoDraft.features[selectedLogoFeature];
                    queueReplacedUrl(removed.patch_url, "logo");
                    queueReplacedUrl(removed.icon_url, "logo");
                    setLogoDraft(current => ({ ...current, features: removeCollectionItem(current.features, selectedLogoFeature) })); setSelectedLogoFeature(current => Math.max(0, current - 1)); markDirty("features");
                  }}>Remove crest feature</button>}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {logoDraft.features.map((feature, index) => {
                      const selected = selectedLogoFeature === index;
                      return (
                        <button
                          key={index}
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
                    Add up to six color cards below the club map.
                  </p>
                  <button type="button" className="aep-collection-button" disabled={logoDraft.color_cards.length >= 6} onClick={() => {
                    setSelectedLogoColor(logoDraft.color_cards.length); setLogoDraft(current => ({ ...current, color_cards: [...current.color_cards, newLogoColorCard()] })); markDirty("colors");
                  }}>Add color card</button>
                  <div className="aep-color-choices">{logoDraft.color_cards.map((card, index) => <button type="button" key={index} aria-pressed={index === selectedLogoColor} onClick={() => setSelectedLogoColor(index)}>{card.label || `Color ${index + 1}`}</button>)}</div>
                  {logoDraft.color_cards[selectedLogoColor] && <>
                    <Field label="Color label"><input className={ADMIN_INPUT_CLASS} value={logoDraft.color_cards[selectedLogoColor].label} onChange={event => {
                      setLogoDraft(current => ({ ...current, color_cards: current.color_cards.map((card, index) => index === selectedLogoColor ? { ...card, label: event.target.value } : card) })); markDirty("colors");
                    }} /></Field>
                    <button type="button" className="aep-collection-button" onClick={() => {
                      queueReplacedUrl(logoDraft.color_cards[selectedLogoColor].image_url, "logo");
                      setLogoDraft(current => ({ ...current, color_cards: removeCollectionItem(current.color_cards, selectedLogoColor) })); setSelectedLogoColor(current => Math.max(0, current - 1)); markDirty("colors");
                    }}>Remove color card</button>
                  <ImageControl
                    label={logoDraft.color_cards[selectedLogoColor].label}
                    url={logoDraft.color_cards[selectedLogoColor].image_url}
                    onReplace={() => openUploader({ kind: "logoColorCard", index: selectedLogoColor })}
                    disabled={uploading || saving}
                    compact
                  /></>}
                </div>
              )}
            </SlidingPanel></fieldset>}

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
            {conflictedPages.has(pageChoice) && <button type="button" className="aep-recovery" onClick={() => void reloadLatestPage()} disabled={saving}>Reload latest page</button>}
            {cleanupOperations[pageChoice] && <button type="button" className="aep-recovery" onClick={() => void retryCleanup()} disabled={saving}>Retry image cleanup</button>}
            <div className="aep-inspector-save"><button type="button" onClick={() => void handleSave()} disabled={saveDisabled}>{saving ? "Saving…" : pendingOperations[pageChoice] ? "Retry exact save" : `Save ${isLogoSection ? "Club Logo" : "About"}`}</button></div>
          </PageEditorInspector>
        </div>
      )}
      {!loading && <div ref={scrollport.saveBar} className="aep-mobile-save"><span>{dirty ? "Unsaved changes" : "All changes saved"}</span><button type="button" onClick={() => void handleSave()} disabled={saveDisabled}>{saving ? "Saving…" : pendingOperations[pageChoice] ? "Retry exact save" : `Save ${isLogoSection ? "Club Logo" : "About"}`}</button></div>}
    </AdminPage>
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
      <label className="block">
        <span className={ADMIN_LABEL_CLASS}>{label}</span>
        {children}
      </label>
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
