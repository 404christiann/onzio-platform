"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { OperationsToolbarSkeleton, ProgramsCopySkeleton, ProgramsWorkspaceSkeleton } from "@/components/admin/AdminOperationsSkeletons";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageToolbar,
  AdminPanel,
} from "@/components/admin/AdminPage";
import {
  AdminSectionRail,
  type AdminSectionRailItem,
} from "@/components/admin/AdminSectionRail";
import { useSortableList, useSortableRow } from "@/components/admin/useSortableList";
import FileUpload from "@/components/admin/FileUpload";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import ProgramCanvasFrame from "@/components/admin/ProgramCanvasFrame";
import AcademyProgramsPage from "@/components/AcademyProgramsPage";
import AcademyProgramDetailPage from "@/components/AcademyProgramDetailPage";
import TemplateFontScope from "@/components/TemplateFontScope";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
import { useClubContext } from "@/components/ClubContextProvider";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import type {
  DBProgram,
  DBProgramMedia,
  DBProgramsPageContent,
  DBRegistrationForm,
} from "@/lib/db-types";
import {
  buildProgramMediaMutationPayload,
  buildProgramMutationPayload,
  buildProgramsPageMutationPayload,
  emptyProgramDraft,
  emptyProgramsPageDraft,
  moveHighlight,
  moveProgramMedia,
  programDraftToContent,
  programMediaToDraft,
  programsPageToDraft,
  programToDraft,
  validateProgramDraft,
  validateProgramMedia,
  validateProgramsPageDraft,
  type ProgramDraft,
  type ProgramMediaDraft,
  type ProgramsPageDraft,
  type ProgramsPageValidationErrors,
  type ProgramValidationErrors,
} from "@/lib/program-admin";
import {
  PROGRAM_MEDIA_LIMITS,
  PROGRAM_REGISTRATION_LIMITS,
} from "@/lib/program-content";
import {
  defaultProgramsPageContent,
  PROGRAMS_PAGE_LIMITS,
} from "@/lib/programs-page-content";
import { deriveProgramSlug } from "@/lib/slugify";
import { resolveProgramsPageContent } from "@/lib/programs-page-content";
import type { PublicRegistrationForm } from "@/lib/registration-public";
import "./programs-editor.css";

type MediaRole = "hero" | "detail";
type RegistrationFormOption = Pick<DBRegistrationForm, "id" | "title" | "status">;
type ProgramPageView = "directory" | "detail" | "manage";

/**
 * The per-program editor is split into three tabs instead of one flat list of
 * ~15 fields. Registration was the field group that was hardest to find in the
 * flat form — it sat below the highlights, the media, and the layout controls —
 * so isolating it is the point of the split. Nothing moved between the database
 * and the page; this is purely how the same fields are arranged.
 */
type ProgramEditorTab = "content" | "media" | "registration";

const PROGRAM_EDITOR_TABS: Array<{ id: ProgramEditorTab; label: string }> = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "registration", label: "Registration" },
];

const PROGRAM_EDITOR_TAB_ORDER: ProgramEditorTab[] = [
  "content",
  "media",
  "registration",
];

/** Matches the copy in the Layout variant <select> below, for the "This
 * program" summary panel in the left rail. */
const LAYOUT_VARIANT_LABELS: Record<ProgramDraft["layoutVariant"], string> = {
  statement_band: "Statement band",
  detail_focus: "Detail focus",
};

/** "This program" panel's hero/detail row: which of the two optional media
 * roles are set, without inventing a new field — both booleans already live
 * on the draft. */
function summarizeHeroDetailMedia(draft: ProgramDraft): {
  label: string;
  complete: boolean;
} {
  const hasHero = Boolean(draft.heroMediaAssetId);
  const hasDetail = Boolean(draft.detailMediaAssetId);
  if (hasHero && hasDetail) return { label: "Both set", complete: true };
  if (hasHero) return { label: "Hero only", complete: false };
  if (hasDetail) return { label: "Detail only", complete: false };
  return { label: "Neither set", complete: false };
}

/**
 * Which tab owns each validation error, so a failed save can reveal the field
 * it is complaining about instead of leaving "Review the highlighted fields"
 * pointing at a panel the admin cannot see.
 */
const PROGRAM_FIELD_TABS: Record<
  keyof ProgramValidationErrors,
  ProgramEditorTab
> = {
  slug: "content",
  navLabel: "content",
  displayTitle: "content",
  kicker: "content",
  summary: "content",
  body: "content",
  highlights: "content",
  externalCtaLabel: "registration",
  externalCtaHref: "registration",
  registrationEyebrow: "registration",
  registrationHeadline: "registration",
  registrationBody: "registration",
  registrationPendingBody: "registration",
  registrationPendingLabel: "registration",
};

/**
 * The programs-page copy editor (a per-club singleton, separate from any one
 * program) is grouped into the same three bands the public templates render
 * it into. Rail wiring, per-section dirty tracking, and the dynamic save
 * label follow the pattern piloted on app/admin/(protected)/homepage/page.tsx.
 */
type PageCopySection = "homepageBand" | "pageHeader" | "closingBand";

const PAGE_COPY_SECTION_ORDER: PageCopySection[] = [
  "homepageBand",
  "pageHeader",
  "closingBand",
];

const PAGE_COPY_SECTION_LABELS: Record<PageCopySection, string> = {
  homepageBand: "Homepage band",
  pageHeader: "Page header",
  closingBand: "Closing band",
};

const PAGE_COPY_FIELD_SECTIONS: Record<keyof ProgramsPageDraft, PageCopySection> = {
  pathwayEyebrow: "homepageBand",
  pathwayHeading: "homepageBand",
  pathwayIntro: "homepageBand",
  heroEyebrow: "pageHeader",
  heroHeadlineLineOne: "pageHeader",
  heroHeadlineLineTwo: "pageHeader",
  heroIntro: "pageHeader",
  closingHeadingLineOne: "closingBand",
  closingHeadingLineTwo: "closingBand",
  closingBody: "closingBand",
  closingCtaLabel: "closingBand",
};

