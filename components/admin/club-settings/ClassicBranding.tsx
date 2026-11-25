"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import Footer from "@/components/Footer";
import { useClubContext } from "@/components/ClubContextProvider";
import { ClubBrandingProvider, useClubBranding } from "@/components/ClubBrandingProvider";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { BrandingSkeleton } from "./ClubSettingsSkeleton";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Textarea } from "@/components/ui/textarea";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { createClient } from "@/lib/admin-client";
import { fetchClubBranding, fetchSiteSocialLinks } from "@/lib/queries";
import { CLUB_LOGO_BUCKET, FOOTER_TAGLINE_LIMIT, clubLogoUrl, resolveFooterTagline, validateFooterTagline } from "@/lib/club-branding";
import { normalizeSiteSocialLinks } from "@/lib/social-links";
import { deleteStoragePaths } from "@/lib/storage-cleanup";
import { GRAPHIC_UPLOAD_MAX_SIZE_LABEL, GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import type { SiteSocialPlatform } from "@/lib/db-types";
import { ClubSettingsFrame } from "./ClubSettingsFrame";
import { validateChangedSocialLink, brandingDirty, brandingStages, confirmBrandingStage, advanceBrandingSave, rejectBrandingSave, brandingPrewriteRejectionMessage, type BrandingDraft, type BrandingSaveProgress } from "./branding-draft";
import styles from "./ClubSettings.module.css";

const where = ["Website navigation", "Website footer", "Next match card", "Admin login and menu", "Players without a photo", "Browser tab icon"];
const errorText = (error: unknown) => error instanceof Error ? error.message : "The change could not be completed.";

export function ClassicBranding() {
  const club = useClubContext();
  const { setClubLogoPath } = useClubBranding();
  const showTagline = codeSiteAdminFor(club)?.branding.showFooterTagline ?? false;
  const [draft, setDraft] = useState<BrandingDraft | null>(null);
  const [confirmed, setConfirmed] = useState<BrandingDraft | null>(null);
  const [inversePath, setInversePath] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [uploadPending, setUploadPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const cleaning = useRef(false);
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const latest = useRef(draft);
  const saved = useRef(confirmed);
  const progress = useRef<BrandingSaveProgress>({ stages: [], uncertain: false });
  const owned = useRef(new Set<string>());
  const busy = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const mediaField = useRef<HTMLDivElement>(null);
  const restoreChooser = useRef(false);

  function updateDraft(next: BrandingDraft) {
    latest.current = next;
    setDraft(next);
    setError("");
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setLoadError("");
    void Promise.all([fetchClubBranding(club.id), fetchSiteSocialLinks(club.id)])
      .then(([branding, links]) => {
        if (!live) return;
        const value: BrandingDraft = {
          logoPath: branding.logoPath, tagline: branding.footerTagline,
          links: normalizeSiteSocialLinks(links), configured: links.map((link) => link.id),
        };
        latest.current = value;
        saved.current = value;
        setDraft(value);
        setConfirmed(value);
        setInversePath(branding.inverseLogoPath);
      })
      .catch((failure: unknown) => { if (live) setLoadError(errorText(failure)); });
    return () => { live = false; };
  }, [club.id, loadingAttempt]);

  // Only paths uploaded by this mounted editor can be retired here. A retained
  // command might have committed without its response, so it remains a reference.
  const unusedUploads = useCallback((keepDraft: boolean) => {
    const keep = new Set([
      saved.current?.logoPath,
      keepDraft ? latest.current?.logoPath : undefined,
      ...progress.current.stages.filter((stage) => stage.kind === "logo").map((stage) => stage.value),
    ]);
    return [...owned.current].filter((path) => !keep.has(path));
  }, []);
  const cleanupUnused = useCallback(async (keepDraft: boolean) => {
    for (const path of unusedUploads(keepDraft)) {
      await deleteStoragePaths(CLUB_LOGO_BUCKET, [path]);
      owned.current.delete(path);
    }
  }, [unusedUploads]);

  async function upload(files: FileList) {
    const file = files[0];
    if (!file || !latest.current || busy.current || cleaning.current) return false;
    try {
      const result = await createClient().storage.from(CLUB_LOGO_BUCKET)
        .upload(`club-logo/${Date.now()}.${file.type === "image/webp" ? "webp" : "png"}`, file);
      if (result.error || !result.data?.path) throw new Error(result.error?.message ?? "The logo could not be uploaded.");
      const path = result.data.path;
      owned.current.add(path);
      if (!mounted.current) {
        await cleanupUnused(false);
        return false;
      }
      updateDraft({ ...latest.current, logoPath: path });
      await cleanupUnused(true);
      setRetrying(progress.current.stages.length > 0);
      return true;
    } catch (failure) {
      if (mounted.current) setError(errorText(failure));
      return false;
    }
  }

  async function removeLogo() {
    if (!latest.current || pending.current || busy.current || cleaning.current) return;
    updateDraft({ ...latest.current, logoPath: "" });
    // Use the same reference-aware keep set as Save/Discard. A saved or
    // possibly committed original stage is never an unused upload.
    if (!unusedUploads(true).length) return;
    cleaning.current = true;
    restoreChooser.current = true;
    setCleanupPending(true);
    try {
      await cleanupUnused(true);
      setRetrying(progress.current.stages.length > 0);
      setError("");
    } catch (failure) {
      setRetrying(true);
      setError("The logo was removed from your draft, but its unused upload still needs cleanup. Retry Save or discard the draft to retry cleanup. " + errorText(failure));
    } finally {
      cleaning.current = false;
      if (mounted.current) setCleanupPending(false);
    }
  }

  useEffect(() => {
    if (cleanupPending || !restoreChooser.current) return;
    restoreChooser.current = false;
    const field = mediaField.current;
    // The pending Remove unmounts its opener and disables the existing chooser.
    // Recover only abandoned body focus after cleanup; never steal a newer
    // field, tab or open dialog's focus.
    if (!field?.isConnected || document.activeElement !== document.body) return;
    if (document.querySelector('[data-slot="admin-dialog"][data-open]')) return;
    const choose = field.querySelector<HTMLButtonElement>("[data-admin-image-field] button");
    if (choose?.isConnected && !choose.disabled) choose.focus({ preventScroll: true });
  }, [cleanupPending]);

  async function persist() {
    if (busy.current) throw new Error("A save is already in progress.");
    if (pending.current || cleaning.current) throw new Error("Wait for the logo upload or cleanup to finish before saving.");
    const current = latest.current;
    const baseline = saved.current;
    if (!current || !baseline) throw new Error("Wait for club settings to load.");
    // Retained stages were validated when created. Newer draft errors cannot
    // prevent confirming an earlier attempt whose response may have been lost.
    if (!progress.current.stages.length) {
      const invalidTagline = showTagline ? validateFooterTagline(current.tagline) : null;
      if (invalidTagline) throw new Error(invalidTagline);
      for (const link of current.links) {
        const invalid = validateChangedSocialLink(link.href, baseline.links.find((item) => item.id === link.id)?.href ?? "");
        const input = form.current?.querySelector<HTMLInputElement>(`#social-${link.id}`);
        input?.setCustomValidity(invalid ?? "");
        if (invalid) {
          input?.reportValidity();
          throw new Error(invalid);
        }
      }
    }
    busy.current = true;
    setError("");
    let definiteRejection: string | undefined;
    try {
      // Finish an interrupted original command before accepting another draft.
      // Each upsert is idempotent, but the endpoint offers no operation receipt.
      if (!progress.current.stages.length) progress.current = { stages: brandingStages(current, baseline, showTagline, new Date().toISOString()), uncertain: false };
      while (progress.current.stages.length) {
        const stage = progress.current.stages[0];
        let result;
        try {
          result = await createClient().from(stage.kind === "social" ? "site_social_links" : "site_branding").upsert(stage.payload);
        } catch (failure) {
          progress.current = rejectBrandingSave(progress.current, undefined);
          throw failure;
        }
        if (result.error) {
          const reason = brandingPrewriteRejectionMessage(result.error.code);
          progress.current = rejectBrandingSave(progress.current, result.error.code);
          if (!progress.current.stages.length) definiteRejection = reason;
          throw new Error(reason ?? result.error.message);
        }
        const next = confirmBrandingStage(saved.current!, stage);
        saved.current = next;
        if (mounted.current) setConfirmed(next);
        progress.current = advanceBrandingSave(progress.current);
        if (stage.kind === "logo") setClubLogoPath(stage.value);
      }
      setRetrying(false);
      await cleanupUnused(true);
      // A newer draft stays dirty. The guard must not leave it behind.
    } catch (failure) {
      setRetrying(!definiteRejection);
      const message = definiteRejection
        ? "This step was rejected before it was written. Any earlier confirmed changes remain saved. Your unsaved draft is still here; correct it and try Save, or discard it. " + definiteRejection
        : progress.current.stages.length
          ? "Some changes may already be saved. Retry Save to finish the original changes before saving newer edits. " + errorText(failure)
          : "Changes saved, but unused logo cleanup needs another attempt. " + errorText(failure);
      if (mounted.current) setError(message);
      throw new Error(message);
    } finally {
      busy.current = false;
    }
  }

  const dirty = Boolean(draft && confirmed && brandingDirty(draft, confirmed, showTagline)) || retrying;
  const { state, save } = useSaveState({ isDirty: dirty, onSave: persist });
  const saveCurrent = useRef<(origin?: "header" | "guard") => Promise<boolean>>(async () => false);
  saveCurrent.current = async (origin = "header") => {
    if (pending.current || cleaning.current || busy.current || !latest.current || !saved.current) {
      setError("Wait for the current upload, cleanup or save to finish.");
      return false;
    }
    try {
      // The guard owns its pending display. An explicit retry must reach the
      // persistence path even while the header finishes a completed attempt.
      if (origin === "guard") await persist();
      else await save();
      return !pending.current && !cleaning.current && !progress.current.stages.length && !brandingDirty(latest.current, saved.current, showTagline);
    } catch { return false; }
  };
  const discard = useCallback(async () => {
    if (pending.current || cleaning.current || busy.current) throw new Error("Wait for the current upload, cleanup or save to finish.");
    if (progress.current.stages.length) {
      setError("Finish the original save before discarding. Its outcome has not been confirmed.");
      throw new Error("The original save is unresolved.");
    }
    try {
      await cleanupUnused(false);
    } catch (failure) {
      setRetrying(true);
      setError("Unused logo cleanup could not finish. Try discarding again or keep editing. " + errorText(failure));
      throw failure;
    }
    setRetrying(false);
    setError("");
    if (saved.current) {
      latest.current = saved.current;
      setDraft(saved.current);
    }
  }, [cleanupUnused]);
  useUnsavedGuard({
    dirty: dirty || uploadPending || cleanupPending,
    edited: "your club logo or footer",
    onSave: useCallback(() => saveCurrent.current("guard"), []),
    onDiscard: discard,
  });

  useEffect(() => {
    if (!dirty && !uploadPending && !cleanupPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploadPending, cleanupPending]);

  const preview = useMemo(() => draft ? ({
    tagline: resolveFooterTagline(draft.tagline),
    socialLinks: Object.fromEntries(draft.links.filter((link) => draft.configured.includes(link.id)).map((link) => [link.id, link.href.trim()])) as Partial<Record<SiteSocialPlatform, string>>,
  }) : undefined, [draft]);

  return (
    <ClubSettingsFrame active="branding" actions={(
      <div aria-busy={uploadPending || cleanupPending || undefined} data-club-settings-media-pending={cleanupPending ? "cleanup" : uploadPending ? "upload" : undefined}>
        <AdminSaveActions className={styles.headerSaveActions} state={uploadPending || cleanupPending ? "clean" : state} onSave={() => { void saveCurrent.current(); }} />
      </div>
    )}>
      <ShimmerRegion loading={!draft && !loadError} skeleton={<BrandingSkeleton tagline={showTagline} />} minHeight={180} loadingLabel="Loading club settings">
      {loadError ? <div className={styles.notice}><p role="alert">{loadError}</p><button className={styles.action} type="button" onClick={() => setLoadingAttempt((value) => value + 1)}>Retry loading</button></div> : !draft ? null : (
        <form ref={form} noValidate className={styles.panels} onSubmit={(event) => { event.preventDefault(); void saveCurrent.current(); }}>
          <section className={styles.card} aria-labelledby="club-logo-heading">
            <h2 id="club-logo-heading">Club logo</h2>
            <p className={styles.description}>Your logo appears across the website and the admin portal.</p>
            <div className={styles.logoGrid}>
              <div>
                <div className={styles.previews}>
                  {[{ name: "light", path: draft.logoPath }, { name: "dark", path: inversePath || draft.logoPath }].map(({ name, path }) => (
                    <div key={name} className={`${styles.logoBox} ${name === "light" ? styles.light : styles.dark}`}>
                      {path ? <div className={styles.logoImage}><Image src={clubLogoUrl(path)} alt={`Logo on a ${name} background`} fill sizes="180px" /></div> : <span className={styles.noLogo}>No logo</span>}
                      <span className={styles.caption}>ON {name.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
                {inversePath && <p className={styles.hint}>The dark preview uses the club’s existing inverse logo.</p>}
                <ul className={styles.where} aria-label="Where the logo appears">{where.map((place) => <li key={place}>{place}</li>)}</ul>
              </div>
              <div ref={mediaField} className={styles.upload}>
                <AdminImageField
                  label="Club logo" previewUrl={clubLogoUrl(draft.logoPath)} initials="?" shape="square" size={64}
                  {...adminImageRules("graphic")} disabled={state === "saving" || cleanupPending} uploading={cleanupPending}
                  onUpload={upload}
                  onPendingChange={(value) => { pending.current = value; setUploadPending(value); }}
                  onRemove={() => { void removeLogo(); }}
                />
                <p className={styles.hint}>{GRAPHIC_UPLOAD_TYPES_LABEL}, up to {GRAPHIC_UPLOAD_MAX_SIZE_LABEL}. Use a transparent background. Drop an image on the preview or choose a file.</p>
                {cleanupPending && <p role="status" className={styles.hint}>Removing unused upload… Save is available when cleanup finishes.</p>}
                {uploadPending && <p role="status" className={styles.hint}>Uploading logo… Save is available when the upload finishes.</p>}
              </div>
            </div>
          </section>
          <section className={styles.card} aria-labelledby="footer-social-heading">
            <h2 id="footer-social-heading">{showTagline ? "Footer and social links" : "Social links"}</h2>
            <p className={styles.description}>The links behind the social icons in the public website footer.{showTagline && " Edit the tagline beside the crest too."}</p>
            {showTagline && <div className={styles.field}>
              <label htmlFor="footer-tagline" className={ADMIN_LABEL_CLASS}>Footer tagline</label>
              <Textarea id="footer-tagline" value={draft.tagline} rows={3} maxLength={FOOTER_TAGLINE_LIMIT} aria-describedby="tagline-hint tagline-count"
                onChange={(event) => updateDraft({ ...latest.current!, tagline: event.target.value })} />
              <span id="tagline-count" className={styles.counter}>{draft.tagline.length}/{FOOTER_TAGLINE_LIMIT}</span>
              <p id="tagline-hint" className={styles.hint}>Shown under the club name in the footer. Press Enter for a second line. Leave empty to restore the standard wording.</p>
            </div>}
            <div className={styles.links}>
              {draft.links.map((link) => <div key={link.id} className={styles.field}>
                <label htmlFor={`social-${link.id}`} className={ADMIN_LABEL_CLASS}>{link.label}</label>
                <input id={`social-${link.id}`} type="url" inputMode="url" autoComplete="off" maxLength={2048} value={link.href} placeholder="https://"
                  className={ADMIN_INPUT_CLASS} aria-describedby="social-hint"
                  onChange={(event) => {
                    event.target.setCustomValidity("");
                    const value = latest.current!;
                    updateDraft({ ...value, links: value.links.map((item) => item.id === link.id ? { ...item, href: event.target.value } : item),
                      configured: value.configured.includes(link.id) ? value.configured : [...value.configured, link.id] });
                  }} />
              </div>)}
            </div>
            <p id="social-hint" className={styles.hint}>Leave a link empty to hide its icon.</p>
            <span className={styles.previewLabel}>Footer preview</span>
            <div className={styles.preview}><ScaledPagePreview><ClubBrandingProvider key={draft.logoPath} initialBranding={{ logoPath: draft.logoPath, inverseLogoPath: inversePath, footerTagline: resolveFooterTagline(draft.tagline) }}><Footer overrides={preview} /></ClubBrandingProvider></ScaledPagePreview></div>
          </section>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {retrying && progress.current.stages.length > 0 && <p className={styles.hint}>The original save must finish before you can discard changes or leave this page.</p>}
        </form>
      )}
      </ShimmerRegion>
    </ClubSettingsFrame>
  );
}
