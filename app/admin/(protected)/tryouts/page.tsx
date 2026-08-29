"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
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
import FileUpload from "@/components/admin/FileUpload";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import ScaledTryoutsPreview from "@/components/admin/ScaledTryoutsPreview";
import { useClubContext } from "@/components/ClubContextProvider";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import type {
  DBContactProfile,
  DBProgram,
  DBRegistrationForm,
  DBTryout,
  DBTryoutsPageContent,
} from "@/lib/db-types";
import { mapTryout } from "@/lib/queries";
import {
  buildTryoutMutationPayload,
  buildTryoutsPageMutationPayload,
  emptyTryoutDraft,
  emptyTryoutsPageDraft,
  moveTryout,
  tryoutDraftToRow,
  tryoutsPageToDraft,
  tryoutToDraft,
  validateTryoutDraft,
  validateTryoutsPageDraft,
  type TryoutDraft,
  type TryoutsPageDraft,
  type TryoutsPageValidationErrors,
  type TryoutValidationErrors,
} from "@/lib/tryout-admin";
import {
  resolveTryoutsPageContent,
  TRYOUTS_PAGE_LIMITS,
} from "@/lib/tryouts-page-content";

type ProgramOption = Pick<DBProgram, "id" | "display_title">;
type RegistrationFormOption = Pick<DBRegistrationForm, "id" | "title" | "status">;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