function fieldError(errors: ProgramValidationErrors, field: keyof ProgramValidationErrors) {
  const message = errors[field];
  return message ? (
    <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminProgramsPage() {
  const club = useClubContext();
  const router = useRouter();
  // Only academy@1 currently renders a public /programs route. The editor
  // follows that route's actual template gate, including direct URL access.
  const unsupportedTemplate = club.presentationTemplateKey !== "academy@1";
  useEffect(() => {
    if (unsupportedTemplate) router.replace("/admin");
  }, [unsupportedTemplate, router]);
  // Diverse City's admins do not hand-write URL slugs; the slug is derived from
  // the navigation label the first time a program is saved and then fixed for
  // the program's lifetime. Every other template keeps the manual field.
  const hidesSlugField = club.presentationTemplateKey === "academy@1";
  // Diverse City's four programs are fixed for this rollout: the club edits
  // them, it does not add new ones. Hiding the creation entry points leaves the
  // create code path (and lib/slugify.ts) intact for every other template, and
  // for this club should it ever be re-enabled.
  const hidesProgramCreation = club.presentationTemplateKey === "academy@1";
  // Diverse City's pathway band, /programs header, and closing band keep their
  // standard wording; the copy editor is Onzio-managed for this rollout. If
  // nothing is ever saved the public pages fall back to their placeholder copy
  // by design, so hiding the editor is purely subtractive. Every other template
  // keeps the editor.
  const hidesPageCopyEditor = club.presentationTemplateKey === "academy@1";
  const [programs, setPrograms] = useState<ProgramDraft[]>([]);
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
      setPageCopy(
        programsPageToDraft(
          ((pageCopyResult.data ?? []) as DBProgramsPageContent[])[0] ?? null,
        ),
      );
      setPageCopyErrors({});
      setPageCopyDirtySections(new Set());
      const next = ((data ?? []) as DBProgram[]).map(programToDraft);
      const grouped: Record<string, ProgramMediaDraft[]> = {};
      for (const row of (mediaResult.data ?? []) as DBProgramMedia[]) {
        (grouped[row.program_id] ??= []).push(programMediaToDraft(row));
      }
      setPrograms(next);
      setSavedManagement(next.map(({ id, updatedAt, sortOrder, status }) => ({ id, updatedAt, sortOrder, status })));
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
  }, [club.id, loadPrograms]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  function updateDraft<K extends keyof ProgramDraft>(
    field: K,
    value: ProgramDraft[K],
  ) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    markDirty();
  }

  function selectProgram(program: ProgramDraft) {
    if ((dirty || pageCopyDirty || managementDirty) && !window.confirm("Discard unsaved page changes?")) return;
    if (managementDirty) {
      setPrograms((current) => current.map((item) => {
        const saved = savedManagement.find((entry) => entry.id === item.id);
        return saved ? { ...item, status: saved.status, sortOrder: saved.sortOrder } : item;
      }).sort((left, right) => left.sortOrder - right.sortOrder));
    }
    const saved = savedManagement.find((entry) => entry.id === program.id);
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
    if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    if (dirty) discardDraftChanges();
    setSelectedSection(null);
    setPageView("directory");
  }

  function showManage() {
    if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    if (dirty) discardDraftChanges();
    setSelectedSection(null);
    setPageView("manage");
  }

  function selectCanvasSection(section: string) {
    setSelectedSection(section);
    if (section === "Registration band") selectTab("registration");
    else if (section === "Program hero" || section === "Program details" || section === "Program focus") selectTab("content");
    else if (section === "Page heading") selectPageCopySection("pageHeader");
    else if (section === "Closing band") selectPageCopySection("closingBand");
  }

  function startCreate() {
    if (dirty && !window.confirm("Discard unsaved program changes?")) return;
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
    if (!file || !draft) return;
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
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Upload failed"));
    } finally {
      setUploadingRole(null);
    }
  }

  async function uploadGalleryImage(files: FileList | null) {
    const file = files?.[0];
    if (!file || !draft) return;
    if (gallery.length >= PROGRAM_MEDIA_LIMITS.items) {
      setError(
        `A program gallery holds at most ${PROGRAM_MEDIA_LIMITS.items} images.`,
      );
      return;
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
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Upload failed"));
    } finally {
      setUploadingGallery(false);
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  function setGalleryAlt(index: number, value: string) {
    setGallery((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, alt: value } : item,
      ),
    );
    markDirty();
  }

  function reorderGallery(index: number, delta: -1 | 1) {
    const next = moveProgramMedia(gallery, index, delta);
    if (next === gallery) return;
    setGallery(next);
    markDirty();
  }

  function removeGalleryImage(index: number) {
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
    if (!draft) return;
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
      return;
    }
    const galleryError = validateProgramMedia(gallery);
    if (galleryError) {
      selectTab("registration");
      setError(galleryError);
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    const operationId = crypto.randomUUID();
    const baseline = programs.find((program) => program.id === pending.id);
    const baselineGallery = pending.id ? (galleryByProgram[pending.id] ?? []) : [];
    const request = {
      operationId,
      programId: pending.id,
      expected: {
        programUpdatedAt: baseline?.updatedAt ?? null,
        gallery: baselineGallery.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
      },
      program: buildProgramMutationPayload(pending),
      gallery: gallery.map((item, index) => ({ id: item.id, mediaAssetId: item.mediaAssetId, alt: item.alt.trim(), sortOrder: index })),
    };
    try {
      let snapshot: { program?: DBProgram; gallery?: DBProgramMedia[]; operation?: { status: string; receipt?: { program: DBProgram; gallery: DBProgramMedia[] } } } | null = null;
      let failureMessage = "Unable to save program";
      try {
        const response = await fetch("/api/admin/programs-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
        const body = await response.json();
        if (response.ok) snapshot = body;
        else {
          failureMessage = body?.error?.message ?? failureMessage;
          if (response.status !== 500) throw new Error(failureMessage);
        }
      } catch (transportError) {
        if (transportError instanceof Error && transportError.message !== "Failed to fetch" && transportError.message !== "Unable to save program") failureMessage = transportError.message;
        else failureMessage = "The save response was interrupted. Checking whether it completed…";
      }
      if (!snapshot) {
        const receiptResponse = await fetch(`/api/admin/programs-page?operationId=${encodeURIComponent(operationId)}${pending.id ? `&programId=${encodeURIComponent(pending.id)}` : ""}`);
        if (receiptResponse.ok) {
          const receipt = await receiptResponse.json();
          if (receipt.operation?.status === "committed") snapshot = receipt.operation.receipt;
        }
      }
      if (!snapshot?.program || !Array.isArray(snapshot.gallery)) throw new Error(failureMessage);
      const savedDraft = programToDraft(snapshot.program);
      // The mutation response is not media-hydrated the way a select is, so the
      // preview URLs already resolved for this draft are carried over.
      savedDraft.heroMediaPreviewUrl = pending.heroMediaPreviewUrl;
      savedDraft.detailMediaPreviewUrl = pending.detailMediaPreviewUrl;
      const savedGallery = snapshot.gallery.map((row, index) => ({ ...programMediaToDraft(row), url: gallery[index]?.url ?? row.url }));
      setGallery(savedGallery);
      setRemovedGalleryIds([]);
      if (savedDraft.id) setGalleryByProgram((current) => ({ ...current, [savedDraft.id!]: savedGallery }));
      setPrograms((current) => {
        const exists = current.some((program) => program.id === savedDraft.id);
        const next = exists
          ? current.map((program) =>
              program.id === savedDraft.id ? savedDraft : program,
            )
          : [...current, savedDraft];
        return next.sort((left, right) => left.sortOrder - right.sortOrder);
      });
      setSavedManagement((current) => {
        const entry = { id: savedDraft.id, updatedAt: savedDraft.updatedAt, sortOrder: savedDraft.sortOrder, status: savedDraft.status };
        return current.some((item) => item.id === savedDraft.id)
          ? current.map((item) => item.id === savedDraft.id ? entry : item)
          : [...current, entry];
      });
      setDraft({ ...savedDraft, highlights: [...savedDraft.highlights] });
      setDirty(false);
      setErrors({});
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save program"));
    } finally {
      setSaving(false);
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
      return;
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
      setPageCopy(programsPageToDraft(data as DBProgramsPageContent));
      setPageCopyDirtySections(new Set());
      setPageCopyErrors({});
      setPageCopySaved(true);
    } catch (saveError) {
      setPageCopyError(errorMessage(saveError, "Unable to save the page copy"));
    } finally {
      setPageCopySaving(false);
    }
  }

  const pageCopyDefaults = defaultProgramsPageContent(club.name);

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

  function pageCopyFieldError(field: keyof ProgramsPageDraft) {
    const message = pageCopyErrors[field];
    return message ? (
      <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;
  }

  function persistProgramOrder(next: ProgramDraft[]) {
    setPrograms(next);
    setManagementSaved(false);
    setManagementError(null);
  }

  function toggleProgramVisibility(programId: string) {
    setPrograms((current) => current.map((program) => program.id === programId
      ? { ...program, status: program.status === "active" ? "hidden" : "active" }
      : program));
    setManagementSaved(false);
    setManagementError(null);
  }

  async function saveManagement() {
    if (!managementDirty || managementSaving) return;
    setManagementSaving(true);
    setManagementSaved(false);
    setManagementError(null);
    const operationId = crypto.randomUUID();
    const request = {
      operationId,
      expected: savedManagement.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
      programs: programs.map((item) => ({ id: item.id, sortOrder: item.sortOrder, status: item.status })),
    };
    try {
      let snapshot: { programs?: DBProgram[]; operation?: { status: string; receipt?: { programs: DBProgram[] } } } | null = null;
      let message = "Unable to save program order and visibility";
      try {
        const response = await fetch("/api/admin/programs-directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
        const body = await response.json();
        if (response.ok) snapshot = body;
        else {
          message = body?.error?.message ?? message;
          if (response.status !== 500) throw new Error(message);
        }
      } catch (transportError) {
        if (transportError instanceof Error && transportError.message !== "Failed to fetch") message = transportError.message;
      }
      if (!snapshot) {
        const receiptResponse = await fetch(`/api/admin/programs-directory?operationId=${encodeURIComponent(operationId)}`);
        if (receiptResponse.ok) {
          const receipt = await receiptResponse.json();
          if (receipt.operation?.status === "committed") snapshot = receipt.operation.receipt;
        }
      }
      if (!Array.isArray(snapshot?.programs)) throw new Error(message);
      const rows = new Map(snapshot.programs.map((row) => [row.id, row]));
      const next = programs.map((program) => {
        const row = program.id ? rows.get(program.id) : undefined;
        return row ? { ...program, status: row.status === "hidden" ? "hidden" as const : "active" as const, sortOrder: row.sort_order, updatedAt: row.updated_at } : program;
      }).sort((left, right) => left.sortOrder - right.sortOrder);
      setPrograms(next);
      setSavedManagement(next.map(({ id, updatedAt, sortOrder, status }) => ({ id, updatedAt, sortOrder, status })));
      setDraft((current) => {
        const row = current?.id ? rows.get(current.id) : undefined;
        return row && current ? { ...current, status: row.status === "hidden" ? "hidden" : "active", sortOrder: row.sort_order, updatedAt: row.updated_at } : current;
      });
      setManagementSaved(true);
    } catch (saveError) {
      setManagementError(errorMessage(saveError, "Unable to save program order and visibility"));
    } finally {
      setManagementSaving(false);
    }
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
  const programDragEnabled = canReorderPrograms && !managementSaving;
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

  if (unsupportedTemplate) return null;

  return (
    // overflow-x-clip (not overflow-hidden): still clips the SlidingPanel's
    // horizontal slide animation, but `clip` doesn't turn this wrapper into a
    // scroll container, which would silently disable the sticky rail/preview
    // columns below.
    <AdminPage className="overflow-x-clip">
      <AdminPageHeader
        eyebrow="Public website"
        title="Programs"
        description="Manage program pages, their order, media, highlights, visibility, and registration destinations."
        actions={!hidesProgramCreation ? (
          <button
            type="button"
            onClick={startCreate}
            disabled={loading}
            className="rounded-lg bg-primary px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create program
          </button>
        ) : undefined}
      />

      <div className="program-editor-layout">
        <nav className="program-editor-navigation" aria-label="Program pages">
          <div className="program-editor-navigation-desktop">
            <h2>Program pages</h2>
            <button type="button" aria-current={pageView === "directory" ? "page" : undefined} onClick={showDirectory}>All programs <span>/programs</span></button>
            <input type="search" value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} placeholder="Find a program" aria-label="Find a program" />
            <div className="program-editor-navigation-list">
              {filteredPrograms.map((program) => <button key={program.id} type="button" aria-current={pageView === "detail" && draft?.id === program.id ? "page" : undefined} onClick={() => selectProgram(program)}>
                <strong>{program.navLabel || program.displayTitle}</strong><span>{program.status === "hidden" ? "Hidden · " : ""}/programs/{program.slug}</span>
              </button>)}
              {filteredPrograms.length === 0 && <p>No programs match your search.</p>}
            </div>
            <button type="button" aria-current={pageView === "manage" ? "page" : undefined} onClick={showManage}>Manage programs <span>Order and visibility</span></button>
          </div>
          <details className="program-editor-navigation-phone" key={`${pageView}-${draft?.id ?? "none"}`}>
            <summary><span>{pageView === "directory" ? "All programs" : pageView === "manage" ? "Manage programs" : draft?.navLabel || draft?.displayTitle || "New program"}</span><span>Change page</span></summary>
            <div className="program-editor-navigation-phone-menu">
              <input type="search" value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} placeholder="Find a program" aria-label="Find a program" />
              <button type="button" onClick={showDirectory}>All programs</button>
              {filteredPrograms.map((program) => <button key={program.id} type="button" onClick={() => selectProgram(program)}>{program.navLabel || program.displayTitle}{program.status === "hidden" ? " · Hidden" : ""}</button>)}
              {filteredPrograms.length === 0 && <p>No programs match your search.</p>}
              <button type="button" onClick={showManage}>Manage programs</button>
            </div>
          </details>
        </nav>
        <div className="program-editor-main">

      {error && (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {loading && !hidesPageCopyEditor && <ProgramsCopySkeleton />}

      {!loading && !hidesPageCopyEditor && pageView === "directory" && (
        <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <AdminSectionRail
            className="self-start"
            items={pageCopySectionItems}
            value={activePageCopySection}
            onChange={(id) => selectPageCopySection(id as PageCopySection)}
          />

          <AdminPanel className="self-start p-4 sm:p-5">
            <div className="mb-5">
              <h2 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                Programs page copy
              </h2>
              <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                The wording around your programs — the homepage &ldquo;pathway&rdquo;
                band, the /programs page header, and the closing band at the
                bottom of /programs. The programs themselves are edited below.
                Leave a field empty to keep the standard wording shown as its
                placeholder.
              </p>
            </div>

            {pageCopyError && (
              <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
                {pageCopyError}
              </div>
            )}

            <SlidingPanel activeKey={activePageCopySection} direction={pageCopyDirection}>
              {activePageCopySection === "homepageBand" && (
                <div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Eyebrow" error={pageCopyFieldError("pathwayEyebrow")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.pathwayEyebrow}
                        onChange={(event) => updatePageCopy("pathwayEyebrow", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayEyebrow}
                        placeholder={pageCopyDefaults.pathwayEyebrow}
                      />
                    </FormField>
                    <FormField label="Heading" error={pageCopyFieldError("pathwayHeading")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.pathwayHeading}
                        onChange={(event) => updatePageCopy("pathwayHeading", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayHeading}
                        placeholder={pageCopyDefaults.pathwayHeading}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5">
                    <FormField label="Intro paragraph" error={pageCopyFieldError("pathwayIntro")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.pathwayIntro}
                        onChange={(event) => updatePageCopy("pathwayIntro", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayIntro}
                        placeholder={pageCopyDefaults.pathwayIntro}
                        aria-invalid={Boolean(pageCopyFieldError("pathwayIntro"))}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {activePageCopySection === "pageHeader" && (
                <div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Eyebrow" error={pageCopyFieldError("heroEyebrow")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroEyebrow}
                        onChange={(event) => updatePageCopy("heroEyebrow", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroEyebrow}
                        placeholder={pageCopyDefaults.heroEyebrow}
                      />
                    </FormField>
                    <div className="hidden sm:block" aria-hidden="true" />
                    <FormField label="Headline line 1" error={pageCopyFieldError("heroHeadlineLineOne")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroHeadlineLineOne}
                        onChange={(event) => updatePageCopy("heroHeadlineLineOne", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroHeadlineLineOne}
                        placeholder={pageCopyDefaults.heroHeadlineLineOne}
                      />
                    </FormField>
                    <FormField label="Headline line 2" error={pageCopyFieldError("heroHeadlineLineTwo")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroHeadlineLineTwo}
                        onChange={(event) => updatePageCopy("heroHeadlineLineTwo", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroHeadlineLineTwo}
                        placeholder={pageCopyDefaults.heroHeadlineLineTwo}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5">
                    <FormField label="Intro paragraph" error={pageCopyFieldError("heroIntro")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.heroIntro}
                        onChange={(event) => updatePageCopy("heroIntro", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroIntro}
                        placeholder={pageCopyDefaults.heroIntro}
                        aria-invalid={Boolean(pageCopyFieldError("heroIntro"))}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {activePageCopySection === "closingBand" && (
                <div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Heading line 1" error={pageCopyFieldError("closingHeadingLineOne")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingHeadingLineOne}
                        onChange={(event) => updatePageCopy("closingHeadingLineOne", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingHeadingLineOne}
                        placeholder={pageCopyDefaults.closingHeadingLineOne}
                      />
                    </FormField>
                    <FormField label="Heading line 2" error={pageCopyFieldError("closingHeadingLineTwo")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingHeadingLineTwo}
                        onChange={(event) => updatePageCopy("closingHeadingLineTwo", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingHeadingLineTwo}
                        placeholder={pageCopyDefaults.closingHeadingLineTwo}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5 grid gap-5">
                    <FormField label="Paragraph" error={pageCopyFieldError("closingBody")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.closingBody}
                        onChange={(event) => updatePageCopy("closingBody", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingBody}
                        placeholder={pageCopyDefaults.closingBody}
                        aria-invalid={Boolean(pageCopyFieldError("closingBody"))}
                      />
                    </FormField>
                    <FormField label="Button label" error={pageCopyFieldError("closingCtaLabel")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingCtaLabel}
                        onChange={(event) => updatePageCopy("closingCtaLabel", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingCtaLabel}
                        placeholder={pageCopyDefaults.closingCtaLabel}
                      />
                    </FormField>
                  </div>
                </div>
              )}
            </SlidingPanel>

            <div className="mt-6 flex items-center gap-4 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => void savePageCopy()}
                disabled={pageCopySaving || !pageCopyDirty}
                className="rounded-lg bg-primary px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pageCopySaving && <AdminLoadingDots className="mr-2" />}
                {pageCopySaving ? "Saving…" : pageCopySaveLabel}
              </button>
              {pageCopySaved && !pageCopyDirty && (
                <span className="font-body text-xs text-success" role="status">
                  Page copy saved
                </span>
              )}
            </div>
          </AdminPanel>
        </div>
      )}

      {loading && <OperationsToolbarSkeleton label="Loading program actions" />}

      {!loading && draft && pageView === "detail" && (
        <AdminPageToolbar className="program-editor-detail-toolbar z-10 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Editing
            </span>
            <span className="truncate font-display text-base font-black uppercase text-foreground">
              {draft.id ? draft.displayTitle || "Untitled program" : "New program"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
                draft.status === "active"
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-none rounded-full ${
                  draft.status === "active" ? "bg-success" : "bg-muted-foreground"
                }`}
              />
              {draft.status === "active" ? "Active" : "Hidden"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-warning">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 flex-none rounded-full bg-warning"
                />
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={discardDraftChanges}
              disabled={!dirty || saving}
              className="rounded-lg border border-border px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveProgram()}
              disabled={
                saving || uploadingRole !== null || uploadingGallery || !dirty
              }
              className="rounded-lg bg-primary px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {(saving || uploadingRole !== null || uploadingGallery) && (
                <AdminLoadingDots className="mr-2" />
              )}
              Save changes
            </button>
          </div>
          <AdminSaveFeedback
            saving={saving}
            saved={saved}
            savingLabel="Saving program…"
            successLabel="Program saved"
          />
        </AdminPageToolbar>
      )}

      {loading ? (
        <ProgramsWorkspaceSkeleton label="Loading programs" />
      ) : pageView === "directory" ? (
        <div className="program-editor-canvas-wrap">
          <div className="program-editor-canvas-heading"><div><h2>All programs</h2><p>Tap a program card to edit that public page.</p></div><span>Page copy managed by Onzio</span></div>
          {managementDirty && <div className="program-editor-directory-save"><p>Program order or visibility has not been saved yet.</p><button type="button" onClick={() => void saveManagement()} disabled={managementSaving}>{managementSaving ? "Saving…" : "Save page"}</button></div>}
          {managementError && <p className="mb-3 text-sm text-destructive" role="alert">{managementError}</p>}
          <ProgramCanvasFrame path="/programs" onSelect={selectCanvasSection} onProgramLink={(slug) => { const found = programs.find((program) => program.slug === slug); if (found) selectProgram(found); }}>
            <TemplateFontScope templateKey={club.presentationTemplateKey}>
              <AcademyProgramsPage programs={directoryPrograms} clubName={club.name} content={resolveProgramsPageContent(buildProgramsPageMutationPayload(pageCopy) as Partial<DBProgramsPageContent>, club.name)} />
            </TemplateFontScope>
          </ProgramCanvasFrame>
          {selectedSection && <div className="program-editor-ownership" role="status"><strong>{selectedSection}</strong>{selectedSection === "Program cards" ? <p>Select a program card to open its page. Add, order, and hide programs in Manage programs.</p> : <p>This wording is managed by Onzio for the Academy template.</p>}<button type="button" onClick={() => setSelectedSection(null)}>Done</button></div>}
        </div>
      ) : programs.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-sm">
          <h2 className="font-display text-xl font-black uppercase text-foreground">
            No programs yet
          </h2>
          <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-muted-foreground">
            {hidesProgramCreation
              ? "Your programs are set up by Onzio. Contact us to add one."
              : "Create the first reusable program page. Nothing is published until a valid program is saved as active."}
          </p>
          {!hidesProgramCreation && (
            <button
              type="button"
              onClick={startCreate}
              className="mt-6 rounded-lg border border-border px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground transition hover:bg-accent"
            >
              Create program
            </button>
          )}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-6 ${pageView === "detail" ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}
        >
          {pageView === "manage" && (
          <aside className="min-w-0 self-start space-y-3 lg:sticky lg:top-40">
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="px-3 pb-3 pt-2">
                <h2 className="font-display text-base font-bold text-foreground">Manage programs</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground">Set the public order and visibility, then save this page.</p>
                {managementError && <p className="mt-3 text-sm text-destructive" role="alert">{managementError}</p>}
                {managementSaved && <p className="mt-3 text-sm text-success" role="status">Programs directory saved</p>}
                <input
                  type="search"
                  value={programFilter}
                  onChange={(event) => setProgramFilter(event.target.value)}
                  placeholder="Find a program"
                  aria-label="Find a program"
                  className={`${ADMIN_INPUT_CLASS} mt-2`}
                />
                {!canReorderPrograms && (
                  <p className="mt-2 font-body text-[0.65rem] leading-4 text-muted-foreground">
                    Clear the filter to drag and reorder.
                  </p>
                )}
              </div>
              {filteredPrograms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center font-body text-xs text-muted-foreground">
                  No programs match &ldquo;{programFilter.trim()}&rdquo;.
                </p>
              ) : (
                <DndContext
                  sensors={programDragEnabled ? programSensors : []}
                  collisionDetection={programCollisionDetection}
                  onDragEnd={handleProgramDragEnd}
                >
                  <SortableContext items={sortableProgramIds} strategy={programSortingStrategy}>
                    <div className="space-y-2">
                      {filteredPrograms.map((program) => (
                        <ProgramListRow
                          key={program.id}
                          program={program}
                          isSelected={draft?.id === program.id}
                          onSelect={() => selectProgram(program)}
                          onToggleVisibility={() => { if (program.id) toggleProgramVisibility(program.id); }}
                          dragDisabled={!programDragEnabled}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <p className="mt-3 px-1 font-body text-[0.65rem] leading-4 text-muted-foreground">
                Changes appear on your website after you save.
              </p>
              <button type="button" onClick={() => void saveManagement()} disabled={!managementDirty || managementSaving} className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-40">{managementSaving ? "Saving…" : "Save page"}</button>
            </div>

            {draft && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  This program
                </p>
                <dl className="mt-3 space-y-2">
                  <ThisProgramStat
                    label="Layout variant"
                    value={LAYOUT_VARIANT_LABELS[draft.layoutVariant]}
                  />
                  <ThisProgramStat
                    label="Highlights"
                    value={String(draft.highlights.length)}
                  />
                  <ThisProgramStat
                    label="Registration band"
                    value={draft.registrationEnabled ? "On" : "Off"}
                    tone={draft.registrationEnabled ? "success" : "muted"}
                  />
                  <ThisProgramStat
                    label="Gallery images"
                    value={String(gallery.length)}
                  />
                  <ThisProgramStat
                    label="Hero / detail image"
                    value={summarizeHeroDetailMedia(draft).label}
                    tone={
                      summarizeHeroDetailMedia(draft).complete
                        ? "default"
                        : "warning"
                    }
                  />
                </dl>
              </div>
            )}
          </aside>
          )}

          {pageView === "detail" && draft && (
            <section className="program-editor-inspector min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" data-selected={Boolean(selectedSection)} aria-label="Program page tools">
              <div className="program-editor-inspector-heading"><h2>{selectedSection ?? "Select a section on the page"}</h2><div><button type="button" onClick={() => void saveProgram()} disabled={!dirty || saving || uploadingRole !== null || uploadingGallery}>Save program</button><button type="button" onClick={() => setSelectedSection(null)}>Done</button></div></div>
              {selectedSection === "Explore other programs" ? <p className="font-body text-sm leading-6 text-muted-foreground">This section is set by the Academy template. Select another program in the page to open its editor.</p> : selectedSection ? <>
              <ProgramTabs
                value={activeTab}
                onChange={selectTab}
                disabled={saving || uploadingRole !== null || uploadingGallery}
              />

              <SlidingPanel activeKey={activeTab} direction={tabDirection}>
              {activeTab === "content" && (
              <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {hidesSlugField ? (
                  <div>
                    <span className={ADMIN_LABEL_CLASS}>Page address</span>
                    <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-body text-sm text-muted-foreground">
                      /programs/
                      <span className="text-foreground">
                        {draft.id
                          ? draft.slug
                          : derivedSlugForNewProgram(draft)}
                      </span>
                    </p>
                    <p className="mt-1.5 font-body text-xs leading-5 text-muted-foreground">
                      {draft.id
                        ? "Set when this program was created and fixed from then on, so existing links keep working. Renaming the navigation label does not change it."
                        : "Created from the navigation label below when you save. It cannot be changed afterwards."}
                    </p>
                    {fieldError(errors, "slug")}
                  </div>
                ) : (
                  <FormField label="Slug" error={fieldError(errors, "slug")}>
                    <input
                      className={ADMIN_INPUT_CLASS}
                      value={draft.slug}
                      onChange={(event) => updateDraft("slug", event.target.value)}
                      placeholder="youth-academy"
                      maxLength={64}
                    />
                  </FormField>
                )}
                <FormField label="Navigation label" error={fieldError(errors, "navLabel")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.navLabel}
                    onChange={(event) => updateDraft("navLabel", event.target.value)}
                    maxLength={40}
                  />
                </FormField>
                <FormField label="Display title" error={fieldError(errors, "displayTitle")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.displayTitle}
                    onChange={(event) => updateDraft("displayTitle", event.target.value)}
                    maxLength={120}
                  />
                </FormField>
                <FormField label="Kicker" error={fieldError(errors, "kicker")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.kicker}
                    onChange={(event) => updateDraft("kicker", event.target.value)}
                    maxLength={80}
                  />
                </FormField>
              </div>

              <div className="mt-5 grid gap-5">
                <FormField label="Summary" error={fieldError(errors, "summary")}>
                  <Textarea
                    className="min-h-24"
                    value={draft.summary}
                    onChange={(event) => updateDraft("summary", event.target.value)}
                    maxLength={320}
                    aria-invalid={Boolean(fieldError(errors, "summary"))}
                  />
                </FormField>
                <FormField label="Body" error={fieldError(errors, "body")}>
                  <Textarea
                    className="min-h-40"
                    value={draft.body}
                    onChange={(event) => updateDraft("body", event.target.value)}
                    maxLength={6000}
                    aria-invalid={Boolean(fieldError(errors, "body"))}
                  />
                </FormField>
              </div>

              <div className="mt-7 border-t border-border pt-7">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                      Highlights
                    </h3>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      Ordered short points used by the public program layout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addHighlight}
                    disabled={draft.highlights.length >= 200}
                    className="rounded-lg border border-border px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                  >
                    Add highlight
                  </button>
                </div>
                {fieldError(errors, "highlights")}
                {draft.highlights.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
                    No highlights added.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.highlights.map((highlight, index) => (
                      <div key={`${index}-${draft.highlights.length}`} className="flex items-start gap-2">
                        <input
                          className={ADMIN_INPUT_CLASS}
                          value={highlight}
                          onChange={(event) => setHighlight(index, event.target.value)}
                          maxLength={320}
                          aria-label={`Highlight ${index + 1}`}
                        />
                        <button type="button" onClick={() => reorderHighlight(index, -1)} disabled={index === 0} className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground disabled:opacity-20" aria-label={`Move highlight ${index + 1} up`}>↑</button>
                        <button type="button" onClick={() => reorderHighlight(index, 1)} disabled={index === draft.highlights.length - 1} className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground disabled:opacity-20" aria-label={`Move highlight ${index + 1} down`}>↓</button>
                        <button type="button" onClick={() => removeHighlight(index)} className="rounded-lg border border-destructive/15 px-3 py-2.5 text-xs text-destructive/70" aria-label={`Remove highlight ${index + 1}`}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-7 grid gap-5 border-t border-border pt-7 sm:grid-cols-2">
                <FormField label="Layout variant">
                  <NativeSelect value={draft.layoutVariant} onChange={(event) => updateDraft("layoutVariant", event.target.value as ProgramDraft["layoutVariant"])}>
                    <NativeSelectOption value="statement_band">Statement band</NativeSelectOption>
                    <NativeSelectOption value="detail_focus">Detail focus</NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <div className="rounded-lg border border-border p-3"><span className={ADMIN_LABEL_CLASS}>Visibility</span><p className="mt-2 font-body text-sm text-muted-foreground">{draft.status === "active" ? "Active — visible publicly" : "Hidden — admin only"}. Change visibility in Manage programs.</p></div>
              </div>
              </>
              )}

              {activeTab === "media" && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className={ADMIN_LABEL_CLASS}>Hero image</span>
                  <FileUpload
                    label="Upload hero image"
                    accept="image/jpeg,image/png,image/webp"
                    onUpload={(files) => void uploadMedia("hero", files)}
                    uploading={uploadingRole === "hero"}
                    previewUrl={draft.heroMediaPreviewUrl || null}
                    onRemove={draft.heroMediaAssetId ? () => {
                      updateDraft("heroMediaAssetId", null);
                      updateDraft("heroMediaPreviewUrl", "");
                    } : undefined}
                  />
                </div>
                <div>
                  <span className={ADMIN_LABEL_CLASS}>Detail image</span>
                  <FileUpload
                    label="Upload detail image"
                    accept="image/jpeg,image/png,image/webp"
                    onUpload={(files) => void uploadMedia("detail", files)}
                    uploading={uploadingRole === "detail"}
                    previewUrl={draft.detailMediaPreviewUrl || null}
                    onRemove={draft.detailMediaAssetId ? () => {
                      updateDraft("detailMediaAssetId", null);
                      updateDraft("detailMediaPreviewUrl", "");
                    } : undefined}
                  />
                </div>
              </div>
              )}

              {activeTab === "registration" && (
              <div className="mt-6 space-y-6">
                <AdminPanel as="div">
                  <h3 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                    Registration destination
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    Where the registration band sends visitors. An open Onzio
                    form takes priority when selected. A draft or closed form
                    falls back to the button link below; with neither
                    available, visitors see the &ldquo;coming soon&rdquo; text.
                  </p>

                  <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-none accent-primary"
                      checked={draft.registrationEnabled}
                      onChange={(event) =>
                        updateDraft("registrationEnabled", event.target.checked)
                      }
                    />
                    <span>
                      <span className="block font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground">
                        Show the registration section on this program page
                      </span>
                      <span className="mt-1 block font-body text-xs text-muted-foreground">
                        When on, this program leads with the registration band and
                        its image gallery instead of the standard highlight band.
                      </span>
                    </span>
                  </label>

                  <div className="mt-5">
                    <FormField label="Onzio registration form">
                      <NativeSelect value={draft.registrationFormId ?? ""} onChange={(event) => updateDraft("registrationFormId", event.target.value || null)}>
                        <NativeSelectOption value="">No native form — use the button link below</NativeSelectOption>
                        {registrationForms.map((form) => (
                          <NativeSelectOption key={form.id} value={form.id}>{form.title} — {form.status}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                      Only an open form launches the native registration modal. Draft and closed forms preserve the external-link fallback.
                    </p>
                  </div>

                  {/* These fields remain the fallback whenever no linked Onzio
                      form resolves open. */}
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <FormField label="Button label" error={fieldError(errors, "externalCtaLabel")}>
                      <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaLabel} onChange={(event) => updateDraft("externalCtaLabel", event.target.value)} maxLength={40} placeholder="Register" />
                    </FormField>
                    <FormField label="Button link" error={fieldError(errors, "externalCtaHref")}>
                      <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaHref} onChange={(event) => updateDraft("externalCtaHref", event.target.value)} maxLength={2048} placeholder="https://… or /contact" />
                    </FormField>
                  </div>
                </AdminPanel>

                <AdminPanel as="div">
                  <h3 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                    Registration band copy
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    The wording shown on the registration band itself. Every
                    field below starts filled in with the standard wording —
                    edit it, or clear a field to keep it updating automatically
                    if the standard wording ever changes.
                  </p>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <FormField
                      label="Registration eyebrow"
                      error={fieldError(errors, "registrationEyebrow")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationEyebrow}
                        onChange={(event) =>
                          updateDraft("registrationEyebrow", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.eyebrow}
                      />
                    </FormField>
                    <FormField
                      label="Registration headline"
                      error={fieldError(errors, "registrationHeadline")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationHeadline}
                        onChange={(event) =>
                          updateDraft("registrationHeadline", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.headline}
                      />
                    </FormField>
                  </div>

                  <div className="mt-5 grid gap-5">
                    <FormField
                      label="Registration body — link published"
                      error={fieldError(errors, "registrationBody")}
                    >
                      <Textarea
                        className="min-h-24"
                        value={draft.registrationBody}
                        onChange={(event) =>
                          updateDraft("registrationBody", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.body}
                        aria-invalid={Boolean(fieldError(errors, "registrationBody"))}
                      />
                    </FormField>
                    <FormField
                      label="Registration body — no link yet"
                      error={fieldError(errors, "registrationPendingBody")}
                    >
                      <Textarea
                        className="min-h-24"
                        value={draft.registrationPendingBody}
                        onChange={(event) =>
                          updateDraft("registrationPendingBody", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.pendingBody}
                        aria-invalid={Boolean(fieldError(errors, "registrationPendingBody"))}
                      />
                    </FormField>
                    <FormField
                      label="Placeholder button text — no link yet"
                      error={fieldError(errors, "registrationPendingLabel")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationPendingLabel}
                        onChange={(event) =>
                          updateDraft(
                            "registrationPendingLabel",
                            event.target.value,
                          )
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.pendingLabel}
                      />
                    </FormField>
                  </div>
                </AdminPanel>

                <AdminPanel as="div">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                        Registration image gallery
                      </h3>
                      <p className="mt-1 max-w-xl font-body text-xs leading-5 text-muted-foreground">
                        Photos beside the registration section. Two or more
                        cross-fade as a slideshow. Up to{" "}
                        {PROGRAM_MEDIA_LIMITS.items} images; JPEG, PNG, or WebP.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => galleryInput.current?.click()}
                      disabled={
                        uploadingGallery ||
                        gallery.length >= PROGRAM_MEDIA_LIMITS.items
                      }
                      className="rounded-lg border border-border px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                    >
                      {uploadingGallery && <AdminLoadingDots className="mr-2" />}
                      {uploadingGallery ? "Uploading…" : "Add image"}
                    </button>
                    <input
                      ref={galleryInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) =>
                        void uploadGalleryImage(event.target.files)
                      }
                    />
                  </div>

                  {gallery.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
                      No gallery images yet. Without them the registration section
                      shows this program&rsquo;s detail or hero photo.
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {gallery.map((item, index) => (
                        <li
                          key={item.id ?? `new-${index}`}
                          className="rounded-xl border border-border bg-muted/40 p-3"
                        >
                          <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted">
                            {item.url ? (
                              <ResilientImage
                                src={item.url}
                                alt={item.alt || `Gallery image ${index + 1}`}
                                fill
                                sizes="(max-width: 640px) 100vw, 40vw"
                                className="object-cover"
                              />
                            ) : null}
                            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-display text-[0.6rem] font-bold uppercase tracking-wider text-white">
                              {index + 1}
                            </span>
                          </div>
                          <input
                            className={`${ADMIN_INPUT_CLASS} mt-3`}
                            value={item.alt}
                            onChange={(event) =>
                              setGalleryAlt(index, event.target.value)
                            }
                            maxLength={PROGRAM_MEDIA_LIMITS.alt}
                            placeholder="Describe this photo"
                            aria-label={`Gallery image ${index + 1} description`}
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => reorderGallery(index, -1)}
                              disabled={index === 0}
                              className="flex-1 rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground transition hover:bg-accent disabled:opacity-20"
                              aria-label={`Move gallery image ${index + 1} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => reorderGallery(index, 1)}
                              disabled={index === gallery.length - 1}
                              className="flex-1 rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground transition hover:bg-accent disabled:opacity-20"
                              aria-label={`Move gallery image ${index + 1} down`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeGalleryImage(index)}
                              className="rounded-md border border-destructive/15 px-3 py-1.5 font-display text-xs uppercase text-destructive/70"
                              aria-label={`Remove gallery image ${index + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </AdminPanel>
              </div>
              )}
              </SlidingPanel>
              </> : <p className="font-body text-sm leading-6 text-muted-foreground">Tap a section in the public page to edit it. Changes appear on your website after Save.</p>}
            </section>
          )}

          {pageView === "detail" && draft && (
            <aside className="program-editor-detail-canvas min-w-0 self-start rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-40">
              <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Program page preview
              </p>
              <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                The real public page, including unsaved changes. Turning the
                Registration tab&rsquo;s toggle on shows the registration band
                exactly where visitors would find it.
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <ProgramCanvasFrame path={`/programs/${previewProgram.slug || "new-program"}`} onSelect={selectCanvasSection} onProgramLink={(slug) => { const found = programs.find((program) => program.slug === slug); if (found) selectProgram(found); }}>
                  <TemplateFontScope templateKey={club.presentationTemplateKey}>
                    <AcademyProgramDetailPage program={previewProgram} otherPrograms={previewOtherPrograms} editorPreview />
                  </TemplateFontScope>
                </ProgramCanvasFrame>
              </div>
            </aside>
          )}
        </div>
      )}
        {!loading && (pageView === "detail" || managementDirty) && !selectedSection && <div className="program-editor-mobile-save">
          <span>{pageView === "detail" ? (draft?.displayTitle || "Program page") : "Programs directory"}</span>
          <button type="button" onClick={() => void (pageView === "detail" ? saveProgram() : saveManagement())} disabled={pageView === "detail" ? !dirty || saving || uploadingRole !== null || uploadingGallery : !managementDirty || managementSaving}>{pageView === "detail" ? (saving ? "Saving…" : "Save program") : (managementSaving ? "Saving…" : "Save page")}</button>
        </div>}
        </div>
      </div>
    </AdminPage>
  );
}

/**
 * One row in the "Program order" list. Wraps `useSortableRow` so dragging
 * the grip handle reorders the list; the handle's listeners are withheld
 * while `dragDisabled` (the list is filtered), matching the DndContext's
 * empty `sensors` array in the parent so a filtered drag cannot silently no-op
 * — the handle simply cannot start one at all.
 */
/**
 * One read-only row in the "This program" summary panel: a label/value pair
 * drawn entirely from state already loaded for the selected draft (no new
 * fields, no new fetches) — a compact recap of layout, highlights,
 * registration, and media so an admin can sanity-check a program without
 * opening every tab.
 */
function ThisProgramStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 font-body text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-bold ${toneClass}`}>{value}</dd>
    </div>
  );
}

function ProgramListRow({
  program,
  isSelected,
  onSelect,
  onToggleVisibility,
  dragDisabled,
}: {
  program: ProgramDraft;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  dragDisabled: boolean;
}) {
  const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(
    program.id ?? "",
  );
  const isActive = program.status === "active";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border p-2 transition ${
        isSelected ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      } ${isDragging ? "relative z-10 opacity-60 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          {...(dragDisabled ? {} : attributes)}
          {...(dragDisabled ? {} : listeners)}
          disabled={dragDisabled}
          aria-label={`Reorder ${program.displayTitle || "program"}`}
          title={dragDisabled ? "Clear the filter to reorder" : "Drag to reorder"}
          className="mt-1.5 flex h-8 w-6 flex-none cursor-grab items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="w-full min-w-0 rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-ring/60"
        >
          <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">
            {program.displayTitle || "Untitled program"}
          </span>
          <span className="mt-1 block truncate font-body text-xs text-muted-foreground">
            /programs/{program.slug}
          </span>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
              isActive ? "bg-success/10 text-success" : "bg-card text-muted-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 flex-none rounded-full ${
                isActive ? "bg-success" : "bg-muted-foreground"
              }`}
            />
            {program.status}
          </span>
        </button>
      </div>
      <button type="button" onClick={onToggleVisibility} className="mt-2 min-h-11 w-full rounded-lg border border-border px-3 py-2 text-left font-body text-xs font-semibold text-foreground hover:bg-accent">{isActive ? "Hide from website" : "Show on website"}</button>
    </div>
  );
}

function ProgramTabs({
  value,
  onChange,
  disabled,
}: {
  value: ProgramEditorTab;
  onChange: (value: ProgramEditorTab) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 grid gap-1 rounded-lg bg-card p-1 sm:grid-cols-3">
      {PROGRAM_EDITOR_TABS.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            disabled={disabled}
            aria-pressed={selected}
            className={`font-display rounded-md px-3 py-2 text-[0.68rem] uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
              selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={ADMIN_LABEL_CLASS}>{label}</span>
      {children}
      {error}
    </label>
  );
}
