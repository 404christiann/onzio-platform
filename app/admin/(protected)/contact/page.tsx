"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageToolbar,
  AdminPanel,
} from "@/components/admin/AdminPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import ScaledContactPreview from "@/components/admin/ScaledContactPreview";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Textarea } from "@/components/ui/textarea";
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

export default function AdminContactPage() {
  const club = useClubContext();
  // academy@1's Contact hero is the flat navy band approved in DCFC-D132 and no
  // hero image has ever been attached (contact_page_content.hero_media_asset_id
  // is null), so the upload field only ever offered a way to darken that band.
  // The field is hidden rather than deleted: AcademyContactPage still renders a
  // hero image when one exists, and every other template keeps the editor.
  // editorial@1's EditorialContactPage uses a plain interior hero with no image
  // render slot, so the field is dead there too.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const hidesHeroImageField = isAcademy || isEditorial;
  const heroInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [loading, setLoading] = useState(true);
  const showFullLoader = useDelayedLoading(loading, 400);
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

  if (loading || showFullLoader) {
    if (showFullLoader) {
      return <AdminFullPageLoader label="Loading contact content" />;
    }
    return (
      <AdminPage className={isAcademy ? "max-w-7xl" : "max-w-6xl"}>
        <AdminPageHeader
          eyebrow="Public website"
          title="Contact"
          description="Manage how supporters reach the club and how that information is introduced on the Contact page."
        />
        <div
          className="grid gap-6 lg:grid-cols-2"
          role="status"
          aria-label="Loading contact content"
        >
          <AdminPanel className="flex flex-col gap-4 p-5 sm:p-7">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </AdminPanel>
          <AdminPanel className="flex flex-col gap-4 p-5 sm:p-7">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </AdminPanel>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage className={isAcademy ? "max-w-7xl" : "max-w-6xl"}>
      <AdminSaveFeedback
        saving={saving || uploading}
        saved={saved}
        savingLabel={uploading ? "Uploading hero image…" : "Saving contact content…"}
        successLabel="Contact content saved"
      />

      <AdminPageHeader
        eyebrow="Public website"
        title="Contact"
        description="Manage how supporters reach the club and how that information is introduced on the Contact page."
      />

      {error && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="font-body text-sm text-destructive">{error}</p>
          {error.includes("Unable to load contact content") && (
            <button
              type="button"
              onClick={() => void loadContact()}
              className="font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground underline decoration-foreground/30 underline-offset-4"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div
        className={
          isAcademy
            ? "grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,380px)]"
            : "grid gap-6 lg:grid-cols-2"
        }
      >
        {/* Top accent bar flags this panel as canonical/shared club data
            (same signal as the "Shared club data" pill above), so the
            higher-risk panel reads as such even at a glance. The
            page-presentation panel intentionally stays unaccented since it
            carries no shared-data risk. */}
        <AdminPanel
          className="border-t-4 border-t-primary p-5 sm:p-7"
          aria-labelledby="shared-contact-heading"
        >
          <div className="mb-6 border-b border-border pb-5">
            <span className="inline-flex rounded-full border border-brand/25 bg-brand/10 px-3 py-1 font-display text-[0.65rem] font-black uppercase tracking-[0.18em] text-brand">
              Shared club data
            </span>
            <h2
              id="shared-contact-heading"
              className="mt-3 font-display text-2xl font-black uppercase text-foreground"
            >
              Contact destinations
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              These details are canonical club information. Updating them changes every public surface that reuses club contact data.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="public-email" className={ADMIN_LABEL_CLASS}>Public email</label>
              <input
                id="public-email"
                type="email"
                autoComplete="email"
                value={draft.profile.publicEmail}
                onChange={(event) => updateProfile("publicEmail", event.target.value)}
                placeholder="club@example.com"
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.publicEmail)}
              />
              <FieldError message={errors.publicEmail} />
            </div>
            <div>
              <label htmlFor="public-phone" className={ADMIN_LABEL_CLASS}>Public phone</label>
              <input
                id="public-phone"
                type="tel"
                autoComplete="tel"
                value={draft.profile.publicPhone}
                onChange={(event) => updateProfile("publicPhone", event.target.value)}
                placeholder="+1 (847) 555-0199"
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.publicPhone)}
              />
              <FieldError message={errors.publicPhone} />
            </div>
            <div>
              <label htmlFor="service-area" className={ADMIN_LABEL_CLASS}>Service area</label>
              <input
                id="service-area"
                value={draft.profile.serviceArea}
                onChange={(event) => updateProfile("serviceArea", event.target.value)}
                placeholder="Schaumburg, Illinois"
                maxLength={120}
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.serviceArea)}
              />
              <FieldError message={errors.serviceArea} />
            </div>
            <div>
              <label htmlFor="hours" className={ADMIN_LABEL_CLASS}>Hours</label>
              <input
                id="hours"
                value={draft.profile.hours}
                onChange={(event) => updateProfile("hours", event.target.value)}
                placeholder="Optional"
                maxLength={200}
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.hours)}
              />
              <FieldError message={errors.hours} />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-muted/50 p-4">
            <p className="font-display text-sm font-black uppercase text-foreground">
              Social links are managed in Branding
            </p>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">
              The Contact page and footer use the same social destinations, so they remain under one canonical editor.
            </p>
            <Link
              href="/admin/branding"
              className="mt-3 inline-flex font-display text-xs font-black uppercase tracking-[0.16em] text-brand underline decoration-brand/30 underline-offset-4 transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Edit social links
            </Link>
          </div>
        </AdminPanel>

        <AdminPanel
          className="p-5 sm:p-7"
          aria-labelledby="contact-page-heading"
        >
          <div className="mb-6 border-b border-border pb-5">
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-display text-[0.65rem] font-black uppercase tracking-[0.18em] text-primary">
              Contact page only
            </span>
            <h2
              id="contact-page-heading"
              className="mt-3 font-display text-2xl font-black uppercase text-foreground"
            >
              Page presentation
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-muted-foreground">
              {hidesHeroImageField
                ? "This copy shapes the Contact page without changing shared club destinations."
                : "This copy and hero image shape the Contact page without changing shared club destinations."}
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label htmlFor="eyebrow" className={ADMIN_LABEL_CLASS}>Eyebrow</label>
              <input
                id="eyebrow"
                value={draft.page.eyebrow}
                onChange={(event) => updatePage("eyebrow", event.target.value)}
                maxLength={80}
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.eyebrow)}
              />
              <FieldError message={errors.eyebrow} />
            </div>
            <div>
              <label htmlFor="headline" className={ADMIN_LABEL_CLASS}>Headline</label>
              <input
                id="headline"
                value={draft.page.headline}
                onChange={(event) => updatePage("headline", event.target.value)}
                maxLength={80}
                className={ADMIN_INPUT_CLASS}
                aria-invalid={Boolean(errors.headline)}
              />
              <FieldError message={errors.headline} />
            </div>
            <div>
              <label htmlFor="intro" className={ADMIN_LABEL_CLASS}>Introduction</label>
              <Textarea
                id="intro"
                rows={5}
                value={draft.page.intro}
                onChange={(event) => updatePage("intro", event.target.value)}
                maxLength={320}
                aria-invalid={Boolean(errors.intro)}
              />
              <div className="mt-1.5 flex items-start justify-between gap-4">
                <FieldError message={errors.intro} />
                <span className="ml-auto font-body text-[0.7rem] text-muted-foreground">
                  {draft.page.intro.length}/320
                </span>
              </div>
            </div>

            {!hidesHeroImageField && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`${ADMIN_LABEL_CLASS} mb-0`}>Hero image</span>
                <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-0.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  General templates only
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
                {draft.page.heroMediaPreviewUrl ? (
                  <div className="relative aspect-[16/7] w-full border-b border-border">
                    <ResilientImage
                      src={draft.page.heroMediaPreviewUrl}
                      alt="Contact hero preview"
                      fill
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/5] items-center justify-center px-6 text-center font-body text-xs text-muted-foreground">
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
                    className="rounded-lg border border-border bg-background px-4 py-2.5 font-display text-xs font-black uppercase tracking-[0.15em] text-muted-foreground transition hover:border-foreground/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploading && <AdminLoadingDots className="mr-2" />}
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
                      className="font-display text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground transition hover:text-destructive disabled:opacity-40"
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
        </AdminPanel>

        {/* The live preview only renders for academy@1 today — every other
            template edits this page without one, since ScaledContactPreview
            renders the academy contact page markup specifically. */}
        {isAcademy && (
          <AdminPanel
            as="aside"
            className="p-5 sm:p-7 lg:col-span-2 xl:col-span-1 xl:sticky xl:top-24"
          >
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Contact page preview
            </p>
            <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground xl:max-w-none">
              The real public page, at desktop proportions and scaled to fit,
              including the changes you have not saved yet.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <ScaledContactPreview content={previewContent} clubName={club.name} />
            </div>
          </AdminPanel>
        )}
      </div>

      <AdminPageToolbar className="sm:p-6">
        <p className="max-w-xl font-body text-xs leading-5 text-muted-foreground">
          Blank optional fields stay hidden on the public site. Saving does not create a contact form or collect supporter data.
        </p>
        <button
          type="button"
          onClick={() => void saveContact()}
          disabled={saving || uploading}
          className="rounded-lg bg-brand px-7 py-3.5 font-display text-sm font-black uppercase tracking-[0.16em] text-brand-foreground transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <AdminLoadingDots className="mr-2" />}
          {saving ? "Saving…" : "Save contact content"}
        </button>
      </AdminPageToolbar>
    </AdminPage>
  );
}
