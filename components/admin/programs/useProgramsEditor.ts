"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSortableList } from "@/components/admin/useSortableList";
import type { AdminSectionRailItem } from "@/components/admin/AdminSectionRail";
import { createClient } from "@/lib/admin-client";
import { submitPageSave } from "@/lib/page-editor-save";
import type { ProgramPageSaveRequest } from "@/lib/program-page-editor/contract";
import type { DBProgram, DBProgramMedia, DBProgramsPageContent } from "@/lib/db-types";
import { buildProgramMutationPayload, buildProgramsPageMutationPayload, emptyProgramDraft, emptyProgramsPageDraft, moveHighlight, moveProgramMedia, programDraftToContent, programMediaToDraft, programsPageToDraft, programToDraft, validateProgramDraft, validateProgramMedia, validateProgramsPageDraft, type ProgramDraft, type ProgramMediaDraft, type ProgramsPageDraft, type ProgramsPageValidationErrors, type ProgramValidationErrors } from "@/lib/program-admin";
import { PROGRAM_MEDIA_LIMITS } from "@/lib/program-content";
import { defaultProgramsPageContent } from "@/lib/programs-page-content";
import { deriveProgramSlug } from "@/lib/slugify";
import type { PublicRegistrationForm } from "@/lib/registration-public";
import type { codeSiteAdminFor } from "@/lib/code-site-admin";
import type { SlidingPanelDirection } from "@/components/ui/sliding-panel";
import { PROGRAM_EDITOR_TAB_ORDER, PROGRAM_FIELD_TABS, PAGE_COPY_SECTION_ORDER, PAGE_COPY_SECTION_LABELS, PAGE_COPY_FIELD_SECTIONS, type MediaRole, type RegistrationFormOption, type ProgramPageView, type SavedProgramPage, type DirectorySaveRequest, type ProgramEditorTab, type PageCopySection } from "./program-editor-types";

