"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "lucide-react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import ScaledTryoutsPreview from "@/components/admin/ScaledTryoutsPreview";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/admin-client";
import type {
  DBContactProfile,
  DBProgram,
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

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 font-body text-sm text-white outline-none transition placeholder:text-white/20 focus:border-red-500/60 focus:bg-white/[0.06]";
const LABEL_CLASS =
  "mb-2 block font-display text-xs font-bold uppercase tracking-[0.18em] text-white/45";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 font-body text-xs text-red-300" role="alert">
      {message}
    </p>
  ) : null;
}

export default function AdminTryoutsPage() {
  const club = useClubContext();
  // academy@1 keeps this editor to the fields its public page actually shows.
  // Program association is not rendered anywhere on AcademyTryoutsPage, and no
  // hero image has ever been attached (tryouts.hero_media_asset_id is null for
  // every row), so both are hidden here. Nothing is deleted: the column, the
  // upload pipeline, and every other template's editor are untouched.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const heroInput = useRef<HTMLInputElement>(null);
  const [tryouts, setTryouts] = useState<TryoutDraft[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [draft, setDraft] = useState<TryoutDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<TryoutValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
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
      const [tryoutsResult, programsResult, contactResult, pageCopyResult] =
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
        ]);
      const loadError =
        tryoutsResult.error ?? programsResult.error ?? pageCopyResult.error;
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
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-red-400/75">
            Public website
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase leading-none text-white sm:text-5xl">
            Tryouts
          </h1>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/45">
            {isAcademy
              ? "Manage public event status, logistics, and the external registration action. Registration stays on the external destination."
              : "Manage public event status, logistics, media, program association, and the external registration action. Registration stays on the external destination."}
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-red-600 px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Create tryout
        </button>
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-red-400/25 bg-red-400/[0.08] px-4 py-3 font-body text-sm text-red-200" role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section className="mb-6 rounded-2xl border border-white/[0.06] bg-[#151515] p-5 sm:p-7">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-sm font-black uppercase tracking-wider text-white">
                Tryouts page intro
              </h2>
              <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-white/35">
                The paragraph at the top of your public Tryouts page. The page
                shows one of these two depending on whether you have any events
                published. Both start filled in with the standard wording —
                edit it, or clear a field to keep it updating automatically if
                the standard wording ever changes.
              </p>
            </div>
            {pageCopyDirty && (
              <span className="self-start rounded-full bg-amber-300/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-amber-200">
                Unsaved changes
              </span>
            )}
          </div>

          {pageCopyError && (
            <div className="mb-5 rounded-lg border border-red-400/25 bg-red-400/[0.08] px-4 py-3 font-body text-sm text-red-200" role="alert">
              {pageCopyError}
            </div>
          )}

          <div className="grid gap-5">
            <Field
              label="Intro shown when tryouts are published"
              error={pageCopyErrors.introWithTryouts}
            >
              <textarea
                className={`${INPUT_CLASS} min-h-24 resize-y`}
                value={pageCopy.introWithTryouts}
                onChange={(event) =>
                  updatePageCopy("introWithTryouts", event.target.value)
                }
                maxLength={TRYOUTS_PAGE_LIMITS.introWithTryouts}
              />
            </Field>
            <Field
              label="Intro shown when none are published"
              error={pageCopyErrors.introNoTryouts}
            >
              <textarea
                className={`${INPUT_CLASS} min-h-24 resize-y`}
                value={pageCopy.introNoTryouts}
                onChange={(event) =>
                  updatePageCopy("introNoTryouts", event.target.value)
                }
                maxLength={TRYOUTS_PAGE_LIMITS.introNoTryouts}
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center gap-4 border-t border-white/[0.06] pt-6">
            <button
              type="button"
              onClick={() => void savePageCopy()}
              disabled={pageCopySaving || !pageCopyDirty}
              className="rounded-lg bg-red-600 px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {pageCopySaving ? "Saving…" : "Save page intro"}
            </button>
            {pageCopySaved && !pageCopyDirty && (
              <span className="font-body text-xs text-emerald-300" role="status">
                Page intro saved
              </span>
            )}
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-6 py-16 text-center font-body text-sm text-white/45" role="status">
          Loading tryout events…
        </div>
      ) : tryouts.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <h2 className="font-display text-xl font-black uppercase text-white">
            No tryout events yet
          </h2>
          <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-white/45">
            Create an upcoming, open, or closed public opportunity. Blank logistics render honestly as TBA.
          </p>
          <button type="button" onClick={startCreate} className="mt-6 rounded-lg border border-white/15 px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/[0.05]">
            Create tryout
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl border border-white/[0.06] bg-[#151515] p-3 lg:sticky lg:top-8">
            <p className="px-3 pb-3 pt-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
              Event order
            </p>
            <div className="space-y-2">
              {tryouts.map((tryout, index) => (
                <div key={tryout.id} className={`rounded-xl border p-2 ${draft?.id === tryout.id ? "border-red-500/35 bg-red-500/[0.08]" : "border-white/[0.05] bg-white/[0.02]"}`}>
                  <button type="button" onClick={() => selectTryout(tryout)} className="w-full rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-red-400/60">
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-white">
                      {tryout.headline || "Untitled tryout"}
                    </span>
                    <span className="mt-1 block font-body text-xs text-white/35">
                      {tryout.eventDate || "Date TBA"}
                    </span>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${tryout.status === "open" ? "bg-emerald-400/10 text-emerald-300" : tryout.status === "closed" ? "bg-white/[0.06] text-white/40" : "bg-amber-300/10 text-amber-200"}`}>
                      {tryout.status}
                    </span>
                  </button>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => void reorderTryout(index, -1)} disabled={index === 0} className="rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 disabled:opacity-20" aria-label={`Move tryout ${index + 1} up`}>Up</button>
                    <button type="button" onClick={() => void reorderTryout(index, 1)} disabled={index === tryouts.length - 1} className="rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 disabled:opacity-20" aria-label={`Move tryout ${index + 1} down`}>Down</button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {draft && (
            <section className="rounded-2xl border border-white/[0.06] bg-[#151515] p-5 sm:p-7">
              <div className="mb-7 flex flex-col gap-3 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                    {draft.id ? "Edit tryout" : "New tryout"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-white">
                    {draft.headline || "Untitled tryout"}
                  </h2>
                </div>
                {dirty && <span className="self-start rounded-full bg-amber-300/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-amber-200">Unsaved changes</span>}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {!isAcademy && (
                  <Field label="Program association">
                    <select className={INPUT_CLASS} value={draft.programId ?? ""} onChange={(event) => updateDraft("programId", event.target.value || null)}>
                      <option value="">General club tryout</option>
                      {programs.map((program) => <option key={program.id} value={program.id}>{program.display_title}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Status">
                  <select className={INPUT_CLASS} value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TryoutDraft["status"])}>
                    <option value="upcoming">Upcoming — details can be TBA</option>
                    <option value="open">Open — registration may be shown</option>
                    <option value="closed">Closed — registration is hidden</option>
                  </select>
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
                  <input className={INPUT_CLASS} value={draft.headline} onChange={(event) => updateDraft("headline", event.target.value)} maxLength={80} placeholder="Spring evaluation" />
                </Field>
              </div>

              <div className="mt-7 grid gap-5 border-t border-white/[0.06] pt-7 sm:grid-cols-3">
                <Field label="Event date" error={errors.eventDate}>
                  <input type="date" className={INPUT_CLASS} value={draft.eventDate} onChange={(event) => updateDraft("eventDate", event.target.value)} />
                </Field>
                <Field label="Location" error={errors.location}>
                  <input className={INPUT_CLASS} value={draft.location} onChange={(event) => updateDraft("location", event.target.value)} maxLength={160} placeholder="Blank displays TBA" />
                </Field>
                <Field label="Cost" error={errors.costText}>
                  <input className={INPUT_CLASS} value={draft.costText} onChange={(event) => updateDraft("costText", event.target.value)} maxLength={120} placeholder="Blank displays TBA" />
                </Field>
              </div>

              <div className="mt-7 grid gap-5 border-t border-white/[0.06] pt-7 sm:grid-cols-2">
                <Field label="Button text" error={errors.ctaLabel}>
                  <input className={INPUT_CLASS} value={draft.ctaLabel} onChange={(event) => updateDraft("ctaLabel", event.target.value)} maxLength={40} placeholder="Register externally" />
                </Field>
                <Field label="External registration destination" error={errors.registrationHref}>
                  <input className={INPUT_CLASS} value={draft.registrationHref} onChange={(event) => updateDraft("registrationHref", event.target.value)} maxLength={2048} placeholder="https://registration-partner.example/…" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Closed message" error={errors.closedMessage}>
                    <textarea className={`${INPUT_CLASS} min-h-24 resize-y`} value={draft.closedMessage} onChange={(event) => updateDraft("closedMessage", event.target.value)} maxLength={320} />
                  </Field>
                  <p className="mt-2 font-body text-xs leading-5 text-white/35">
                    Missing or invalid destinations never render as registration actions. Closed events always use the safe Contact fallback when available.
                  </p>
                </div>
              </div>

              {!isAcademy && (
              <div className="mt-7 border-t border-white/[0.06] pt-7">
                <span className={LABEL_CLASS}>Hero image</span>
                <div className="overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/20">
                  {draft.heroMediaPreviewUrl ? (
                    <div className="relative aspect-[16/7] w-full border-b border-white/10">
                      <ResilientImage src={draft.heroMediaPreviewUrl} alt="Tryouts hero preview" fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
                    </div>
                  ) : (
                    <div className="flex aspect-[16/5] items-center justify-center px-6 text-center font-body text-xs text-white/30">
                      {draft.heroMediaAssetId ? "Published hero media attached" : "No hero image attached"}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => heroInput.current?.click()} disabled={uploading || saving} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-display text-xs font-black uppercase tracking-[0.15em] text-white/70 disabled:opacity-40">
                      {uploading && <Loader className="mr-2 inline size-4 animate-spin" />}
                      {uploading ? "Uploading…" : "Upload hero image"}
                    </button>
                    {draft.heroMediaAssetId && <button type="button" onClick={() => { updateDraft("heroMediaAssetId", null); updateDraft("heroMediaPreviewUrl", ""); }} disabled={uploading || saving} className="font-display text-xs font-bold uppercase tracking-[0.15em] text-white/35 transition hover:text-red-300 disabled:opacity-40">Remove image</button>}
                    <input ref={heroInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void uploadHero(event.target.files)} />
                  </div>
                </div>
              </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-4 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <AdminSaveFeedback saving={saving || uploading} saved={saved} savingLabel={uploading ? "Uploading hero image…" : "Saving tryout…"} successLabel="Tryout saved" />
                  <p className="mt-2 max-w-xl font-body text-xs leading-5 text-white/30">
                    Onzio stores public content only—never registrations, participant details, payment, waiver, or medical data.
                  </p>
                </div>
                <button type="button" onClick={() => void saveTryout()} disabled={saving || uploading || !dirty} className="rounded-lg bg-red-600 px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35">
                  {(saving || uploading) && <Loader className="mr-2 inline size-4 animate-spin" />}
                  Save changes
                </button>
              </div>

            </section>
          )}
        </div>
      )}

      {!loading && (
        <section className="mt-6 rounded-2xl border border-white/[0.06] bg-[#151515] p-5 sm:p-7">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
            Tryouts page preview
          </p>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-white/30">
            The real public page, at desktop proportions and scaled to fit.
            Every saved event is shown, including the one being edited with its
            unsaved changes. Blank logistics render as TBA exactly as visitors
            see them.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
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
      <span className={LABEL_CLASS}>{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}
