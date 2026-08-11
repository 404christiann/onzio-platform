"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import FileUpload from "@/components/admin/FileUpload";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import ScaledProgramPreview from "@/components/admin/ScaledProgramPreview";
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
} from "@/lib/db-types";
import {
  buildProgramMediaMutationPayload,
  buildProgramMutationPayload,
  buildProgramsPageMutationPayload,
  emptyProgramDraft,
  emptyProgramsPageDraft,
  moveHighlight,
  moveProgram,
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

type MediaRole = "hero" | "detail";

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
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  const [pageCopyDirty, setPageCopyDirty] = useState(false);
  const [pageCopySaving, setPageCopySaving] = useState(false);
  const [pageCopySaved, setPageCopySaved] = useState(false);
  const [pageCopyError, setPageCopyError] = useState<string | null>(null);

  const loadPrograms = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: loadError }, mediaResult, pageCopyResult] =
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
        ]);
      if (loadError) throw new Error(loadError.message);
      if (mediaResult.error) throw new Error(mediaResult.error.message);
      if (pageCopyResult.error) throw new Error(pageCopyResult.error.message);
      setPageCopy(
        programsPageToDraft(
          ((pageCopyResult.data ?? []) as DBProgramsPageContent[])[0] ?? null,
        ),
      );
      setPageCopyErrors({});
      setPageCopyDirty(false);
      const next = ((data ?? []) as DBProgram[]).map(programToDraft);
      const grouped: Record<string, ProgramMediaDraft[]> = {};
      for (const row of (mediaResult.data ?? []) as DBProgramMedia[]) {
        (grouped[row.program_id] ??= []).push(programMediaToDraft(row));
      }
      setPrograms(next);
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
    if (dirty && !window.confirm("Discard unsaved program changes?")) return;
    setDraft({ ...program, highlights: [...program.highlights] });
    setGallery(program.id ? [...(galleryByProgram[program.id] ?? [])] : []);
    setRemovedGalleryIds([]);
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
    selectTab("content");
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

  /** Persists the gallery for a saved program: deletes, updates, inserts. */
  async function saveGallery(programId: string) {
    const client = createClient();
    for (const removedId of removedGalleryIds) {
      const { error: deleteError } = await client
        .from("program_media")
        .delete()
        .eq("id", removedId);
      if (deleteError) throw new Error(deleteError.message);
    }
    const saved: ProgramMediaDraft[] = [];
    for (const [index, item] of gallery.entries()) {
      const payload = buildProgramMediaMutationPayload(
        { ...item, sortOrder: index },
        programId,
      );
      const mutation = item.id
        ? client.from("program_media").update(payload).eq("id", item.id)
        : client.from("program_media").insert(payload);
      const { data, error: mediaError } = await mutation.select("*").single();
      if (mediaError || !data) {
        throw new Error(mediaError?.message ?? "Unable to save program media");
      }
      saved.push(programMediaToDraft(data as DBProgramMedia));
    }
    setGallery(saved);
    setRemovedGalleryIds([]);
    setGalleryByProgram((current) => ({ ...current, [programId]: saved }));
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
    try {
      const client = createClient();
      const payload = buildProgramMutationPayload(pending);
      const mutation = pending.id
        ? client.from("programs").update(payload).eq("id", pending.id)
        : client.from("programs").insert(payload);
      const { data, error: saveError } = await mutation.select("*").single();
      if (saveError || !data) {
        throw new Error(saveError?.message ?? "Unable to save program");
      }
      const savedDraft = programToDraft(data as DBProgram);
      // The mutation response is not media-hydrated the way a select is, so the
      // preview URLs already resolved for this draft are carried over.
      savedDraft.heroMediaPreviewUrl = pending.heroMediaPreviewUrl;
      savedDraft.detailMediaPreviewUrl = pending.detailMediaPreviewUrl;
      if (savedDraft.id) await saveGallery(savedDraft.id);
      setPrograms((current) => {
        const exists = current.some((program) => program.id === savedDraft.id);
        const next = exists
          ? current.map((program) =>
              program.id === savedDraft.id ? savedDraft : program,
            )
          : [...current, savedDraft];
        return next.sort((left, right) => left.sortOrder - right.sortOrder);
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
    setPageCopyDirty(true);
    setPageCopySaved(false);
    setPageCopyError(null);
  }

  async function savePageCopy() {
    const validation = validateProgramsPageDraft(pageCopy);
    if (Object.keys(validation).length > 0) {
      setPageCopyErrors(validation);
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
      setPageCopyDirty(false);
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
  const previewProgram = programDraftToContent(
    draft ?? emptyProgramDraft(0),
    gallery,
  );
  const previewOtherPrograms = programs
    .filter((program) => program.id && program.id !== draft?.id)
    .map((program) => programDraftToContent(program));

  function pageCopyFieldError(field: keyof ProgramsPageDraft) {
    const message = pageCopyErrors[field];
    return message ? (
      <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;
  }

  async function reorderProgram(index: number, delta: -1 | 1) {
    const next = moveProgram(programs, index, delta);
    if (next === programs) return;
    setPrograms(next);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      await Promise.all(
        next
          .filter(
            (program): program is ProgramDraft & { id: string } =>
              typeof program.id === "string",
          )
          .map(async (program) => {
            const { error: reorderError } = await client
              .from("programs")
              .update({ sort_order: program.sortOrder })
              .eq("id", program.id);
            if (reorderError) throw new Error(reorderError.message);
          }),
      );
      setDraft((current) => {
        if (!current?.id) return current;
        const reordered = next.find((program) => program.id === current.id);
        return reordered ? { ...current, sortOrder: reordered.sortOrder } : current;
      });
      setSaved(true);
    } catch (reorderError) {
      setError(errorMessage(reorderError, "Unable to reorder programs"));
      await loadPrograms(draft?.id);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-brand/75">
            Content
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase leading-none text-foreground sm:text-5xl">
            Programs
          </h1>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
            Manage program pages, their order, media, highlights, visibility, and
            external destinations.
          </p>
        </div>
        {!hidesProgramCreation && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-brand px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Create program
          </button>
        )}
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {!loading && !hidesPageCopyEditor && (
        <section className="mb-6 rounded-2xl border border-border bg-background p-5 sm:p-7">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
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
            {pageCopyDirty && (
              <span className="self-start rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">
                Unsaved changes
              </span>
            )}
          </div>

          {pageCopyError && (
            <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
              {pageCopyError}
            </div>
          )}

          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Homepage band
          </p>
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

          <p className="mb-3 mt-7 border-t border-border pt-7 font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Programs page header
          </p>
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

          <p className="mb-3 mt-7 border-t border-border pt-7 font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Closing band
          </p>
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

          <div className="mt-6 flex items-center gap-4 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => void savePageCopy()}
              disabled={pageCopySaving || !pageCopyDirty}
              className="rounded-lg bg-brand px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {pageCopySaving && <AdminLoadingDots className="mr-2" />}
              {pageCopySaving ? "Saving…" : "Save page copy"}
            </button>
            {pageCopySaved && !pageCopyDirty && (
              <span className="font-body text-xs text-success" role="status">
                Page copy saved
              </span>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <div
          className="max-w-sm space-y-2 rounded-2xl border border-border bg-background p-3"
          role="status"
          aria-label="Loading programs"
        >
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-2 h-5 w-16 rounded-full" />
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Skeleton className="h-7 rounded-md" />
                <Skeleton className="h-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : programs.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
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
        <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl border border-border bg-background p-3 lg:sticky lg:top-8">
            <div className="px-3 pb-3 pt-2">
              <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Program order
              </p>
            </div>
            <div className="space-y-2">
              {programs.map((program, index) => (
                <div
                  key={program.id}
                  className={`rounded-xl border p-2 transition ${
                    draft?.id === program.id
                      ? "border-brand/35 bg-brand/10"
                      : "border-border bg-card"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectProgram(program)}
                    className="w-full rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-ring/60"
                  >
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">
                      {program.displayTitle || "Untitled program"}
                    </span>
                    <span className="mt-1 block truncate font-body text-xs text-muted-foreground">
                      /programs/{program.slug}
                    </span>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
                      program.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-card text-muted-foreground"
                    }`}>
                      {program.status}
                    </span>
                  </button>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => void reorderProgram(index, -1)}
                      disabled={index === 0}
                      className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-20"
                      aria-label={`Move ${program.displayTitle} up`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorderProgram(index, 1)}
                      disabled={index === programs.length - 1}
                      className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-20"
                      aria-label={`Move ${program.displayTitle} down`}
                    >
                      Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {draft && (
            <section className="rounded-2xl border border-border bg-background p-5 sm:p-7">
              <div className="mb-7 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {draft.id ? "Edit program" : "New program"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-foreground">
                    {draft.displayTitle || "Untitled program"}
                  </h2>
                </div>
                {dirty && (
                  <span className="self-start rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">
                    Unsaved changes
                  </span>
                )}
              </div>

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
                    <p className="rounded-lg border border-border bg-black/20 px-3 py-2.5 font-body text-sm text-muted-foreground">
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
                <FormField label="Visibility">
                  <NativeSelect value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ProgramDraft["status"])}>
                    <NativeSelectOption value="active">Active — visible publicly</NativeSelectOption>
                    <NativeSelectOption value="hidden">Hidden — admin only</NativeSelectOption>
                  </NativeSelect>
                </FormField>
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
              <>
              <div className="mt-6">
                <div className="mb-4">
                  <h3 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                    Registration section
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    The band shown partway down the public program page. Every
                    field below starts filled in with the standard wording —
                    edit it, or clear a field to keep it updating automatically
                    if the standard wording ever changes. The button itself
                    comes from the button label and link fields below — with
                    no link saved, visitors see the &ldquo;coming soon&rdquo;
                    text instead of a link.
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-border bg-black/15 p-4">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 flex-none accent-brand"
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

                {/* The register button itself. Unchanged fields and unchanged
                    public behaviour — they simply live beside the section they
                    drive now, instead of several groups above it. */}
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <FormField label="Button label" error={fieldError(errors, "externalCtaLabel")}>
                    <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaLabel} onChange={(event) => updateDraft("externalCtaLabel", event.target.value)} maxLength={40} placeholder="Register" />
                  </FormField>
                  <FormField label="Button link" error={fieldError(errors, "externalCtaHref")}>
                    <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaHref} onChange={(event) => updateDraft("externalCtaHref", event.target.value)} maxLength={2048} placeholder="https://… or /contact" />
                  </FormField>
                </div>

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
              </div>

              <div className="mt-7 border-t border-border pt-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
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
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
                    No gallery images yet. Without them the registration section
                    shows this program&rsquo;s detail or hero photo.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {gallery.map((item, index) => (
                      <li
                        key={item.id ?? `new-${index}`}
                        className="rounded-xl border border-border bg-black/15 p-3"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-black/25">
                          {item.url ? (
                            <ResilientImage
                              src={item.url}
                              alt={item.alt || `Gallery image ${index + 1}`}
                              fill
                              sizes="(max-width: 640px) 100vw, 40vw"
                              className="object-cover"
                            />
                          ) : null}
                          <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-display text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
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
              </div>
              </>
              )}
              </SlidingPanel>

              <div className="mt-8 flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <AdminSaveFeedback saving={saving} saved={saved} savingLabel="Saving program…" successLabel="Program saved" />
                <button
                  type="button"
                  onClick={() => void saveProgram()}
                  disabled={
                    saving || uploadingRole !== null || uploadingGallery || !dirty
                  }
                  className="rounded-lg bg-brand px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {(saving || uploadingRole !== null || uploadingGallery) && (
                    <AdminLoadingDots className="mr-2" />
                  )}
                  Save changes
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && draft && (
        <section className="mt-6 rounded-2xl border border-border bg-background p-5 sm:p-7">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Program page preview
          </p>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
            The real public program page, at desktop proportions and scaled to
            fit, built from the program you are editing including its unsaved
            changes. Turning the Registration tab&rsquo;s toggle on shows the
            registration band exactly where visitors would find it.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <ScaledProgramPreview
              program={previewProgram}
              otherPrograms={previewOtherPrograms}
            />
          </div>
        </section>
      )}
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