type ProgramsPolicy = NonNullable<ReturnType<typeof codeSiteAdminFor>>["programs"];
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
export function useProgramsEditor({ clubId, clubName, programsPolicy, classic = false }: { clubId: string; clubName: string; programsPolicy: ProgramsPolicy; classic?: boolean }) {
  const hidesSlugField = programsPolicy ? !programsPolicy.showSlugField : false;
  // Diverse City's four programs are fixed for this rollout: the club edits
  // them, it does not add new ones. Hiding the creation entry points leaves the
  // create code path (and lib/slugify.ts) intact for every other template, and
  // for this club should it ever be re-enabled.
  const hidesProgramCreation = programsPolicy ? !programsPolicy.allowCreation : false;
  // The words editor (the pathway band, the /programs header, and the closing
  // band) is on wherever a club's site definition says so: Diverse City's is on
  // as of ADMIN-RE-22. A club with the editor off keeps the standard wording
  // (if nothing is ever saved the public pages fall back to their placeholder
  // copy by design), so hiding it is purely subtractive.
  const hidesPageCopyEditor = programsPolicy ? !programsPolicy.showPageCopyEditor : false;
  const [programs, setPrograms] = useState<ProgramDraft[]>([]);
  const directoryDraft = useRef(programs);
  directoryDraft.current = programs;
  const [registrationForms, setRegistrationForms] = useState<RegistrationFormOption[]>([]);
  const [openRegistrationForms, setOpenRegistrationForms] = useState<Record<string, PublicRegistrationForm>>({});
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  // True while a drag-reorder's writes are still in flight (see
  // persistProgramOrder): disables further drags so two reorders can't
  // interleave their per-row writes. The ref mirrors the state
  // synchronously for persistProgramOrder's entry guard.
  const [savedManagement, setSavedManagement] = useState<Array<Pick<ProgramDraft, "id" | "updatedAt" | "sortOrder" | "status">>>([]);
  const confirmedDirectory = useRef(savedManagement);
  const confirmedCopy = useRef(emptyProgramsPageDraft());
  const ownedUploads = useRef(new Map<string, string>());
  const confirmedAssets = useRef(new Set<string>());
  const alive = useRef(true);
  const batch = useRef(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const pendingPickers = useRef(new Set<string>());
  const [pickerPending, setPickerPendingState] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [managementSaving, setManagementSaving] = useState(false);
  const [managementSaved, setManagementSaved] = useState(false);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [uploadingRole, setUploadingRole] = useState<MediaRole | null>(null);
  const [errors, setErrors] = useState<ProgramValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProgramEditorTab>("content");
  const [tabDirection, setTabDirection] = useState<SlidingPanelDirection>(1);
  const selectTab = useCallback((next: ProgramEditorTab) => {
    setActiveTab((current) => {
      if (next === current) return current;
      setTabDirection(
        PROGRAM_EDITOR_TAB_ORDER.indexOf(next) >
          PROGRAM_EDITOR_TAB_ORDER.indexOf(current)
          ? 1
          : -1,
      );
      return next;
    });
  }, []);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pageCopyPanel = useRef<HTMLDivElement>(null);
  // Gallery images live in their own table (onzio.program_media), so they are
  // loaded and saved alongside — not inside — the program row.
  const [gallery, setGallery] = useState<ProgramMediaDraft[]>([]);
  const [galleryByProgram, setGalleryByProgram] = useState<
    Record<string, ProgramMediaDraft[]>
  >({});
  const [removedGalleryIds, setRemovedGalleryIds] = useState<string[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  // The copy wrapped around the programs surfaces is a per-club singleton
  // (onzio.programs_page_content), not part of any one program, so it has its
  // own draft, its own validation, and its own save button.
  const [pageCopy, setPageCopy] = useState<ProgramsPageDraft>(
    emptyProgramsPageDraft,
  );
  const [pageCopyErrors, setPageCopyErrors] =
    useState<ProgramsPageValidationErrors>({});
  // Per-section dirty tracking is presentational-only: it drives the rail's
  // dirty-dots and the save button's "which sections changed" copy. Save
  // itself remains a single combined write (see savePageCopy) — this state
  // never splits it into per-section saves. Matches the pattern piloted on
  // app/admin/(protected)/homepage/page.tsx.
  const [pageCopyDirtySections, setPageCopyDirtySections] = useState<
    Set<PageCopySection>
  >(new Set());
  const pageCopyDirty = pageCopyDirtySections.size > 0;
  const [pageCopySaving, setPageCopySaving] = useState(false);
  const [pageCopySaved, setPageCopySaved] = useState(false);
  const [pageCopyError, setPageCopyError] = useState<string | null>(null);
  const [activePageCopySection, setActivePageCopySection] =
    useState<PageCopySection>("homepageBand");
  const [pageCopyDirection, setPageCopyDirection] =
    useState<SlidingPanelDirection>(1);
  const selectPageCopySection = useCallback((next: PageCopySection) => {
    setActivePageCopySection((current) => {
      if (next === current) return current;
      setPageCopyDirection(
        PAGE_COPY_SECTION_ORDER.indexOf(next) >
          PAGE_COPY_SECTION_ORDER.indexOf(current)
          ? 1
          : -1,
      );
      return next;
    });
  }, []);
  // Programs list is filterable by title/label/slug; reordering by drag is
  // only offered while the filter is empty, since a drag within a filtered
  // subset cannot unambiguously express a new position in the full list.
  const [programFilter, setProgramFilter] = useState("");
  const [pageView, setPageView] = useState<ProgramPageView>("directory");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const operationInFlight = useRef(false);
  const [unconfirmedProgram, setUnconfirmedProgram] = useState<ProgramPageSaveRequest | null>(null);
  const [unconfirmedManagement, setUnconfirmedManagement] = useState<DirectorySaveRequest | null>(null);
  const pendingProgramCommand = useRef(unconfirmedProgram);
  const pendingDirectoryCommand = useRef(unconfirmedManagement);
  pendingProgramCommand.current = unconfirmedProgram;
  pendingDirectoryCommand.current = unconfirmedManagement;
  const [programConflict, setProgramConflict] = useState<SavedProgramPage | null>(null);
  const [managementConflict, setManagementConflict] = useState<DBProgram[] | null>(null);
  const editorLocked = saving || managementSaving || Boolean(unconfirmedProgram || unconfirmedManagement) || (classic && batchSaving);

  const loadPrograms = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: loadError }, mediaResult, pageCopyResult, registrationFormsResult, previewFormsResult] =
        await Promise.all([
          createClient()
            .from("programs")
            .select("*")
            .order("sort_order", { ascending: true }),
          createClient()
            .from("program_media")
            .select("*")
            .order("sort_order", { ascending: true }),
          createClient().from("programs_page_content").select("*").limit(1),
          createClient()
            .from("registration_forms")
            .select("id,title,status")
            .order("title", { ascending: true }),
          fetch("/api/admin/programs-preview-forms", { cache: "no-store" }),
        ]);
      if (loadError) throw new Error(loadError.message);
      if (mediaResult.error) throw new Error(mediaResult.error.message);
      if (pageCopyResult.error) throw new Error(pageCopyResult.error.message);
      if (registrationFormsResult.error) throw new Error(registrationFormsResult.error.message);
      if (!previewFormsResult.ok) throw new Error("Unable to load registration previews");
      const previewForms = await previewFormsResult.json() as { forms: Record<string, PublicRegistrationForm> };
      setRegistrationForms((registrationFormsResult.data ?? []) as RegistrationFormOption[]);
      setOpenRegistrationForms(previewForms.forms);
      confirmedCopy.current = programsPageToDraft(((pageCopyResult.data ?? []) as DBProgramsPageContent[])[0] ?? null);
      setPageCopy({ ...confirmedCopy.current });
      setPageCopyErrors({});
      setPageCopyDirtySections(new Set());
      const next = ((data ?? []) as DBProgram[]).map(programToDraft);
      const grouped: Record<string, ProgramMediaDraft[]> = {};
      for (const row of (mediaResult.data ?? []) as DBProgramMedia[]) {
        (grouped[row.program_id] ??= []).push(programMediaToDraft(row));
      }
      directoryDraft.current = next;
      setPrograms(next);
      confirmedDirectory.current = next.map(({ id, updatedAt, sortOrder, status }) => ({ id, updatedAt, sortOrder, status }));
      setSavedManagement(confirmedDirectory.current);
      confirmedAssets.current = new Set([
        ...next.flatMap(item => [item.heroMediaAssetId, item.detailMediaAssetId]),
        ...((mediaResult.data ?? []) as DBProgramMedia[]).map(item => item.media_asset_id),
      ].filter((id): id is string => Boolean(id)));
      setGalleryByProgram(grouped);
      const selected =
        next.find((program) => program.id === preferredId) ?? next[0] ?? null;
      setDraft(selected ? { ...selected, highlights: [...selected.highlights] } : null);
      setGallery(selected?.id ? [...(grouped[selected.id] ?? [])] : []);
      setRemovedGalleryIds([]);
      setDirty(false);
      setErrors({});
    } catch (loadError) {
      setError(errorMessage(loadError, "Unable to load programs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [clubId, loadPrograms]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  function updateDraft<K extends keyof ProgramDraft>(
    field: K,
    value: ProgramDraft[K],
  ) {
    if (operationInFlight.current || editorLocked) return;
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    markDirty();
  }

  function selectProgram(program: ProgramDraft) {
    if (operationInFlight.current || editorLocked) return;
    if (!classic) {
      if ((dirty || pageCopyDirty || managementDirty) && !window.confirm("Discard unsaved page changes?")) return;
    }
    const managementBaseline = classic ? confirmedDirectory.current : savedManagement;
    if (managementDirty) {
      setPrograms((current) => current.map((item) => {
        const saved = managementBaseline.find((entry) => entry.id === item.id);
        return saved ? { ...item, status: saved.status, sortOrder: saved.sortOrder } : item;
      }).sort((left, right) => left.sortOrder - right.sortOrder));
    }
    const saved = managementBaseline.find((entry) => entry.id === program.id);
    const selected = saved ? { ...program, status: saved.status, sortOrder: saved.sortOrder } : program;
    setDraft({ ...selected, highlights: [...selected.highlights] });
    setGallery(program.id ? [...(galleryByProgram[program.id] ?? [])] : []);
    setRemovedGalleryIds([]);
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
    selectTab("content");
    setSelectedSection(null);
    setPageView("detail");
  }

  function showDirectory() {
    if (operationInFlight.current || editorLocked) return;
    if (!classic) {
      if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    }
    if (dirty) discardDraftChanges();
    setSelectedSection(null);
    setPageView("directory");
  }

  function showManage() {
    if (operationInFlight.current || editorLocked) return;
    if (!classic) {
      if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    }
    if (dirty) discardDraftChanges();
    setSelectedSection(null);
    setPageView("manage");
  }

  // ADMIN-RE-12a: after a click on the page's heading or closing band, the
  // words box takes the cursor once React has drawn the clicked section, in
  // that section's first field, and never away from a field already in use.
  // An effect (not a frame timer) so the field is certain to exist.
  // A new object per click, so a second click on the same section asks again.
  const [wordsFocus, setWordsFocus] = useState<{ section: PageCopySection } | null>(null);
  useEffect(() => {
    if (!wordsFocus) return;
    if (classic) { setWordsFocus(null); return; }
    // Drop a request the person has moved on from (another section chosen, or
    // the words box gone), so it never takes the cursor later.
    if (hidesPageCopyEditor || wordsFocus.section !== activePageCopySection) {
      setWordsFocus(null);
      return;
    }
    const panel = pageCopyPanel.current;
    const field = panel?.querySelector<HTMLElement>(
      `[data-page-copy-section="${wordsFocus.section}"] input, [data-page-copy-section="${wordsFocus.section}"] textarea`,
    );
    if (!panel || !field) return;
    setWordsFocus(null);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!panel.contains(document.activeElement)) field.focus({ preventScroll: true });
  }, [wordsFocus, activePageCopySection, hidesPageCopyEditor, classic]);

  function selectCanvasSection(section: string) {
    setSelectedSection(section);
    if (section === "Registration band") selectTab("registration");
    else if (section === "Program hero" || section === "Program details" || section === "Program focus") selectTab("content");
    else if (section === "Page heading") selectPageCopySection("pageHeader");
    else if (section === "Closing band") selectPageCopySection("closingBand");
    // ADMIN-RE-22: where the club edits its own Programs words, a click on the
    // page opens those words (no "managed by Onzio" note), and the words box
    // takes the cursor.
    if (!hidesPageCopyEditor && (section === "Page heading" || section === "Closing band")) {
      setSelectedSection(null);
      setWordsFocus({ section: section === "Page heading" ? "pageHeader" : "closingBand" });
    }
  }

  function startCreate() {
    if (operationInFlight.current || editorLocked) return;
    if (!classic) {
      if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    }
    setDraft(emptyProgramDraft(programs.length));
    setGallery([]);
    setRemovedGalleryIds([]);
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
    selectTab("content");
    setSelectedSection("Program hero");
    setPageView("detail");
  }

  /**
   * The pinned EDITING toolbar's Discard action: reverts the draft (and its
   * gallery) back to what is currently saved, without the navigation-away
   * confirm() dialog `selectProgram`/`startCreate` use — discarding is
   * itself the explicit "I want to lose this" action, so a second prompt
   * would be redundant. A never-saved draft reverts to a fresh empty one at
   * the same list position, mirroring `startCreate`.
   */
  function discardDraftChanges() {
    if (operationInFlight.current || editorLocked) return;
    if (!draft) return;
    const savedProgram = draft.id
      ? (programs.find((program) => program.id === draft.id) ?? null)
      : null;
    if (savedProgram) {
      setDraft({ ...savedProgram, highlights: [...savedProgram.highlights] });
      setGallery(
        savedProgram.id ? [...(galleryByProgram[savedProgram.id] ?? [])] : [],
      );
    } else {
      setDraft(emptyProgramDraft(programs.length));
      setGallery([]);
    }
    setRemovedGalleryIds([]);
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
  }

  function setHighlight(index: number, value: string) {
    if (!draft) return;
    updateDraft(
      "highlights",
      draft.highlights.map((highlight, highlightIndex) =>
        highlightIndex === index ? value : highlight,
      ),
    );
  }

  function addHighlight() {
    if (!draft || draft.highlights.length >= 200) return;
    updateDraft("highlights", [...draft.highlights, ""]);
  }

  function removeHighlight(index: number) {
    if (!draft) return;
    updateDraft(
      "highlights",
      draft.highlights.filter((_, highlightIndex) => highlightIndex !== index),
    );
  }

  function reorderHighlight(index: number, delta: -1 | 1) {
    if (!draft) return;
    const next = moveHighlight(draft.highlights, index, delta);
    if (next === draft.highlights) return;
    updateDraft("highlights", next);
  }

  async function uploadMedia(role: MediaRole, files: FileList | null) {
    const file = files?.[0];
    if (!file || !draft || operationInFlight.current || editorLocked) return false;
    setUploadingRole(role);
    setError(null);
    setSaved(false);
    try {
      const client = createClient();
      const requestedPath = `${role}/${Date.now()}-${file.name}`;
      const { data, error: uploadError } = await client.storage
        .from("programs")
        .upload(requestedPath, file);
      if (uploadError || !data?.assetId) {
        throw new Error(uploadError?.message ?? "Upload failed");
      }
      if (classic) {
        ownedUploads.current.set(data.assetId, data.path);
        if (!alive.current) {
          await cleanupUploads(false);
          return false;
        }
      }
      const { data: publicData, error: publicError } = client.storage
        .from("programs")
        .getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) {
        throw new Error(publicError?.message ?? "Upload failed");
      }
      setDraft((current) =>
        current
          ? {
              ...current,
              [role === "hero" ? "heroMediaAssetId" : "detailMediaAssetId"]:
                data.assetId,
              [role === "hero" ? "heroMediaPreviewUrl" : "detailMediaPreviewUrl"]:
                publicData.publicUrl,
            }
          : current,
      );
      markDirty();
      return true;
    } catch (uploadError) {
      if (alive.current) setError(errorMessage(uploadError, "Upload failed"));
      return false;
    } finally {
      setUploadingRole(null);
    }
  }

  async function uploadGalleryImage(files: FileList | null) {
    const file = files?.[0];
    if (!file || !draft || operationInFlight.current || editorLocked) return false;
    if (gallery.length >= PROGRAM_MEDIA_LIMITS.items) {
      setError(
        `A program gallery holds at most ${PROGRAM_MEDIA_LIMITS.items} images.`,
      );
      return false;
    }
    setUploadingGallery(true);
    setError(null);
    setSaved(false);
    try {
      const client = createClient();
      // Same secured pipeline every other admin image uses: authorize, upload
      // to private staging, finalize (signature/dimension verification, UUID
      // versioned immutable path). Nothing here trusts the file extension or
      // the browser-reported MIME type.
      const requestedPath = `gallery/${Date.now()}-${file.name}`;
      const { data, error: uploadError } = await client.storage
        .from("programs")
        .upload(requestedPath, file);
      if (uploadError || !data?.assetId) {
        throw new Error(uploadError?.message ?? "Upload failed");
      }
      if (classic) {
        ownedUploads.current.set(data.assetId, data.path);
        if (!alive.current) {
          await cleanupUploads(false);
          return false;
        }
      }
      const { data: publicData, error: publicError } = client.storage
        .from("programs")
        .getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) {
        throw new Error(publicError?.message ?? "Upload failed");
      }
      setGallery((current) => [
        ...current,
        {
          id: null,
          url: publicData.publicUrl,
          mediaAssetId: data.assetId,
          alt: "",
          sortOrder: current.length,
        },
      ]);
      markDirty();
      return true;
    } catch (uploadError) {
      if (alive.current) setError(errorMessage(uploadError, "Upload failed"));
      return false;
    } finally {
      setUploadingGallery(false);
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  function setGalleryAlt(index: number, value: string) {
    if (operationInFlight.current || editorLocked) return;
    setGallery((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, alt: value } : item,
      ),
    );
    markDirty();
  }

  function reorderGallery(index: number, delta: -1 | 1) {
    if (operationInFlight.current || editorLocked) return;
    const next = moveProgramMedia(gallery, index, delta);
    if (next === gallery) return;
    setGallery(next);
    markDirty();
  }

  function removeGalleryImage(index: number) {
    if (operationInFlight.current || editorLocked) return;
    const target = gallery[index];
    if (!target) return;
    if (target.id) setRemovedGalleryIds((current) => [...current, target.id!]);
    setGallery((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, sortOrder) => ({ ...item, sortOrder })),
    );
    markDirty();
  }

  async function saveProgram() {
    if (!draft || operationInFlight.current || managementSaving || (classic ? pendingDirectoryCommand.current : unconfirmedManagement) || uploadingRole !== null || uploadingGallery || programConflict || pendingPickers.current.size) return false;
    // A slug is derived once, at creation, and never again: it is the public
    // URL of the program page. Editing the navigation label later leaves the
    // slug — and every link to it — exactly as it was.
    const pending = draft.id
      ? draft
      : { ...draft, slug: draft.slug.trim() || derivedSlugForNewProgram(draft) };
    const validation = validateProgramDraft(pending);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      // Reveal the tab holding the first complaint; a highlighted field on a
      // hidden panel is the same as no message at all.
      const firstField = (
        Object.keys(validation) as Array<keyof ProgramValidationErrors>
      ).find((field) => PROGRAM_FIELD_TABS[field]);
      if (firstField) selectTab(PROGRAM_FIELD_TABS[firstField]);
      setError("Review the highlighted fields before saving.");
      return false;
    }
    const galleryError = validateProgramMedia(gallery);
    if (galleryError) {
      selectTab("registration");
      setError(galleryError);
      return false;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    operationInFlight.current = true;
    const baseline = programs.find((program) => program.id === pending.id);
    const baselineGallery = pending.id ? (galleryByProgram[pending.id] ?? []) : [];
    const confirmedMetadata = classic && pending.id ? confirmedDirectory.current.find(item => item.id === pending.id) : undefined;
    const request: ProgramPageSaveRequest = unconfirmedProgram ?? {
      operationId: crypto.randomUUID(),
      programId: pending.id,
      expected: {
        programUpdatedAt: confirmedDirectory.current.find(item => item.id === pending.id)?.updatedAt ?? baseline?.updatedAt ?? null,
        gallery: baselineGallery.map((item) => ({ id: item.id!, updatedAt: item.updatedAt! })),
      },
      program: buildProgramMutationPayload(confirmedMetadata ? { ...pending, status: confirmedMetadata.status, sortOrder: confirmedMetadata.sortOrder } : pending) as ProgramPageSaveRequest["program"],
      gallery: gallery.map((item, index) => ({ id: item.id, mediaAssetId: item.mediaAssetId, alt: item.alt.trim(), sortOrder: index })),
    };
    try {
      const result = await submitPageSave<SavedProgramPage>(() => fetch("/api/admin/programs-page", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(unconfirmedProgram ? { "X-Editor-Recovery": "1" } : {}) }, body: JSON.stringify(request) }), `/api/admin/programs-page?operationId=${encodeURIComponent(request.operationId)}${request.programId ? `&programId=${encodeURIComponent(request.programId)}` : ""}`);
      if (result.kind === "unconfirmed") { pendingProgramCommand.current = request; setUnconfirmedProgram(request); setError(result.message); return false; }
      pendingProgramCommand.current = null;
      setUnconfirmedProgram(null);
      if (result.kind === "rejected") {
        setError(result.message);
        if (result.status === 409 && result.code === "CONTENT_CHANGED" && request.programId) {
          setSelectedSection(null);
          try {
            const response = await fetch(`/api/admin/programs-page?programId=${encodeURIComponent(request.programId)}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Could not load latest program.");
            setProgramConflict(await response.json() as SavedProgramPage);
          } catch { setError("The program changed. Your draft is still here. Try Save again to load its latest version."); }
        }
        return false;
      }
      const snapshot = result.snapshot;
      const savedDraft = programToDraft(snapshot.program);
      // The mutation response is not media-hydrated the way a select is, so the
      // preview URLs already resolved for this draft are carried over.
      savedDraft.heroMediaPreviewUrl = pending.heroMediaPreviewUrl;
      savedDraft.detailMediaPreviewUrl = pending.detailMediaPreviewUrl;
      const savedGallery = snapshot.gallery.map((row, index) => ({ ...programMediaToDraft(row), url: gallery[index]?.url ?? row.url }));
      setGallery(savedGallery);
      setRemovedGalleryIds([]);
      if (savedDraft.id) setGalleryByProgram((current) => ({ ...current, [savedDraft.id!]: savedGallery }));
      const stagedMetadata = classic ? directoryDraft.current.find(program => program.id === savedDraft.id) : undefined;
      const reconciledDraft = stagedMetadata ? { ...savedDraft, status: stagedMetadata.status, sortOrder: stagedMetadata.sortOrder } : savedDraft;
      if (classic) {
        const current = directoryDraft.current;
        const exists = current.some(program => program.id === savedDraft.id);
        const next = (exists ? current.map(program => program.id === savedDraft.id ? reconciledDraft : program) : [...current, reconciledDraft])
          .sort((left, right) => left.sortOrder - right.sortOrder);
        directoryDraft.current = next;
        setPrograms(next);
      } else {
      setPrograms((current) => {
        const exists = current.some((program) => program.id === savedDraft.id);
        const next = exists
          ? current.map((program) =>
              program.id === savedDraft.id ? savedDraft : program,
            )
          : [...current, savedDraft];
        return next.sort((left, right) => left.sortOrder - right.sortOrder);
      });
      }
      const entry = { id: savedDraft.id, updatedAt: savedDraft.updatedAt, sortOrder: savedDraft.sortOrder, status: savedDraft.status };
      confirmedDirectory.current = confirmedDirectory.current.some(item => item.id === savedDraft.id)
        ? confirmedDirectory.current.map(item => item.id === savedDraft.id ? entry : item)
        : [...confirmedDirectory.current, entry];
      setSavedManagement(confirmedDirectory.current);
      for (const asset of [snapshot.program.hero_media_asset_id, snapshot.program.detail_media_asset_id, ...snapshot.gallery.map(item => item.media_asset_id)]) {
        if (asset) { confirmedAssets.current.add(asset); ownedUploads.current.delete(asset); }
      }
      setDraft({ ...reconciledDraft, highlights: [...reconciledDraft.highlights] });
      setDirty(false);
      setErrors({});
      setSaved(true);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save program"));
      return false;
    } finally {
      operationInFlight.current = false; setSaving(false);
    }
  }

  /**
   * The slug a not-yet-saved program would be created with. Derived from the
   * navigation label, falling back to the display title when the label is still
   * blank — the display title is required, so this always has something to work
   * from — and de-duplicated against the slugs this club already uses.
   */
  function derivedSlugForNewProgram(source: ProgramDraft): string {
    return deriveProgramSlug(
      source.navLabel.trim() || source.displayTitle.trim(),
      programs
        .filter((program) => program.id !== source.id)
        .map((program) => program.slug),
    );
  }

  function updatePageCopy<K extends keyof ProgramsPageDraft>(
    field: K,
    value: ProgramsPageDraft[K],
  ) {
    if (classic && editorLocked) return;
    setPageCopy((current) => ({ ...current, [field]: value }));
    setPageCopyErrors((current) => ({ ...current, [field]: undefined }));
    setPageCopyDirtySections((current) => {
      const section = PAGE_COPY_FIELD_SECTIONS[field];
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
    setPageCopySaved(false);
    setPageCopyError(null);
  }

  async function savePageCopy() {
    const validation = validateProgramsPageDraft(pageCopy);
    if (Object.keys(validation).length > 0) {
      setPageCopyErrors(validation);
      // Reveal the rail section holding the first complaint; a highlighted
      // field on a hidden panel is the same as no message at all.
      const firstField = (
        Object.keys(validation) as Array<keyof ProgramsPageDraft>
      ).find((field) => PAGE_COPY_FIELD_SECTIONS[field]);
      if (firstField) selectPageCopySection(PAGE_COPY_FIELD_SECTIONS[firstField]);
      setPageCopyError("Review the highlighted fields before saving.");
      return false;
    }

    setPageCopySaving(true);
    setPageCopySaved(false);
    setPageCopyError(null);
    try {
      const { data, error: saveError } = await createClient()
        .from("programs_page_content")
        .upsert(buildProgramsPageMutationPayload(pageCopy))
        .select("*")
        .single();
      if (saveError || !data) {
        throw new Error(saveError?.message ?? "Unable to save the page copy");
      }
      confirmedCopy.current = programsPageToDraft(data as DBProgramsPageContent);
      setPageCopy({ ...confirmedCopy.current });
      setPageCopyDirtySections(new Set());
      setPageCopyErrors({});
      setPageCopySaved(true);
      return true;
    } catch (saveError) {
      setPageCopyError(errorMessage(saveError, "Unable to save the page copy"));
      return false;
    } finally {
      setPageCopySaving(false);
    }
  }

  const pageCopyDefaults = defaultProgramsPageContent(clubName);

  // The program being edited, rendered through the real public template with
  // its unsaved changes applied. The sibling row underneath it is built from
  // the saved list minus this program, matching what
  // app/_clubs/[slug]/programs/[programSlug]/page.tsx passes.
  const previewProgramBase = programDraftToContent(
    draft ?? emptyProgramDraft(0),
    gallery,
  );
  const linkedForm = draft?.registrationFormId
    ? openRegistrationForms[draft.registrationFormId]
    : null;
  const previewProgram = {
    ...previewProgramBase,
    nativeRegistration: linkedForm
      ? { form: linkedForm, label: draft?.externalCtaLabel.trim() || "Register now" }
      : null,
  };
  const previewOtherPrograms = programs
    .filter((program) => program.id && program.status === "active" && program.id !== draft?.id)
    .map((program) => programDraftToContent(program));
  const directoryPrograms = programs.filter((program) => program.status === "active").map((program) => programDraftToContent(program));

  function persistProgramOrder(next: ProgramDraft[]) {
    if (operationInFlight.current || editorLocked) return;
    if (classic) directoryDraft.current = next;
    setPrograms(next);
    if (classic) setDraft(current => {
      const metadata = next.find(item => item.id === current?.id);
      return current && metadata ? { ...current, sortOrder: metadata.sortOrder, status: metadata.status } : current;
    });
    setManagementSaved(false);
    setManagementError(null);
  }

  function toggleProgramVisibility(programId: string) {
    if (operationInFlight.current || editorLocked) return;
    if (classic) {
      const next = directoryDraft.current.map(program => program.id === programId
        ? { ...program, status: program.status === "active" ? "hidden" as const : "active" as const } : program);
      directoryDraft.current = next;
      setPrograms(next);
    } else {
    setPrograms((current) => current.map((program) => program.id === programId
      ? { ...program, status: program.status === "active" ? "hidden" : "active" }
      : program));
    }
    if (classic) setDraft(current => current?.id === programId ? { ...current, status: current.status === "active" ? "hidden" : "active" } : current);
    setManagementSaved(false);
    setManagementError(null);
  }

  async function saveManagement() {
    if ((!managementDirty && !unconfirmedManagement) || operationInFlight.current || saving || (classic ? pendingProgramCommand.current : unconfirmedProgram) || managementConflict) return false;
    operationInFlight.current = true;
    setManagementSaving(true); setManagementSaved(false); setManagementError(null);
    const request: DirectorySaveRequest = unconfirmedManagement ?? {
      operationId: crypto.randomUUID(),
      expected: confirmedDirectory.current.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
      programs: (classic ? directoryDraft.current : programs).map((item) => ({ id: item.id, sortOrder: item.sortOrder, status: item.status })),
    };
    try {
      const result = await submitPageSave<{ programs: DBProgram[] }>(() => fetch("/api/admin/programs-directory", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(unconfirmedManagement ? { "X-Editor-Recovery": "1" } : {}) }, body: JSON.stringify(request) }), `/api/admin/programs-directory?operationId=${encodeURIComponent(request.operationId)}`);
      if (result.kind === "unconfirmed") { pendingDirectoryCommand.current = request; setUnconfirmedManagement(request); setManagementError(result.message); return false; }
      pendingDirectoryCommand.current = null;
      setUnconfirmedManagement(null);
      if (result.kind === "rejected") {
        setManagementError(result.message);
        if (result.status === 409 && result.code === "CONTENT_CHANGED") {
          try {
            const response = await fetch("/api/admin/programs-directory", { cache: "no-store" });
            if (!response.ok) throw new Error("Could not load latest directory.");
            setManagementConflict((await response.json()).programs as DBProgram[]);
          } catch { setManagementError("The directory changed. Your draft is still here. Try Save again to load its latest version."); }
        }
        return false;
      }
      applyDirectory(result.snapshot.programs, false);
      setManagementSaved(true);
      return true;
    } finally { operationInFlight.current = false; setManagementSaving(false); }
  }

  function applyDirectory(rows: DBProgram[], keepDraft: boolean) {
    const previous = new Map(programs.map((program) => [program.id, program]));
    const next = rows.map((row) => {
      const fresh = programToDraft(row), old = previous.get(row.id);
      if (old?.heroMediaAssetId === fresh.heroMediaAssetId) fresh.heroMediaPreviewUrl ||= old?.heroMediaPreviewUrl ?? "";
      if (old?.detailMediaAssetId === fresh.detailMediaAssetId) fresh.detailMediaPreviewUrl ||= old?.detailMediaPreviewUrl ?? "";
      return keepDraft && old ? { ...fresh, status: old.status, sortOrder: old.sortOrder } : fresh;
    }).sort((left, right) => left.sortOrder - right.sortOrder).map((program, sortOrder) => ({ ...program, sortOrder }));
    // Programs added elsewhere are included; deleted rows are removed only after review.
    if (classic) directoryDraft.current = next;
    setPrograms(next);
    confirmedDirectory.current = rows.map((row) => ({ id: row.id, updatedAt: row.updated_at, status: row.status === "hidden" ? "hidden" : "active", sortOrder: row.sort_order }));
    setSavedManagement(confirmedDirectory.current);
    setDraft((current) => {
      const fresh = rows.find((row) => row.id === current?.id);
      const desired = classic && keepDraft ? next.find(item => item.id === current?.id) : null;
      return current && fresh ? { ...current, status: desired?.status ?? (fresh.status === "hidden" ? "hidden" : "active"), sortOrder: desired?.sortOrder ?? fresh.sort_order, updatedAt: fresh.updated_at } : current;
    });
    setManagementConflict(null);
  }

  function resolveProgramConflict(keepDraft: boolean) {
    if (!programConflict || !draft) return;
    const fresh = programToDraft(programConflict.program);
    const freshGallery = programConflict.gallery.map(programMediaToDraft);
    const staged = classic && managementDirty ? programs.find(item => item.id === fresh.id) : null;
    const reviewed = staged ? { ...fresh, status: staged.status, sortOrder: staged.sortOrder } : fresh;
    setPrograms((current) => current.map((program) => program.id === fresh.id ? reviewed : program));
    if (fresh.id) setGalleryByProgram((current) => ({ ...current, [fresh.id!]: freshGallery }));
    confirmedDirectory.current = confirmedDirectory.current.map(item => item.id === fresh.id ? { id: fresh.id, updatedAt: fresh.updatedAt, status: fresh.status, sortOrder: fresh.sortOrder } : item);
    setSavedManagement(confirmedDirectory.current);
    setDraft(keepDraft ? { ...draft, slug: fresh.slug, status: reviewed.status, sortOrder: reviewed.sortOrder, updatedAt: fresh.updatedAt } : reviewed);
    if (!keepDraft) { setGallery(freshGallery); setDirty(false); }
    else setGallery((current) => current.map((item) => ({ ...item, id: freshGallery.some((row) => row.id === item.id) ? item.id : null })));
    setProgramConflict(null); setError(keepDraft ? "Your draft is ready to save over the reviewed page." : null);
  }

  /** `useSortableList`'s onReorder: the full new id order after a drag ends. */
  function handleProgramReorder(newOrderIds: string[]) {
    const byId = new Map(programs.map((program) => [program.id, program]));
    const next = newOrderIds
      .map((id) => byId.get(id))
      .filter((program): program is ProgramDraft => Boolean(program))
      .map((program, sortOrder) => ({ ...program, sortOrder }));
    // Guards against an id set that doesn't match the full list (should not
    // happen since drag is disabled while filtered — see canReorderPrograms).
    if (next.length !== programs.length) return;
    persistProgramOrder(next);
  }

  const trimmedProgramFilter = programFilter.trim().toLowerCase();
  const filteredPrograms = trimmedProgramFilter
    ? programs.filter(
        (program) =>
          program.displayTitle.toLowerCase().includes(trimmedProgramFilter) ||
          program.navLabel.toLowerCase().includes(trimmedProgramFilter) ||
          program.slug.toLowerCase().includes(trimmedProgramFilter),
      )
    : programs;
  // Dragging is only offered against the full, unfiltered list: a drag
  // within a filtered subset can't unambiguously express a new position in
  // the full list, so the sensors are simply left off while filtered rather
  // than risk writing a corrupted order.
  const canReorderPrograms = trimmedProgramFilter.length === 0;
  // Dragging also pauses while a previous reorder is still persisting —
  // kept separate from canReorderPrograms so the "clear the filter" hint
  // below doesn't flash during the brief in-flight window.
  const programDragEnabled = canReorderPrograms && !editorLocked;
  const managementDirty = programs.some((program) => {
    const saved = savedManagement.find((item) => item.id === program.id);
    return !saved || saved.sortOrder !== program.sortOrder || saved.status !== program.status;
  });
  const sortableProgramIds = filteredPrograms
    .map((program) => program.id)
    .filter((id): id is string => typeof id === "string");
  const {
    sensors: programSensors,
    collisionDetection: programCollisionDetection,
    strategy: programSortingStrategy,
    handleDragEnd: handleProgramDragEnd,
  } = useSortableList({ ids: sortableProgramIds, onReorder: handleProgramReorder });

  const latestMedia = useRef({ draft, gallery, unconfirmedProgram });
  latestMedia.current = { draft, gallery, unconfirmedProgram };

  const setPickerPending = useCallback((key: string, pending: boolean) => {
    if (pending) pendingPickers.current.add(key); else pendingPickers.current.delete(key);
    setPickerPendingState(pendingPickers.current.size > 0);
    if (pending) { setSaved(false); setPageCopySaved(false); setManagementSaved(false); }
  }, []);

  async function cleanupUploads(keepDraft: boolean) {
    const retained = new Set(confirmedAssets.current);
    const current = latestMedia.current;
    if (keepDraft) {
      for (const id of [current.draft?.heroMediaAssetId, current.draft?.detailMediaAssetId, ...current.gallery.map(item => item.mediaAssetId)]) if (id) retained.add(id);
    }
    if (current.unconfirmedProgram) {
      for (const id of [current.unconfirmedProgram.program.hero_media_asset_id, current.unconfirmedProgram.program.detail_media_asset_id, ...current.unconfirmedProgram.gallery.map(item => item.mediaAssetId)]) if (id) retained.add(id);
    }
    for (const [id, path] of ownedUploads.current) {
      if (retained.has(id)) continue;
      const result = await createClient().storage.from("programs").remove([path]);
      if (result.error) throw new Error(result.error.message || "Unused program photos could not be removed. Your changes are still here.");
      ownedUploads.current.delete(id);
    }
  }

  async function saveAll() {
    if (batch.current || loading || pendingPickers.current.size || uploadingRole || uploadingGallery) return false;
    batch.current = true;
    setBatchSaving(true);
    setCleanupError(null);
    try {
      // Existing uncertain commands retain their original UUID, payload and baseline.
      const stages: Array<() => Promise<boolean | undefined>> = [];
      if (unconfirmedProgram) stages.push(saveProgram);
      if (unconfirmedManagement) stages.push(saveManagement);
      if (dirty && !unconfirmedProgram) stages.push(saveProgram);
      if (managementDirty && !unconfirmedManagement) stages.push(saveManagement);
      if (pageCopyDirty) stages.push(savePageCopy);
      for (const save of stages) if (await save() !== true) return false;
      await cleanupUploads(true);
      return true;
    } catch (failure) {
      setCleanupError(errorMessage(failure, "Your changes could not all be saved. Try again."));
      return false;
    } finally {
      batch.current = false;
      setBatchSaving(false);
    }
  }

  async function discardAll() {
    if (batch.current || pendingPickers.current.size || uploadingRole || uploadingGallery) throw new Error("Wait for your photos to finish, then try again.");
    if (unconfirmedProgram || unconfirmedManagement) throw new Error("Confirm the previous save before leaving. Its outcome is still unknown.");
    await cleanupUploads(false);
    const restored = programs.map(program => {
      const saved = confirmedDirectory.current.find(item => item.id === program.id);
      return saved ? { ...program, status: saved.status, sortOrder: saved.sortOrder, updatedAt: saved.updatedAt } : program;
    }).sort((left, right) => left.sortOrder - right.sortOrder);
    directoryDraft.current = restored;
    setPrograms(restored);
    const selected = restored.find(program => program.id === draft?.id);
    setDraft(selected ? { ...selected, highlights: [...selected.highlights] } : programs.length ? null : emptyProgramDraft(0));
    setGallery(selected?.id ? [...(galleryByProgram[selected.id] ?? [])] : []);
    setRemovedGalleryIds([]);
    setPageCopy({ ...confirmedCopy.current });
    setPageCopyDirtySections(new Set());
    setSelectedSection(null);
    setPageView("directory");
    setDirty(false);
    setErrors({});
    setPageCopyErrors({});
    setError(null);
    setManagementError(null);
    setProgramConflict(null);
    setManagementConflict(null);
    setPageCopyError(null);
    setCleanupError(null);
    setSaved(false);
    setManagementSaved(false);
    setPageCopySaved(false);
  }

  async function discardProgramConflict() {
    if (!programConflict || batch.current || pendingPickers.current.size || uploadingRole || uploadingGallery) throw new Error("Wait for your photos to finish, then try again.");
    for (const asset of [programConflict.program.hero_media_asset_id, programConflict.program.detail_media_asset_id, ...programConflict.gallery.map(item => item.media_asset_id)]) if (asset) confirmedAssets.current.add(asset);
    await cleanupUploads(false);
    resolveProgramConflict(false);
  }

  const cleanupLatest = useRef(cleanupUploads);
  cleanupLatest.current = cleanupUploads;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (classic) void cleanupLatest.current(false).catch(() => console.warn("Unused program photo cleanup did not finish."));
    };
  }, [classic]);

  const pageCopySectionItems: AdminSectionRailItem[] = PAGE_COPY_SECTION_ORDER.map(
    (section) => ({
      id: section,
      label: PAGE_COPY_SECTION_LABELS[section],
      dirty: pageCopyDirtySections.has(section),
    }),
  );
  const changedPageCopySectionLabels = PAGE_COPY_SECTION_ORDER.filter((section) =>
    pageCopyDirtySections.has(section),
  ).map((section) => PAGE_COPY_SECTION_LABELS[section]);
  const pageCopySaveLabel =
    changedPageCopySectionLabels.length > 0
      ? `Save page copy (${changedPageCopySectionLabels.join(", ")})`
      : "Save page copy";

  return {
    actions: { saveAll, discardAll, discardProgramConflict },
    registrationForms,
    policy: { hidesSlugField, hidesProgramCreation, hidesPageCopyEditor, classic },
    state: { loading, error, batchSaving, pickerPending, cleanupError, hasOwnedUploads: ownedUploads.current.size > 0 },
    program: { draft, errors, dirty, saving, saved, editorLocked, activeTab, tabDirection, programConflict, unconfirmedProgram, updateDraft, selectTab, saveProgram, discardDraftChanges, derivedSlugForNewProgram, resolveProgramConflict, addHighlight, setHighlight, removeHighlight, reorderHighlight },
    media: { setPickerPending, gallery, galleryInput, uploadingRole, uploadingGallery, uploadMedia, uploadGalleryImage, setGalleryAlt, reorderGallery, removeGalleryImage },
    copy: { pageCopy, pageCopyErrors, pageCopyDefaults, pageCopyDirection, pageCopyDirty, pageCopyError, pageCopyPanel, pageCopySaveLabel, pageCopySaved, pageCopySaving, pageCopySectionItems, activePageCopySection, selectPageCopySection, updatePageCopy, savePageCopy },
    directory: { programs, filteredPrograms, programFilter, setProgramFilter, managementSaving, managementSaved, managementError, setManagementError, managementDirty, managementConflict, unconfirmedManagement, canReorderPrograms, programDragEnabled, programSensors, programCollisionDetection, programSortingStrategy, handleProgramDragEnd, sortableProgramIds, persistProgramOrder, toggleProgramVisibility, saveManagement, applyDirectory },
    view: { pageView, selectedSection, setSelectedSection, selectCanvasSection, selectProgram, showDirectory, showManage, startCreate },
    preview: { previewProgram, previewOtherPrograms, directoryPrograms },
  };
}

export type ProgramsEditor = ReturnType<typeof useProgramsEditor>;