export default function AdminTryoutsPage() {
  const club = useClubContext();
  // academy@1 and editorial@1 keep this editor to the fields their public
  // pages actually show. Program association is not rendered anywhere on
  // AcademyTryoutsPage or EditorialTryouts, and no hero image has ever been
  // attached (tryouts.hero_media_asset_id is null for every row), so both are
  // hidden for these templates. Nothing is deleted: the column, the upload
  // pipeline, and every other template's editor are untouched.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const showsProgramAndHeroFields = !isAcademy && !isEditorial;
  const heroInput = useRef<HTMLInputElement>(null);
  // The page intro used to sit as a full-width "wall" above the event list,
  // always rendered whether or not you were there to edit it. It now lives
  // behind its own rail entry so the events workspace is the default view;
  // switching sections never touches either section's own save state.
  const [activeSection, setActiveSection] = useState<"page-intro" | "events">(
    "events",
  );
  const [tryouts, setTryouts] = useState<TryoutDraft[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [registrationForms, setRegistrationForms] = useState<RegistrationFormOption[]>([]);
  const [draft, setDraft] = useState<TryoutDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const showFullLoader = useDelayedLoading(loading, 400);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<TryoutValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Delete lives in its own overflow menu on the editor panel, deliberately
  // apart from the aside's Up/Down reorder buttons, so a misclick while
  // reordering can never land on it.
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  // The public page turns a missing registration link into a mailto action on
  // the club's own published address, so the preview needs that address to be
  // honest about what a visitor would actually see.
  const [contactEmail, setContactEmail] = useState("");
  // The two /tryouts intro paragraphs are a per-club singleton
  // (onzio.tryouts_page_content), not part of any one event, so they have their
  // own draft, their own validation, and their own save button — the same
  // "each section saves independently" shape /admin/shop and /admin/programs
  // already use.
  const [pageCopy, setPageCopy] = useState<TryoutsPageDraft>(
    emptyTryoutsPageDraft,
  );
  const [pageCopyErrors, setPageCopyErrors] =
    useState<TryoutsPageValidationErrors>({});
  const [pageCopyDirty, setPageCopyDirty] = useState(false);
  const [pageCopySaving, setPageCopySaving] = useState(false);
  const [pageCopySaved, setPageCopySaved] = useState(false);
  const [pageCopyError, setPageCopyError] = useState<string | null>(null);

  const loadTryouts = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [tryoutsResult, programsResult, contactResult, pageCopyResult, registrationFormsResult] =
        await Promise.all([
          createClient()
            .from("tryouts")
            .select("*")
            .order("sort_order", { ascending: true }),
          createClient()
            .from("programs")
            .select("id, display_title")
            .order("sort_order", { ascending: true }),
          createClient().from("contact_profile").select("public_email").limit(1),
          createClient().from("tryouts_page_content").select("*").limit(1),
          createClient()
            .from("registration_forms")
            .select("id,title,status")
            .order("title", { ascending: true }),
        ]);
      const loadError =
        tryoutsResult.error ?? programsResult.error ?? contactResult.error ??
        pageCopyResult.error ?? registrationFormsResult.error;
      if (loadError) throw new Error(loadError.message);
      setPageCopy(
        tryoutsPageToDraft(
          ((pageCopyResult.data ?? []) as DBTryoutsPageContent[])[0] ?? null,
        ),
      );
      setPageCopyErrors({});
      setPageCopyDirty(false);
      setContactEmail(
        ((contactResult.data ?? []) as Pick<
          DBContactProfile,
          "public_email"
        >[])[0]?.public_email ?? "",
      );
      const next = ((tryoutsResult.data ?? []) as DBTryout[]).map(tryoutToDraft);
      setTryouts(next);
      setPrograms((programsResult.data ?? []) as ProgramOption[]);
      setRegistrationForms((registrationFormsResult.data ?? []) as RegistrationFormOption[]);
      const selected =
        next.find((tryout) => tryout.id === preferredId) ?? next[0] ?? null;
      setDraft(selected ? { ...selected } : null);
      setDirty(false);
      setErrors({});
    } catch (loadError) {
      setError(errorMessage(loadError, "Unable to load tryout events"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTryouts();
  }, [club.id, loadTryouts]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  useEffect(() => {
    if (!deleteMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!deleteMenuRef.current?.contains(event.target as Node)) {
        setDeleteMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDeleteMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteMenuOpen]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  function updateDraft<K extends keyof TryoutDraft>(
    field: K,
    value: TryoutDraft[K],
  ) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    markDirty();
  }

  function updatePageCopy<K extends keyof TryoutsPageDraft>(
    field: K,
    value: TryoutsPageDraft[K],
  ) {
    setPageCopy((current) => ({ ...current, [field]: value }));
    setPageCopyErrors((current) => ({ ...current, [field]: undefined }));
    setPageCopyDirty(true);
    setPageCopySaved(false);
    setPageCopyError(null);
  }

  async function savePageCopy() {
    const validation = validateTryoutsPageDraft(pageCopy);
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
        .from("tryouts_page_content")
        .upsert(buildTryoutsPageMutationPayload(pageCopy))
        .select("*")
        .single();
      if (saveError || !data) {
        throw new Error(saveError?.message ?? "Unable to save the page copy");
      }
      setPageCopy(tryoutsPageToDraft(data as DBTryoutsPageContent));
      setPageCopyDirty(false);
      setPageCopyErrors({});
      setPageCopySaved(true);
    } catch (saveError) {
      setPageCopyError(errorMessage(saveError, "Unable to save the page copy"));
    } finally {
      setPageCopySaving(false);
    }
  }

  function selectTryout(tryout: TryoutDraft) {
    if (dirty && !window.confirm("Discard unsaved tryout changes?")) return;
    setDraft({ ...tryout });
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
    setDeleteMenuOpen(false);
    setActiveSection("events");
  }

  function startCreate() {
    if (dirty && !window.confirm("Discard unsaved tryout changes?")) return;
    setDraft(emptyTryoutDraft(tryouts.length));
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
    setDeleteMenuOpen(false);
    setActiveSection("events");
  }

  /**
   * The pinned EDITING toolbar's Discard action: reverts the draft back to
   * what is currently saved, without the navigation-away confirm() dialog
   * `selectTryout`/`startCreate` use — discarding is itself the explicit
   * "I want to lose this" action, so a second prompt would be redundant. A
   * never-saved draft reverts to a fresh empty one at the same list
   * position, mirroring `startCreate`.
   */
  function discardDraftChanges() {
    if (!draft) return;
    const savedTryout = draft.id
      ? (tryouts.find((tryout) => tryout.id === draft.id) ?? null)
      : null;
    setDraft(
      savedTryout ? { ...savedTryout } : emptyTryoutDraft(tryouts.length),
    );
    setErrors({});
    setError(null);
    setSaved(false);
    setDirty(false);
  }

  async function uploadHero(files: FileList | null) {
    const file = files?.[0];
    if (!file || !draft) return;
    setUploading(true);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      const { data, error: uploadError } = await client.storage
        .from("tryouts")
        .upload(`hero/${Date.now()}-${file.name}`, file);
      if (uploadError || !data?.assetId) {
        throw new Error(uploadError?.message ?? "Upload failed");
      }
      const { data: publicData, error: publicError } = client.storage
        .from("tryouts")
        .getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) {
        throw new Error(publicError?.message ?? "Upload failed");
      }
      setDraft((current) =>
        current
          ? {
              ...current,
              heroMediaAssetId: data.assetId,
              heroMediaPreviewUrl: publicData.publicUrl,
            }
          : current,
      );
      markDirty();
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Upload failed"));
    } finally {
      setUploading(false);
      if (heroInput.current) heroInput.current.value = "";
    }
  }

  async function saveTryout() {
    if (!draft) return;
    const validation = validateTryoutDraft(draft);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setError("Review the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      const payload = buildTryoutMutationPayload(draft);
      const mutation = draft.id
        ? client.from("tryouts").update(payload).eq("id", draft.id)
        : client.from("tryouts").insert(payload);
      const { data, error: saveError } = await mutation.select("*").single();
      if (saveError || !data) {
        throw new Error(saveError?.message ?? "Unable to save tryout");
      }
      const savedDraft = tryoutToDraft(data as DBTryout);
      savedDraft.heroMediaPreviewUrl = draft.heroMediaPreviewUrl;
      setTryouts((current) => {
        const exists = current.some((tryout) => tryout.id === savedDraft.id);
        const next = exists
          ? current.map((tryout) =>
              tryout.id === savedDraft.id ? savedDraft : tryout,
            )
          : [...current, savedDraft];
        return next.sort((left, right) => left.sortOrder - right.sortOrder);
      });
      setDraft({ ...savedDraft });
      setDirty(false);
      setErrors({});
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save tryout"));
    } finally {
      setSaving(false);
    }
  }

  async function reorderTryout(index: number, delta: -1 | 1) {
    const next = moveTryout(tryouts, index, delta);
    if (next === tryouts) return;
    setTryouts(next);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      await Promise.all(
        next
          .filter(
            (tryout): tryout is TryoutDraft & { id: string } =>
              typeof tryout.id === "string",
          )
          .map(async (tryout) => {
            const { error: reorderError } = await client
              .from("tryouts")
              .update({ sort_order: tryout.sortOrder })
              .eq("id", tryout.id);
            if (reorderError) throw new Error(reorderError.message);
          }),
      );
      setDraft((current) => {
        if (!current?.id) return current;
        const reordered = next.find((tryout) => tryout.id === current.id);
        return reordered ? { ...current, sortOrder: reordered.sortOrder } : current;
      });
      setSaved(true);
    } catch (reorderError) {
      setError(errorMessage(reorderError, "Unable to reorder tryout events"));
      await loadTryouts(draft?.id);
    }
  }

  async function deleteTryout(tryout: TryoutDraft) {
    if (!tryout.id || deletingId) return;
    setDeleteMenuOpen(false);
    if (!window.confirm("Delete this tryout event? This cannot be undone.")) {
      return;
    }
    const id = tryout.id;
    setDeletingId(id);
    setSaved(false);
    setError(null);
    try {
      const { error: deleteError } = await createClient()
        .from("tryouts")
        .delete()
        .eq("id", id);
      if (deleteError) throw new Error(deleteError.message);
      const next = tryouts.filter((item) => item.id !== id);
      setTryouts(next);
      if (draft?.id === id) {
        const nextSelected = next[0] ?? null;
        setDraft(nextSelected ? { ...nextSelected } : null);
        setErrors({});
        setDirty(false);
      }
      setSaved(true);
    } catch (deleteErrorCaught) {
      setError(errorMessage(deleteErrorCaught, "Unable to delete tryout"));
    } finally {
      setDeletingId(null);
    }
  }

  // Saved events with the current draft substituted in place, so the preview
  // reflects unsaved edits — and shows a brand new event before it exists.
  const previewRows = draft
    ? draft.id
      ? tryouts.map((tryout) => (tryout.id === draft.id ? draft : tryout))
      : [...tryouts, draft]
    : tryouts;
  const previewTryouts = previewRows.map((tryout) =>
    mapTryout(tryoutDraftToRow(tryout), contactEmail),
  );
  // Resolved through the same rule the public page uses, so a blank field
  // previews the template default rather than an empty paragraph.
  const previewPageContent = resolveTryoutsPageContent(
    buildTryoutsPageMutationPayload(pageCopy) as Partial<DBTryoutsPageContent>,
  );

  // Two coarse rail sections instead of the page intro sitting as a
  // full-width wall permanently above the event list. Each section keeps its
  // own independent save (savePageCopy / saveTryout) — the rail only decides
  // which one is visible, it never merges them.
  const sectionItems: AdminSectionRailItem[] = [
    { id: "page-intro", label: "Page intro", tag: "Saves separately", dirty: pageCopyDirty },
    { id: "events", label: "Events", count: String(tryouts.length), dirty: dirty },
  ];

  return (
    // overflow-x-clip (not overflow-hidden): clips any accidental horizontal
    // overflow on narrow viewports, but `clip` doesn't turn this wrapper into
    // a scroll container, which would silently disable the sticky
    // rail/preview columns below.
    <AdminPage className="overflow-x-clip">
      <AdminPageHeader
        eyebrow="Public website"
        title="Tryouts"
        description={
          showsProgramAndHeroFields
              ? "Manage public event status, logistics, media, program association, and native or external registration actions."
              : "Manage public event status, logistics, and native or external registration actions."
        }
        actions={<button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-primary px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Create tryout
        </button>}
      />

      {error && (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {!loading && draft && (
        <AdminPageToolbar className="sticky top-16 z-10 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Editing
            </span>
            <span className="truncate font-display text-base font-black uppercase text-foreground">
              {draft.id ? draft.headline || "Untitled tryout" : "New tryout"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
                draft.status === "open"
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-none rounded-full ${
                  draft.status === "open" ? "bg-success" : "bg-muted-foreground"
                }`}
              />
              {draft.status === "open"
                ? "Open"
                : draft.status === "upcoming"
                  ? "Upcoming"
                  : "Closed"}
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
              disabled={!dirty || saving || uploading}
              className="rounded-lg border border-border px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveTryout()}
              disabled={saving || uploading || !dirty}
              className="rounded-lg bg-primary px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
              Save changes
            </button>
          </div>
          <AdminSaveFeedback
            saving={saving || uploading}
            saved={saved}
            savingLabel={uploading ? "Uploading hero image…" : "Saving tryout…"}
            successLabel="Tryout saved"
          />
        </AdminPageToolbar>
      )}

      {loading || showFullLoader ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading tryout events" />
        ) : (
          <div
            className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]"
            role="status"
            aria-label="Loading tryout events"
          >
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="flex flex-col gap-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        )
      ) : (
        <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <AdminSectionRail
            className="self-start"
            items={sectionItems}
            value={activeSection}
            onChange={(id) => setActiveSection(id as "page-intro" | "events")}
          />

          <div className="min-w-0">
            {activeSection === "page-intro" ? (
              <AdminPanel>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
                      Tryouts page intro
                    </h2>
                    <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                      The paragraph at the top of your public Tryouts page. The page
                      shows one of these two depending on whether you have any events
                      published. Both start filled in with the standard wording —
                      edit it, or clear a field to keep it updating automatically if
                      the standard wording ever changes.
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

                <div className="grid gap-5">
                  <Field
                    label="Intro shown when tryouts are published"
                    error={pageCopyErrors.introWithTryouts}
                  >
                    <Textarea
                      className="min-h-24"
                      value={pageCopy.introWithTryouts}
                      onChange={(event) =>
                        updatePageCopy("introWithTryouts", event.target.value)
                      }
                      maxLength={TRYOUTS_PAGE_LIMITS.introWithTryouts}
                      aria-invalid={Boolean(pageCopyErrors.introWithTryouts)}
                    />
                  </Field>
                  <Field
                    label="Intro shown when none are published"
                    error={pageCopyErrors.introNoTryouts}
                  >
                    <Textarea
                      className="min-h-24"
                      value={pageCopy.introNoTryouts}
                      onChange={(event) =>
                        updatePageCopy("introNoTryouts", event.target.value)
                      }
                      maxLength={TRYOUTS_PAGE_LIMITS.introNoTryouts}
                      aria-invalid={Boolean(pageCopyErrors.introNoTryouts)}
                    />
                  </Field>
                </div>

                <div className="mt-6 flex items-center gap-4 border-t border-border pt-6">
                  <button
                    type="button"
                    onClick={() => void savePageCopy()}
                    disabled={pageCopySaving || !pageCopyDirty}
                    className="rounded-lg bg-primary px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {pageCopySaving ? "Saving…" : "Save page intro"}
                  </button>
                  {pageCopySaved && !pageCopyDirty && (
                    <span className="font-body text-xs text-success" role="status">
                      Page intro saved
                    </span>
                  )}
                </div>
              </AdminPanel>
            ) : tryouts.length === 0 && !draft ? (
              <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-sm">
                <h2 className="font-display text-xl font-black uppercase text-foreground">
                  No tryout events yet
                </h2>
                <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-muted-foreground">
                  Create an upcoming, open, or closed public opportunity. Blank logistics render honestly as TBA.
                </p>
                <button type="button" onClick={startCreate} className="mt-6 rounded-lg border border-border px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground transition hover:bg-accent">
                  Create tryout
                </button>
              </div>
            ) : (
              // Programs' conditional 3-column pattern, with one adjustment:
              // this grid is nested inside the section-rail grid above, so
              // the fixed event-order and preview columns leave the editor
              // 0px wide at lg/xl viewports. The preview therefore joins as
              // a sticky third column only from 2xl up; below that it spans
              // the full grid width beneath the editor — where the old
              // standalone preview section used to render.
              <div
                className={`grid grid-cols-1 gap-6 ${
                  draft
                    ? "lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_22rem]"
                    : "lg:grid-cols-[19rem_minmax(0,1fr)]"
                }`}
              >
                <aside className="min-w-0 self-start rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-40">
                  <p className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
                    <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Event order
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-display text-[0.65rem] font-bold text-muted-foreground">
                      {tryouts.length}
                    </span>
                  </p>
                  <div className="space-y-2">
                    {tryouts.map((tryout, index) => (
                      <div key={tryout.id} className={`rounded-xl border p-2 ${draft?.id === tryout.id ? "border-primary/40 bg-primary/10" : "border-border bg-background"}`}>
                        <button type="button" onClick={() => selectTryout(tryout)} className="w-full rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-ring/60">
                          <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">
                            {tryout.headline || "Untitled tryout"}
                          </span>
                          <span className="mt-1 block font-body text-xs text-muted-foreground">
                            {tryout.eventDate || "Date TBA"}
                          </span>
                          <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${tryout.status === "open" ? "bg-success/10 text-success" : tryout.status === "closed" ? "bg-card text-muted-foreground" : "bg-warning/10 text-warning"}`}>
                            {tryout.status}
                          </span>
                        </button>
                        {/* Delete lives in the editor panel's overflow menu,
                            not here — see the panel header on the right. Only
                            Up/Down remain on this row so a reorder click can
                            never land on a destructive action. */}
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <button type="button" onClick={() => void reorderTryout(index, -1)} disabled={index === 0} className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground disabled:opacity-20" aria-label={`Move tryout ${index + 1} up`}>Up</button>
                          <button type="button" onClick={() => void reorderTryout(index, 1)} disabled={index === tryouts.length - 1} className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground disabled:opacity-20" aria-label={`Move tryout ${index + 1} down`}>Down</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-border px-3 pt-3 font-body text-[0.65rem] leading-4 text-muted-foreground">
                    Up / Down reorders and saves the new order immediately.
                    Deleting an event is on its own menu on the editor panel,
                    not here.
                  </p>
                </aside>

                {draft && (
                  <section className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                    <div className="mb-7 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          {draft.id ? "Edit tryout" : "New tryout"}
                        </p>
                        <h2 className="mt-1 font-display text-2xl font-black uppercase text-foreground">
                          {draft.headline || "Untitled tryout"}
                        </h2>
                      </div>
                      <div className="flex items-center gap-3 self-start">
                        {dirty && <span className="rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">Unsaved changes</span>}
                        {draft.id && (
                          <div ref={deleteMenuRef} className="relative">
                            <button
                              type="button"
                              onClick={() => setDeleteMenuOpen((open) => !open)}
                              aria-haspopup="menu"
                              aria-expanded={deleteMenuOpen}
                              aria-label="More tryout actions"
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {deleteMenuOpen && (
                              <div
                                role="menu"
                                className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => void deleteTryout(draft)}
                                  disabled={deletingId === draft.id}
                                  className="flex w-full items-center rounded-md px-3 py-2 text-left font-display text-xs font-bold uppercase tracking-wider text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {deletingId === draft.id ? "Deleting…" : "Delete tryout"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* One "Name" field, stored in the existing `headline`
                          column. The separate Eyebrow input was removed with it: the
                          pair rendered as a small label stacked over a big heading
                          ("CLUB EVALUATION" over "TRYOUT OPPORTUNITY"), which reads
                          as clutter rather than as a name. The Introduction,
                          Eligibility, What to expect, and Preparation editors were
                          removed for the same reason. Every one of those columns
                          stays in the schema and any stored value round-trips
                          untouched through a save — only the inputs are gone. */}
                      <Field label="Name" error={errors.headline}>
                        <input className={ADMIN_INPUT_CLASS} value={draft.headline} onChange={(event) => updateDraft("headline", event.target.value)} maxLength={80} placeholder="Spring evaluation" />
                      </Field>
                      <Field label="Status">
                        <NativeSelect value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TryoutDraft["status"])}>
                          <NativeSelectOption value="upcoming">Upcoming — details can be TBA</NativeSelectOption>
                          <NativeSelectOption value="open">Open — registration may be shown</NativeSelectOption>
                          <NativeSelectOption value="closed">Closed — registration is hidden</NativeSelectOption>
                        </NativeSelect>
                      </Field>
                      {showsProgramAndHeroFields && (
                        <div className="sm:col-span-2">
                          <Field label="Program association" badge={<TemplateOnlyBadge />}>
                            <NativeSelect value={draft.programId ?? ""} onChange={(event) => updateDraft("programId", event.target.value || null)}>
                              <NativeSelectOption value="">General club tryout</NativeSelectOption>
                              {programs.map((program) => <NativeSelectOption key={program.id} value={program.id}>{program.display_title}</NativeSelectOption>)}
                            </NativeSelect>
                          </Field>
                        </div>
                      )}
                      {!showsProgramAndHeroFields && (
                        <div className="rounded-lg border border-dashed border-border bg-background p-3 sm:col-span-2">
                          <span className={ADMIN_LABEL_CLASS}>Program association</span>
                          <p className="font-body text-xs leading-5 text-muted-foreground">
                            Not shown here — this club&apos;s site template doesn&apos;t display a program link on the public tryouts page.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-7 border-t border-border pt-7">
                      <h3 className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Logistics
                      </h3>
                      <div className="mt-4 grid gap-5 sm:grid-cols-3">
                        <Field label="Event date" error={errors.eventDate}>
                          <input type="date" className={ADMIN_INPUT_CLASS} value={draft.eventDate} onChange={(event) => updateDraft("eventDate", event.target.value)} />
                        </Field>
                        <Field label="Location" error={errors.location}>
                          <input className={ADMIN_INPUT_CLASS} value={draft.location} onChange={(event) => updateDraft("location", event.target.value)} maxLength={160} placeholder="Diverse City Training Ground" />
                        </Field>
                        <Field label="Cost" error={errors.costText}>
                          <input className={ADMIN_INPUT_CLASS} value={draft.costText} onChange={(event) => updateDraft("costText", event.target.value)} maxLength={120} placeholder="Contact the club" />
                        </Field>
                      </div>
                      {/* The single, consolidated statement of the TBA rule.
                          It used to be repeated as a "Blank displays TBA"
                          placeholder on both Location and Cost, plus an
                          unexplained "Date TBA" fallback in the Event order
                          list — three separate mentions of the same rule. */}
                      <p className="mt-3 font-body text-xs leading-5 text-muted-foreground">
                        Leave the date, location, or cost blank to display it as TBA on the public tryouts page.
                      </p>
                    </div>

                    <div className="mt-7 grid gap-5 border-t border-border pt-7 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Field label="Onzio registration form">
                          <NativeSelect value={draft.registrationFormId ?? ""} onChange={(event) => updateDraft("registrationFormId", event.target.value || null)}>
                            <NativeSelectOption value="">No native form — use the destination below</NativeSelectOption>
                            {registrationForms.map((form) => (
                              <NativeSelectOption key={form.id} value={form.id}>{form.title} — {form.status}</NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                        <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                          An open form launches the native modal. Draft, closed, or unselected forms preserve the external or contact fallback.
                        </p>
                        <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                          Native form submissions are managed in Registrations. The external destination remains the fallback when no open native form is linked.
                        </p>
                      </div>
                      <Field label="Button text" error={errors.ctaLabel}>
                        <input className={ADMIN_INPUT_CLASS} value={draft.ctaLabel} onChange={(event) => updateDraft("ctaLabel", event.target.value)} maxLength={40} placeholder="Register externally" />
                      </Field>
                      <Field label="External registration destination" error={errors.registrationHref}>
                        <input className={ADMIN_INPUT_CLASS} value={draft.registrationHref} onChange={(event) => updateDraft("registrationHref", event.target.value)} maxLength={2048} placeholder="https://registration-partner.example/…" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Closed message" error={errors.closedMessage}>
                          <Textarea className="min-h-24" value={draft.closedMessage} onChange={(event) => updateDraft("closedMessage", event.target.value)} maxLength={320} aria-invalid={Boolean(errors.closedMessage)} />
                        </Field>
                        <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                          Missing or invalid destinations never render as registration actions. Closed events always use the safe Contact fallback when available.
                        </p>
                      </div>
                    </div>

                    {showsProgramAndHeroFields && (
                    <div className="mt-7 border-t border-border pt-7">
                      <span className="mb-2 flex items-center gap-2">
                        <span className={`${ADMIN_LABEL_CLASS} mb-0`}>Hero image</span>
                        <TemplateOnlyBadge />
                      </span>
                      <FileUpload
                        label="Upload hero image"
                        accept="image/jpeg,image/png,image/webp"
                        onUpload={(files) => void uploadHero(files)}
                        uploading={uploading}
                        previewUrl={draft.heroMediaPreviewUrl || null}
                        onRemove={draft.heroMediaAssetId ? () => { updateDraft("heroMediaAssetId", null); updateDraft("heroMediaPreviewUrl", ""); } : undefined}
                        disabled={saving}
                      />
                    </div>
                    )}
                    {!showsProgramAndHeroFields && (
                    <div className="mt-7 border-t border-border pt-7">
                      <span className={ADMIN_LABEL_CLASS}>Hero image</span>
                      <p className="font-body text-xs leading-5 text-muted-foreground">
                        Not shown here — no tryouts page on this club&apos;s site template has ever displayed a hero image.
                      </p>
                    </div>
                    )}

                  </section>
                )}

                {draft && (
                  <aside className="min-w-0 self-start rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-40">
                    <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Tryouts page preview
                    </p>
                    <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
                      The real public page, at desktop proportions and scaled to
                      fit. Every saved event is shown, including the one being
                      edited with its unsaved changes. Blank logistics render as
                      TBA exactly as visitors see them.
                    </p>
                    <div className="mt-4 overflow-hidden rounded-xl border border-border">
                      <ScaledTryoutsPreview
                        tryouts={previewTryouts}
                        clubName={club.name}
                        contactEmail={contactEmail}
                        content={previewPageContent}
                      />
                    </div>
                  </aside>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPage>
  );
}

// Matches the "GENERAL TEMPLATES ONLY" pill the mockup shows on the
// Program association label and the Hero image card header for templates
// that render those fields — the counterpart to the dashed "not shown here"
// explanation academy@1/editorial@1 get instead. Reuses the tinted-pill
// convention already used for AdminTabs' active state (bg-primary/10
// text-primary), just as a badge rather than a tab.
function TemplateOnlyBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-display text-[0.6rem] font-bold uppercase tracking-wider text-primary">
      General templates only
    </span>
  );
}

function Field({
  label,
  badge,
  children,
  error,
}: {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2">
        <span className={`${ADMIN_LABEL_CLASS} mb-0`}>{label}</span>
        {badge}
      </span>
      {children}
      <FieldError message={error} />
    </label>
  );
}
