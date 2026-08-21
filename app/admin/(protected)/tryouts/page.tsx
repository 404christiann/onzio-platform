"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import FileUpload from "@/components/admin/FileUpload";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import ScaledTryoutsPreview from "@/components/admin/ScaledTryoutsPreview";
import { useClubContext } from "@/components/ClubContextProvider";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { createClient } from "@/lib/admin-client";
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
  const [tryouts, setTryouts] = useState<TryoutDraft[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [registrationForms, setRegistrationForms] = useState<RegistrationFormOption[]>([]);
  const [draft, setDraft] = useState<TryoutDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<TryoutValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
  }

  function startCreate() {
    if (dirty && !window.confirm("Discard unsaved tryout changes?")) return;
    setDraft(emptyTryoutDraft(tryouts.length));
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

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-brand/75">
            Public website
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase leading-none text-foreground sm:text-5xl">
            Tryouts
          </h1>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-muted-foreground">
            {showsProgramAndHeroFields
              ? "Manage public event status, logistics, media, program association, and native or external registration actions."
              : "Manage public event status, logistics, and native or external registration actions."}
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-brand px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Create tryout
        </button>
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section className="mb-6 rounded-2xl border border-border bg-background p-5 sm:p-7">
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
              className="rounded-lg bg-brand px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {pageCopySaving ? "Saving…" : "Save page intro"}
            </button>
            {pageCopySaved && !pageCopyDirty && (
              <span className="font-body text-xs text-success" role="status">
                Page intro saved
              </span>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <div
          className="max-w-sm space-y-2 rounded-2xl border border-border bg-background p-3"
          role="status"
          aria-label="Loading tryout events"
        >
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-2/5" />
              <Skeleton className="mt-2 h-5 w-16 rounded-full" />
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Skeleton className="h-7 rounded-md" />
                <Skeleton className="h-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : tryouts.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
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
        <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl border border-border bg-background p-3 lg:sticky lg:top-8">
            <p className="px-3 pb-3 pt-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Event order
            </p>
            <div className="space-y-2">
              {tryouts.map((tryout, index) => (
                <div key={tryout.id} className={`rounded-xl border p-2 ${draft?.id === tryout.id ? "border-brand/35 bg-brand/10" : "border-border bg-card"}`}>
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
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => void reorderTryout(index, -1)} disabled={index === 0} className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground disabled:opacity-20" aria-label={`Move tryout ${index + 1} up`}>Up</button>
                    <button type="button" onClick={() => void reorderTryout(index, 1)} disabled={index === tryouts.length - 1} className="rounded-md border border-border py-1.5 font-display text-xs uppercase text-muted-foreground disabled:opacity-20" aria-label={`Move tryout ${index + 1} down`}>Down</button>
                  </div>
                  {typeof tryout.id === "string" && (
                    <button
                      type="button"
                      onClick={() => void deleteTryout(tryout)}
                      disabled={deletingId === tryout.id}
                      className="mt-1 w-full rounded-md border border-destructive/30 py-1.5 font-display text-xs font-bold uppercase text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Delete tryout ${index + 1}`}
                    >
                      {deletingId === tryout.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {draft && (
            <section className="rounded-2xl border border-border bg-background p-5 sm:p-7">
              <div className="mb-7 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {draft.id ? "Edit tryout" : "New tryout"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-foreground">
                    {draft.headline || "Untitled tryout"}
                  </h2>
                </div>
                {dirty && <span className="self-start rounded-full bg-warning/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-warning">Unsaved changes</span>}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {showsProgramAndHeroFields && (
                  <Field label="Program association">
                    <NativeSelect value={draft.programId ?? ""} onChange={(event) => updateDraft("programId", event.target.value || null)}>
                      <NativeSelectOption value="">General club tryout</NativeSelectOption>
                      {programs.map((program) => <NativeSelectOption key={program.id} value={program.id}>{program.display_title}</NativeSelectOption>)}
                    </NativeSelect>
                  </Field>
                )}
                <Field label="Status">
                  <NativeSelect value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TryoutDraft["status"])}>
                    <NativeSelectOption value="upcoming">Upcoming — details can be TBA</NativeSelectOption>
                    <NativeSelectOption value="open">Open — registration may be shown</NativeSelectOption>
                    <NativeSelectOption value="closed">Closed — registration is hidden</NativeSelectOption>
                  </NativeSelect>
                </Field>
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
              </div>

              <div className="mt-7 grid gap-5 border-t border-border pt-7 sm:grid-cols-3">
                <Field label="Event date" error={errors.eventDate}>
                  <input type="date" className={ADMIN_INPUT_CLASS} value={draft.eventDate} onChange={(event) => updateDraft("eventDate", event.target.value)} />
                </Field>
                <Field label="Location" error={errors.location}>
                  <input className={ADMIN_INPUT_CLASS} value={draft.location} onChange={(event) => updateDraft("location", event.target.value)} maxLength={160} placeholder="Blank displays TBA" />
                </Field>
                <Field label="Cost" error={errors.costText}>
                  <input className={ADMIN_INPUT_CLASS} value={draft.costText} onChange={(event) => updateDraft("costText", event.target.value)} maxLength={120} placeholder="Blank displays TBA" />
                </Field>
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
                <span className={ADMIN_LABEL_CLASS}>Hero image</span>
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

              <div className="mt-8 flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <AdminSaveFeedback saving={saving || uploading} saved={saved} savingLabel={uploading ? "Uploading hero image…" : "Saving tryout…"} successLabel="Tryout saved" />
                  <p className="mt-2 max-w-xl font-body text-xs leading-5 text-muted-foreground">
                    Native form submissions are managed in Registrations. The external destination remains the fallback when no open native form is linked.
                  </p>
                </div>
                <button type="button" onClick={() => void saveTryout()} disabled={saving || uploading || !dirty} className="rounded-lg bg-brand px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-35">
                  {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
                  Save changes
                </button>
              </div>

            </section>
          )}
        </div>
      )}

      {!loading && (
        <section className="mt-6 rounded-2xl border border-border bg-background p-5 sm:p-7">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Tryouts page preview
          </p>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
            The real public page, at desktop proportions and scaled to fit.
            Every saved event is shown, including the one being edited with its
            unsaved changes. Blank logistics render as TBA exactly as visitors
            see them.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <ScaledTryoutsPreview
              tryouts={previewTryouts}
              clubName={club.name}
              contactEmail={contactEmail}
              content={previewPageContent}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className={ADMIN_LABEL_CLASS}>{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}
