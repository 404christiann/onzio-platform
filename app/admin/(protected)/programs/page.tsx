"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/admin-client";
import type { DBProgram, DBProgramMedia } from "@/lib/db-types";
import {
  buildProgramMediaMutationPayload,
  buildProgramMutationPayload,
  emptyProgramDraft,
  moveHighlight,
  moveProgram,
  moveProgramMedia,
  programMediaToDraft,
  programToDraft,
  validateProgramDraft,
  validateProgramMedia,
  type ProgramDraft,
  type ProgramMediaDraft,
  type ProgramValidationErrors,
} from "@/lib/program-admin";
import {
  DEFAULT_PROGRAM_REGISTRATION_CONTENT,
  PROGRAM_MEDIA_LIMITS,
  PROGRAM_REGISTRATION_LIMITS,
} from "@/lib/program-content";

type MediaRole = "hero" | "detail";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 font-body text-sm text-white outline-none transition focus:border-red-500/60 focus:bg-white/[0.06]";
const LABEL_CLASS =
  "mb-2 block font-display text-xs font-bold uppercase tracking-[0.18em] text-white/45";

function fieldError(errors: ProgramValidationErrors, field: keyof ProgramValidationErrors) {
  const message = errors[field];
  return message ? (
    <p className="mt-1.5 font-body text-xs text-red-300" role="alert">
      {message}
    </p>
  ) : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminProgramsPage() {
  const club = useClubContext();
  const [programs, setPrograms] = useState<ProgramDraft[]>([]);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploadingRole, setUploadingRole] = useState<MediaRole | null>(null);
  const [errors, setErrors] = useState<ProgramValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const heroInput = useRef<HTMLInputElement>(null);
  const detailInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  // Gallery images live in their own table (onzio.program_media), so they are
  // loaded and saved alongside — not inside — the program row.
  const [gallery, setGallery] = useState<ProgramMediaDraft[]>([]);
  const [galleryByProgram, setGalleryByProgram] = useState<
    Record<string, ProgramMediaDraft[]>
  >({});
  const [removedGalleryIds, setRemovedGalleryIds] = useState<string[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const loadPrograms = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: loadError }, mediaResult] = await Promise.all([
        createClient()
          .from("programs")
          .select("*")
          .order("sort_order", { ascending: true }),
        createClient()
          .from("program_media")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);
      if (loadError) throw new Error(loadError.message);
      if (mediaResult.error) throw new Error(mediaResult.error.message);
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
      if (role === "hero" && heroInput.current) heroInput.current.value = "";
      if (role === "detail" && detailInput.current) detailInput.current.value = "";
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
    const validation = validateProgramDraft(draft);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setError("Review the highlighted fields before saving.");
      return;
    }
    const galleryError = validateProgramMedia(gallery);
    if (galleryError) {
      setError(galleryError);
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      const payload = buildProgramMutationPayload(draft);
      const mutation = draft.id
        ? client.from("programs").update(payload).eq("id", draft.id)
        : client.from("programs").insert(payload);
      const { data, error: saveError } = await mutation.select("*").single();
      if (saveError || !data) {
        throw new Error(saveError?.message ?? "Unable to save program");
      }
      const savedDraft = programToDraft(data as DBProgram);
      savedDraft.heroMediaPreviewUrl = draft.heroMediaPreviewUrl;
      savedDraft.detailMediaPreviewUrl = draft.detailMediaPreviewUrl;
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
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-red-400/75">
            Content
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase leading-none text-white sm:text-5xl">
            Programs
          </h1>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/45">
            Manage program pages, their order, media, highlights, visibility, and
            external destinations.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-red-600 px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Create program
        </button>
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-red-400/25 bg-red-400/[0.08] px-4 py-3 font-body text-sm text-red-200" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-6 py-16 text-center font-body text-sm text-white/45" role="status">
          Loading programs…
        </div>
      ) : programs.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <h2 className="font-display text-xl font-black uppercase text-white">
            No programs yet
          </h2>
          <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-white/45">
            Create the first reusable program page. Nothing is published until a
            valid program is saved as active.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-6 rounded-lg border border-white/15 px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/[0.05]"
          >
            Create program
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl border border-white/[0.06] bg-[#151515] p-3 lg:sticky lg:top-8">
            <div className="px-3 pb-3 pt-2">
              <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                Program order
              </p>
            </div>
            <div className="space-y-2">
              {programs.map((program, index) => (
                <div
                  key={program.id}
                  className={`rounded-xl border p-2 transition ${
                    draft?.id === program.id
                      ? "border-red-500/35 bg-red-500/[0.08]"
                      : "border-white/[0.05] bg-white/[0.02]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectProgram(program)}
                    className="w-full rounded-lg px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-red-400/60"
                  >
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-white">
                      {program.displayTitle || "Untitled program"}
                    </span>
                    <span className="mt-1 block truncate font-body text-xs text-white/35">
                      /programs/{program.slug}
                    </span>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
                      program.status === "active"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-white/[0.06] text-white/40"
                    }`}>
                      {program.status}
                    </span>
                  </button>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => void reorderProgram(index, -1)}
                      disabled={index === 0}
                      className="rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-20"
                      aria-label={`Move ${program.displayTitle} up`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorderProgram(index, 1)}
                      disabled={index === programs.length - 1}
                      className="rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-20"
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
            <section className="rounded-2xl border border-white/[0.06] bg-[#151515] p-5 sm:p-7">
              <div className="mb-7 flex flex-col gap-3 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
                    {draft.id ? "Edit program" : "New program"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-white">
                    {draft.displayTitle || "Untitled program"}
                  </h2>
                </div>
                {dirty && (
                  <span className="self-start rounded-full bg-amber-300/10 px-3 py-1.5 font-display text-[0.65rem] font-bold uppercase tracking-wider text-amber-200">
                    Unsaved changes
                  </span>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Slug" error={fieldError(errors, "slug")}>
                  <input
                    className={INPUT_CLASS}
                    value={draft.slug}
                    onChange={(event) => updateDraft("slug", event.target.value)}
                    placeholder="youth-academy"
                    maxLength={64}
                  />
                </FormField>
                <FormField label="Navigation label" error={fieldError(errors, "navLabel")}>
                  <input
                    className={INPUT_CLASS}
                    value={draft.navLabel}
                    onChange={(event) => updateDraft("navLabel", event.target.value)}
                    maxLength={40}
                  />
                </FormField>
                <FormField label="Display title" error={fieldError(errors, "displayTitle")}>
                  <input
                    className={INPUT_CLASS}
                    value={draft.displayTitle}
                    onChange={(event) => updateDraft("displayTitle", event.target.value)}
                    maxLength={120}
                  />
                </FormField>
                <FormField label="Kicker" error={fieldError(errors, "kicker")}>
                  <input
                    className={INPUT_CLASS}
                    value={draft.kicker}
                    onChange={(event) => updateDraft("kicker", event.target.value)}
                    maxLength={80}
                  />
                </FormField>
              </div>

              <div className="mt-5 grid gap-5">
                <FormField label="Summary" error={fieldError(errors, "summary")}>
                  <textarea
                    className={`${INPUT_CLASS} min-h-24 resize-y`}
                    value={draft.summary}
                    onChange={(event) => updateDraft("summary", event.target.value)}
                    maxLength={320}
                  />
                </FormField>
                <FormField label="Body" error={fieldError(errors, "body")}>
                  <textarea
                    className={`${INPUT_CLASS} min-h-40 resize-y`}
                    value={draft.body}
                    onChange={(event) => updateDraft("body", event.target.value)}
                    maxLength={6000}
                  />
                </FormField>
              </div>

              <div className="mt-7 border-t border-white/[0.06] pt-7">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-black uppercase tracking-wider text-white">
                      Highlights
                    </h3>
                    <p className="mt-1 font-body text-xs text-white/35">
                      Ordered short points used by the public program layout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addHighlight}
                    disabled={draft.highlights.length >= 200}
                    className="rounded-lg border border-white/10 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-white/65 transition hover:bg-white/[0.05] disabled:opacity-30"
                  >
                    Add highlight
                  </button>
                </div>
                {fieldError(errors, "highlights")}
                {draft.highlights.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center font-body text-sm text-white/30">
                    No highlights added.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.highlights.map((highlight, index) => (
                      <div key={`${index}-${draft.highlights.length}`} className="flex items-start gap-2">
                        <input
                          className={INPUT_CLASS}
                          value={highlight}
                          onChange={(event) => setHighlight(index, event.target.value)}
                          maxLength={320}
                          aria-label={`Highlight ${index + 1}`}
                        />
                        <button type="button" onClick={() => reorderHighlight(index, -1)} disabled={index === 0} className="rounded-lg border border-white/[0.08] px-3 py-2.5 text-xs text-white/45 disabled:opacity-20" aria-label={`Move highlight ${index + 1} up`}>↑</button>
                        <button type="button" onClick={() => reorderHighlight(index, 1)} disabled={index === draft.highlights.length - 1} className="rounded-lg border border-white/[0.08] px-3 py-2.5 text-xs text-white/45 disabled:opacity-20" aria-label={`Move highlight ${index + 1} down`}>↓</button>
                        <button type="button" onClick={() => removeHighlight(index)} className="rounded-lg border border-red-400/15 px-3 py-2.5 text-xs text-red-300/70" aria-label={`Remove highlight ${index + 1}`}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-7 grid gap-5 border-t border-white/[0.06] pt-7 sm:grid-cols-2">
                <MediaField
                  label="Hero image"
                  assetId={draft.heroMediaAssetId}
                  previewUrl={draft.heroMediaPreviewUrl}
                  uploading={uploadingRole === "hero"}
                  inputRef={heroInput}
                  onUpload={(files) => void uploadMedia("hero", files)}
                  onRemove={() => {
                    updateDraft("heroMediaAssetId", null);
                    updateDraft("heroMediaPreviewUrl", "");
                  }}
                />
                <MediaField
                  label="Detail image"
                  assetId={draft.detailMediaAssetId}
                  previewUrl={draft.detailMediaPreviewUrl}
                  uploading={uploadingRole === "detail"}
                  inputRef={detailInput}
                  onUpload={(files) => void uploadMedia("detail", files)}
                  onRemove={() => {
                    updateDraft("detailMediaAssetId", null);
                    updateDraft("detailMediaPreviewUrl", "");
                  }}
                />
              </div>

              <div className="mt-7 grid gap-5 border-t border-white/[0.06] pt-7 sm:grid-cols-2">
                <FormField label="Layout variant">
                  <select className={INPUT_CLASS} value={draft.layoutVariant} onChange={(event) => updateDraft("layoutVariant", event.target.value as ProgramDraft["layoutVariant"])}>
                    <option value="statement_band">Statement band</option>
                    <option value="detail_focus">Detail focus</option>
                  </select>
                </FormField>
                <FormField label="Visibility">
                  <select className={INPUT_CLASS} value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ProgramDraft["status"])}>
                    <option value="active">Active — visible publicly</option>
                    <option value="hidden">Hidden — admin only</option>
                  </select>
                </FormField>
                <FormField label="CTA label" error={fieldError(errors, "externalCtaLabel")}>
                  <input className={INPUT_CLASS} value={draft.externalCtaLabel} onChange={(event) => updateDraft("externalCtaLabel", event.target.value)} maxLength={40} placeholder="Register" />
                </FormField>
                <FormField label="CTA destination" error={fieldError(errors, "externalCtaHref")}>
                  <input className={INPUT_CLASS} value={draft.externalCtaHref} onChange={(event) => updateDraft("externalCtaHref", event.target.value)} maxLength={2048} placeholder="https://… or /contact" />
                </FormField>
              </div>

              <div className="mt-7 border-t border-white/[0.06] pt-7">
                <div className="mb-4">
                  <h3 className="font-display text-sm font-black uppercase tracking-wider text-white">
                    Registration section
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-white/35">
                    The band shown partway down the public program page. Leave a
                    field empty to keep the standard wording shown as its
                    placeholder. The button itself comes from the CTA fields
                    above — with no destination saved, visitors see the
                    &ldquo;coming soon&rdquo; text instead of a link.
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-4">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 flex-none accent-red-600"
                    checked={draft.registrationEnabled}
                    onChange={(event) =>
                      updateDraft("registrationEnabled", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block font-display text-xs font-bold uppercase tracking-[0.16em] text-white/70">
                      Show the registration section on this program page
                    </span>
                    <span className="mt-1 block font-body text-xs text-white/35">
                      When on, this program leads with the registration band and
                      its image gallery instead of the standard highlight band.
                    </span>
                  </span>
                </label>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <FormField
                    label="Registration eyebrow"
                    error={fieldError(errors, "registrationEyebrow")}
                  >
                    <input
                      className={INPUT_CLASS}
                      value={draft.registrationEyebrow}
                      onChange={(event) =>
                        updateDraft("registrationEyebrow", event.target.value)
                      }
                      maxLength={PROGRAM_REGISTRATION_LIMITS.eyebrow}
                      placeholder={DEFAULT_PROGRAM_REGISTRATION_CONTENT.eyebrow}
                    />
                  </FormField>
                  <FormField
                    label="Registration headline"
                    error={fieldError(errors, "registrationHeadline")}
                  >
                    <input
                      className={INPUT_CLASS}
                      value={draft.registrationHeadline}
                      onChange={(event) =>
                        updateDraft("registrationHeadline", event.target.value)
                      }
                      maxLength={PROGRAM_REGISTRATION_LIMITS.headline}
                      placeholder={DEFAULT_PROGRAM_REGISTRATION_CONTENT.headline}
                    />
                  </FormField>
                </div>

                <div className="mt-5 grid gap-5">
                  <FormField
                    label="Registration body — link published"
                    error={fieldError(errors, "registrationBody")}
                  >
                    <textarea
                      className={`${INPUT_CLASS} min-h-24 resize-y`}
                      value={draft.registrationBody}
                      onChange={(event) =>
                        updateDraft("registrationBody", event.target.value)
                      }
                      maxLength={PROGRAM_REGISTRATION_LIMITS.body}
                      placeholder={DEFAULT_PROGRAM_REGISTRATION_CONTENT.body}
                    />
                  </FormField>
                  <FormField
                    label="Registration body — no link yet"
                    error={fieldError(errors, "registrationPendingBody")}
                  >
                    <textarea
                      className={`${INPUT_CLASS} min-h-24 resize-y`}
                      value={draft.registrationPendingBody}
                      onChange={(event) =>
                        updateDraft("registrationPendingBody", event.target.value)
                      }
                      maxLength={PROGRAM_REGISTRATION_LIMITS.pendingBody}
                      placeholder={
                        DEFAULT_PROGRAM_REGISTRATION_CONTENT.pendingBody
                      }
                    />
                  </FormField>
                  <FormField
                    label="Placeholder button text — no link yet"
                    error={fieldError(errors, "registrationPendingLabel")}
                  >
                    <input
                      className={INPUT_CLASS}
                      value={draft.registrationPendingLabel}
                      onChange={(event) =>
                        updateDraft(
                          "registrationPendingLabel",
                          event.target.value,
                        )
                      }
                      maxLength={PROGRAM_REGISTRATION_LIMITS.pendingLabel}
                      placeholder={
                        DEFAULT_PROGRAM_REGISTRATION_CONTENT.pendingLabel
                      }
                    />
                  </FormField>
                </div>
              </div>

              <div className="mt-7 border-t border-white/[0.06] pt-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-black uppercase tracking-wider text-white">
                      Registration image gallery
                    </h3>
                    <p className="mt-1 max-w-xl font-body text-xs leading-5 text-white/35">
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
                    className="rounded-lg border border-white/10 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-white/65 transition hover:bg-white/[0.05] disabled:opacity-30"
                  >
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
                  <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center font-body text-sm text-white/30">
                    No gallery images yet. Without them the registration section
                    shows this program&rsquo;s detail or hero photo.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {gallery.map((item, index) => (
                      <li
                        key={item.id ?? `new-${index}`}
                        className="rounded-xl border border-white/[0.07] bg-black/15 p-3"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-white/[0.06] bg-black/25">
                          {item.url ? (
                            <ResilientImage
                              src={item.url}
                              alt={item.alt || `Gallery image ${index + 1}`}
                              fill
                              sizes="(max-width: 640px) 100vw, 40vw"
                              className="object-cover"
                            />
                          ) : null}
                          <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-display text-[0.6rem] font-bold uppercase tracking-wider text-white/70">
                            {index + 1}
                          </span>
                        </div>
                        <input
                          className={`${INPUT_CLASS} mt-3`}
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
                            className="flex-1 rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 transition hover:bg-white/[0.05] disabled:opacity-20"
                            aria-label={`Move gallery image ${index + 1} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => reorderGallery(index, 1)}
                            disabled={index === gallery.length - 1}
                            className="flex-1 rounded-md border border-white/[0.06] py-1.5 font-display text-xs uppercase text-white/45 transition hover:bg-white/[0.05] disabled:opacity-20"
                            aria-label={`Move gallery image ${index + 1} down`}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="rounded-md border border-red-400/15 px-3 py-1.5 font-display text-xs uppercase text-red-300/70"
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

              <div className="mt-8 flex flex-col-reverse gap-4 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <AdminSaveFeedback saving={saving} saved={saved} savingLabel="Saving program…" successLabel="Program saved" />
                <button
                  type="button"
                  onClick={() => void saveProgram()}
                  disabled={
                    saving || uploadingRole !== null || uploadingGallery || !dirty
                  }
                  className="rounded-lg bg-red-600 px-6 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Save changes
                </button>
              </div>
            </section>
          )}
        </div>
      )}
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
      <span className={LABEL_CLASS}>{label}</span>
      {children}
      {error}
    </label>
  );
}

function MediaField({
  label,
  assetId,
  previewUrl,
  uploading,
  inputRef,
  onUpload,
  onRemove,
}: {
  label: string;
  assetId: string | null;
  previewUrl: string;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (files: FileList | null) => void;
  onRemove: () => void;
}) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
      <p className={LABEL_CLASS}>{label}</p>
      <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-white/[0.06] bg-black/25">
        {previewUrl ? (
          <ResilientImage src={previewUrl} alt={`${label} preview`} fill sizes="(max-width: 640px) 100vw, 40vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center font-body text-xs text-white/30">
            {assetId ? "Published media attached" : "No media attached"}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => onUpload(event.target.files)}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-lg border border-white/10 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-white/65 transition hover:bg-white/[0.05] disabled:opacity-40"
        >
          {uploading ? "Uploading…" : assetId ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        </button>
        {assetId && (
          <button type="button" onClick={onRemove} className="rounded-lg border border-red-400/15 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-red-300/70">
            Remove
          </button>
        )}
      </div>
    </section>
  );
}
