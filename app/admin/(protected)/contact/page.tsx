"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import ScaledContactPreview from "@/components/admin/ScaledContactPreview";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/admin-client";
import type { ContactContent } from "@/lib/queries";
import {
  buildContactPagePayload,
  buildContactProfilePayload,
  contactRowsToDraft,
  emptyContactDraft,
  validateContactDraft,
  type ContactDraft,
  type ContactPageDraft,
  type ContactProfileDraft,
  type ContactValidationErrors,
} from "@/lib/contact-admin";
import type {
  DBContactPageContent,
  DBContactProfile,
} from "@/lib/db-types";

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

export default function AdminContactPage() {
  const club = useClubContext();
  // academy@1's Contact hero is the flat navy band approved in DCFC-D132 and no
  // hero image has ever been attached (contact_page_content.hero_media_asset_id
  // is null), so the upload field only ever offered a way to darken that band.
  // The field is hidden rather than deleted: AcademyContactPage still renders a
  // hero image when one exists, and every other template keeps the editor.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const heroInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<ContactValidationErrors>({});
  const [error, setError] = useState<string | null>(null);

  const loadContact = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = createClient();
      const [profileResult, pageResult] = await Promise.all([
        client.from("contact_profile").select("*").limit(1),
        client.from("contact_page_content").select("*").limit(1),
      ]);
      const loadError = profileResult.error ?? pageResult.error;
      if (loadError) throw new Error(loadError.message);
      const profile =
        ((profileResult.data ?? []) as DBContactProfile[])[0] ?? null;
      const page =
        ((pageResult.data ?? []) as DBContactPageContent[])[0] ?? null;
      setDraft(contactRowsToDraft(profile, page));
      setErrors({});
    } catch (loadError) {
      setError(errorMessage(loadError, "Unable to load contact content"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContact();
  }, [club.id, loadContact]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  function updateProfile<K extends keyof ContactProfileDraft>(
    field: K,
    value: ContactProfileDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value },
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaved(false);
    setError(null);
  }

  function updatePage<K extends keyof ContactPageDraft>(
    field: K,
    value: ContactPageDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      page: { ...current.page, [field]: value },
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaved(false);
    setError(null);
  }

  async function uploadHero(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setSaved(false);
    setError(null);
    try {
      const client = createClient();
      const { data, error: uploadError } = await client.storage
        .from("contact")
        .upload(`hero/${Date.now()}-${file.name}`, file);
      if (uploadError || !data?.assetId) {
        throw new Error(uploadError?.message ?? "Upload failed");
      }
      const { data: publicData, error: publicError } = client.storage
        .from("contact")
        .getPublicUrl(data.path);
      if (publicError || !publicData.publicUrl) {
        throw new Error(publicError?.message ?? "Upload failed");
      }
      setDraft((current) => ({
        ...current,
        page: {
          ...current.page,
          heroMediaAssetId: data.assetId,
          heroMediaPreviewUrl: publicData.publicUrl,
        },
      }));
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Upload failed"));
    } finally {
      setUploading(false);
      if (heroInput.current) heroInput.current.value = "";
    }
  }

  async function saveContact() {
    const validation = validateContactDraft(draft);
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
      const [profileResult, pageResult] = await Promise.all([
        client
          .from("contact_profile")
          .upsert([buildContactProfilePayload(draft.profile)]),
        client
          .from("contact_page_content")
          .upsert([buildContactPagePayload(draft.page)]),
      ]);
      const saveError = profileResult.error ?? pageResult.error;
      if (saveError) throw new Error(saveError.message);
      setDraft((current) => ({
        profile: {
          publicEmail: current.profile.publicEmail.trim(),
          publicPhone: current.profile.publicPhone.trim(),
          serviceArea: current.profile.serviceArea.trim(),
          hours: current.profile.hours.trim(),
        },
        page: {
          ...current.page,
          eyebrow: current.page.eyebrow.trim(),
          headline: current.page.headline.trim(),
          intro: current.page.intro.trim(),
        },
      }));
      setErrors({});
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save contact content"));
    } finally {
      setSaving(false);
    }
  }

  // The preview reads the unsaved draft, so it moves as the fields are typed.
  // Social links are edited in Branding and are not part of this draft, so the
  // preview omits that band rather than inventing rows for it.
  const previewContent: ContactContent = {
    profile: {
      publicEmail: draft.profile.publicEmail.trim(),
      publicPhone: draft.profile.publicPhone.trim(),
      serviceArea: draft.profile.serviceArea.trim(),
      hours: draft.profile.hours.trim(),
    },
    page: {
      eyebrow: draft.page.eyebrow.trim(),
      headline: draft.page.headline.trim(),
      intro: draft.page.intro.trim(),
      heroMediaUrl: draft.page.heroMediaPreviewUrl,
    },
    socialLinks: [],
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl" role="status">
        <div className="animate-pulse rounded-2xl border border-white/10 bg-[#141414] p-8 font-body text-sm text-white/45">
          Loading contact content…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <AdminSaveFeedback
        saving={saving || uploading}
        saved={saved}
        savingLabel={uploading ? "Uploading hero image…" : "Saving contact content…"}
        successLabel="Contact content saved"
      />

      <header className="mb-8">
        <p className="font-display text-xs font-black uppercase tracking-[0.2em] text-[#E7001B]">
          Public website
        </p>
        <h1
          className="mt-2 font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Contact
        </h1>
        <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-white/45">
          Manage how supporters reach the club and how that information is introduced on the Contact page.
        </p>
      </header>

      {error && (
        <div
          className="mb-6 flex flex-col gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="font-body text-sm text-red-200">{error}</p>
          {error.includes("Unable to load contact content") && (
            <button
              type="button"
              onClick={() => void loadContact()}
              className="font-display text-xs font-bold uppercase tracking-[0.16em] text-white underline decoration-white/30 underline-offset-4"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="rounded-2xl border border-white/10 bg-[#141414] p-5 sm:p-7"
          aria-labelledby="shared-contact-heading"
        >
          <div className="mb-6 border-b border-white/10 pb-5">
            <span className="inline-flex rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 font-display text-[0.65rem] font-black uppercase tracking-[0.18em] text-red-300">
              Shared club data
            </span>
            <h2
              id="shared-contact-heading"
              className="mt-3 font-display text-2xl font-black uppercase text-white"
            >
              Contact destinations
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-white/40">
              These details are canonical club information. Updating them changes every public surface that reuses club contact data.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="public-email" className={LABEL_CLASS}>Public email</label>
              <input
                id="public-email"
                type="email"
                autoComplete="email"
                value={draft.profile.publicEmail}
                onChange={(event) => updateProfile("publicEmail", event.target.value)}
                placeholder="club@example.com"
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.publicEmail)}
              />
              <FieldError message={errors.publicEmail} />
            </div>
            <div>
              <label htmlFor="public-phone" className={LABEL_CLASS}>Public phone</label>
              <input
                id="public-phone"
                type="tel"
                autoComplete="tel"
                value={draft.profile.publicPhone}
                onChange={(event) => updateProfile("publicPhone", event.target.value)}
                placeholder="+1 (847) 555-0199"
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.publicPhone)}
              />
              <FieldError message={errors.publicPhone} />
            </div>
            <div>
              <label htmlFor="service-area" className={LABEL_CLASS}>Service area</label>
              <input
                id="service-area"
                value={draft.profile.serviceArea}
                onChange={(event) => updateProfile("serviceArea", event.target.value)}
                placeholder="Schaumburg, Illinois"
                maxLength={120}
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.serviceArea)}
              />
              <FieldError message={errors.serviceArea} />
            </div>
            <div>
              <label htmlFor="hours" className={LABEL_CLASS}>Hours</label>
              <input
                id="hours"
                value={draft.profile.hours}
                onChange={(event) => updateProfile("hours", event.target.value)}
                placeholder="Optional"
                maxLength={200}
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.hours)}
              />
              <FieldError message={errors.hours} />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="font-display text-sm font-black uppercase text-white">
              Social links are managed in Branding
            </p>
            <p className="mt-1 font-body text-xs leading-5 text-white/40">
              The Contact page and footer use the same social destinations, so they remain under one canonical editor.
            </p>
            <Link
              href="/admin/branding"
              className="mt-3 inline-flex font-display text-xs font-black uppercase tracking-[0.16em] text-red-300 underline decoration-red-300/30 underline-offset-4 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400"
            >
              Edit social links
            </Link>
          </div>
        </section>

        <section
          className="rounded-2xl border border-white/10 bg-[#141414] p-5 sm:p-7"
          aria-labelledby="contact-page-heading"
        >
          <div className="mb-6 border-b border-white/10 pb-5">
            <span className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-3 py-1 font-display text-[0.65rem] font-black uppercase tracking-[0.18em] text-sky-200">
              Contact page only
            </span>
            <h2
              id="contact-page-heading"
              className="mt-3 font-display text-2xl font-black uppercase text-white"
            >
              Page presentation
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-white/40">
              {isAcademy
                ? "This copy shapes the Contact page without changing shared club destinations."
                : "This copy and hero image shape the Contact page without changing shared club destinations."}
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label htmlFor="eyebrow" className={LABEL_CLASS}>Eyebrow</label>
              <input
                id="eyebrow"
                value={draft.page.eyebrow}
                onChange={(event) => updatePage("eyebrow", event.target.value)}
                maxLength={80}
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.eyebrow)}
              />
              <FieldError message={errors.eyebrow} />
            </div>
            <div>
              <label htmlFor="headline" className={LABEL_CLASS}>Headline</label>
              <input
                id="headline"
                value={draft.page.headline}
                onChange={(event) => updatePage("headline", event.target.value)}
                maxLength={80}
                className={INPUT_CLASS}
                aria-invalid={Boolean(errors.headline)}
              />
              <FieldError message={errors.headline} />
            </div>
            <div>
              <label htmlFor="intro" className={LABEL_CLASS}>Introduction</label>
              <textarea
                id="intro"
                rows={5}
                value={draft.page.intro}
                onChange={(event) => updatePage("intro", event.target.value)}
                maxLength={320}
                className={`${INPUT_CLASS} resize-y`}
                aria-invalid={Boolean(errors.intro)}
              />
              <div className="mt-1.5 flex items-start justify-between gap-4">
                <FieldError message={errors.intro} />
                <span className="ml-auto font-body text-[0.7rem] text-white/25">
                  {draft.page.intro.length}/320
                </span>
              </div>
            </div>

            {!isAcademy && (
            <div>
              <span className={LABEL_CLASS}>Hero image</span>
              <div className="overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/20">
                {draft.page.heroMediaPreviewUrl ? (
                  <div className="relative aspect-[16/7] w-full border-b border-white/10">
                    <ResilientImage
                      src={draft.page.heroMediaPreviewUrl}
                      alt="Contact hero preview"
                      fill
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/5] items-center justify-center px-6 text-center font-body text-xs text-white/30">
                    {draft.page.heroMediaAssetId
                      ? "A published hero image is attached. Upload a replacement to preview a new image."
                      : "No hero image attached"}
                  </div>
                )}
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => heroInput.current?.click()}
                    disabled={uploading || saving}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-display text-xs font-black uppercase tracking-[0.15em] text-white/70 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploading ? "Uploading…" : "Upload hero image"}
                  </button>
                  {draft.page.heroMediaAssetId && (
                    <button
                      type="button"
                      onClick={() => {
                        updatePage("heroMediaAssetId", null);
                        updatePage("heroMediaPreviewUrl", "");
                      }}
                      disabled={uploading || saving}
                      className="font-display text-xs font-bold uppercase tracking-[0.15em] text-white/35 transition hover:text-red-300 disabled:opacity-40"
                    >
                      Remove image
                    </button>
                  )}
                  <input
                    ref={heroInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => void uploadHero(event.target.files)}
                  />
                </div>
              </div>
            </div>
            )}
          </div>
        </section>
      </div>

      {isAcademy && (
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#141414] p-5 sm:p-7">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/35">
            Contact page preview
          </p>
          <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-white/30">
            The real public page, at desktop proportions and scaled to fit,
            including the changes you have not saved yet.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
            <ScaledContactPreview content={previewContent} clubName={club.name} />
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#141414] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="max-w-xl font-body text-xs leading-5 text-white/35">
          Blank optional fields stay hidden on the public site. Saving does not create a contact form or collect supporter data.
        </p>
        <button
          type="button"
          onClick={() => void saveContact()}
          disabled={saving || uploading}
          className="rounded-lg bg-[#E7001B] px-7 py-3.5 font-display text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff0a25] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save contact content"}
        </button>
      </div>
    </div>
  );
}
