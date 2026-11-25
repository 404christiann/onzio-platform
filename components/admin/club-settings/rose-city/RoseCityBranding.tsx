"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import Footer from "@/components/Footer";
import { useClubContext } from "@/components/ClubContextProvider";
import { ClubBrandingProvider, useClubBranding } from "@/components/ClubBrandingProvider";
import { DISCARD_CONFIRM } from "@/components/admin/editor-copy";
import { kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ListField } from "@/components/admin/list-cards/ListField";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import {
  EditorDialog, SectionCards, SectionCardsSkeleton, ValidationMessage, derivePageSaveState, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { createClient } from "@/lib/admin-client";
import { fetchClubBranding, fetchSiteSocialLinks } from "@/lib/queries";
import { CLUB_LOGO_BUCKET, FOOTER_TAGLINE_LIMIT, clubLogoUrl, resolveFooterTagline } from "@/lib/club-branding";
import { deleteStoragePaths } from "@/lib/storage-cleanup";
import { GRAPHIC_UPLOAD_MAX_SIZE_LABEL, GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import type { SiteSocialPlatform } from "@/lib/db-types";
import {
  brandingDirty, brandingStages, confirmBrandingStage, advanceBrandingSave, rejectBrandingSave, brandingPrewriteRejectionMessage,
  draftFromRows, type BrandingDraft, type BrandingSaveProgress,
} from "../branding-draft";
import { roseCityBrandingErrors, roseCityBrandingInvalid, roseCityTaglineFromBranding } from "./rose-city-branding";
import { RoseCityFooterPreview } from "./RoseCityFooterPreview";
import { RoseCityFrame } from "./RoseCityFrame";
import { CinematicContentProvider, useCinematicContent } from "@/components/cinematic/CinematicContent";
import classic from "../ClubSettings.module.css";
import styles from "./RoseCity.module.css";

type SectionId = "logo" | "footer";

const where = ["Website navigation", "Website footer", "Next match card", "Admin login and menu", "Players without a photo", "Browser tab icon"];
const FOOTER_LOGO_NOTE = "Your footer shows its own footer logo, set by Onzio, so this logo isn’t in the footer.";
const NO_LOGO_NOTE = "No logo yet. The footer shows your club name instead.";
const FOOTER_LOGO_TAGLINE_HINT = "Your footer shows its own footer logo in place of the club name and tagline, so this line isn’t shown there right now.";
const errorText = (error: unknown) => error instanceof Error ? error.message : "The change could not be completed.";
const TAGLINE_HINT = "Shown under the club name in the footer. Press Enter for a second line.";

export function RoseCityBranding() {
  const club = useClubContext();
  const { setClubLogoPath, refreshClubBranding } = useClubBranding();
  // Loaded once here and handed to the preview's footer, so the note and the preview agree and nothing fetches twice.
  const cinematic = useCinematicContent();
  const footerHasOwnLogo = Boolean(cinematic.content?.footerLogo?.url);
  const [draft, setDraft] = useState<BrandingDraft | null>(null);
  const [confirmed, setConfirmed] = useState<BrandingDraft | null>(null);
  const [inversePath, setInversePath] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [uploadPending, setUploadPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cleaning = useRef(false);
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const latest = useRef(draft);
  const saved = useRef(confirmed);
  const progress = useRef<BrandingSaveProgress>({ stages: [], uncertain: false });
  const owned = useRef(new Set<string>());
  const busy = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const mediaField = useRef<HTMLDivElement>(null);
  const restoreChooser = useRef(false);
  const dialog = useEditorDialog<SectionId>();

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
        // The same mapper the save uses turns Rose City's legacy-id rows into the five standard links.
        const value = draftFromRows({ logoPath: branding.logoPath, tagline: roseCityTaglineFromBranding(branding.footerTagline) }, links);
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
    pending.current = true;
    setUploadPending(true);
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
    } finally {
      pending.current = false;
      if (mounted.current) setUploadPending(false);
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
      const errors = roseCityBrandingErrors(current, baseline);
      if (roseCityBrandingInvalid(errors)) {
        // The fields live in the dialog, which is closed or on another section: say it on the page and open the footer.
        const message = "Check the highlighted footer fields, then try Save again.";
        setAttempted(true);
        setError(message);
        dialog.openSection("footer");
        throw new Error(message);
      }
    }
    busy.current = true;
    setError("");
    let definiteRejection: string | undefined;
    try {
      // Finish an interrupted original command before accepting another draft.
      // Each upsert is idempotent, but the endpoint offers no operation receipt.
      if (!progress.current.stages.length) progress.current = { stages: brandingStages(current, baseline, true, new Date().toISOString()), uncertain: false };
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
        // The admin layout's provider feeds other editors' footer previews; bring its tagline up to date.
        if (stage.kind === "tagline") void refreshClubBranding();
      }
      setRetrying(false);
      setAttempted(false);
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

  const dirty = Boolean(draft && confirmed && brandingDirty(draft, confirmed, true)) || retrying;
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
      return !pending.current && !cleaning.current && !progress.current.stages.length && !brandingDirty(latest.current, saved.current, true);
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
    setAttempted(false);
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

  const awaitingRetry = retrying && progress.current.stages.length > 0;
  const locked = state === "saving" || uploadPending || cleanupPending || awaitingRetry;
  const errors = draft && confirmed ? roseCityBrandingErrors(draft, confirmed) : { links: {} };
  const shown = attempted ? errors : { links: {} as Record<string, string> };
  const linkNames = draft ? draft.links.filter((link) => link.href.trim()).map((link) => link.label) : [];
  const pageState = derivePageSaveState(uploadPending || cleanupPending ? "clean" : state, awaitingRetry ? "retry" : null);
  const loading = !draft && !loadError;

  const notice = (error || awaitingRetry) ? <div className={styles.notice} data-club-settings-notice="">
    {error && <ValidationMessage live="assertive">{error}</ValidationMessage>}
    {awaitingRetry && <p className={classic.hint}>The original save must finish before you can discard changes or leave this page.</p>}
  </div> : undefined;

  const sections = draft ? [
    { id: "logo", title: "Club logo", summary: draft.logoPath ? "Logo set. Used on the website, the admin and the browser tab." : "No logo yet." },
    {
      id: "footer", title: "Footer and social links",
      summary: roseCityBrandingInvalid(shown)
        ? "Check the highlighted fields."
        : `${draft.tagline.trim() ? draft.tagline.trim().split("\n")[0] : "No tagline set"} · ${linkNames.length ? `${linkNames.length} of 5 links` : "no links"}`,
    },
  ] : [];

  const footerPreview = draft ? (
    <RoseCityFooterPreview loading={cinematic.loading}>
      <CinematicContentProvider initialContent={cinematic.content}>
        <ClubBrandingProvider key={draft.logoPath} initialBranding={{ logoPath: draft.logoPath, inverseLogoPath: inversePath, footerTagline: resolveFooterTagline(draft.tagline) }}>
          <Footer overrides={preview} />
        </ClubBrandingProvider>
      </CinematicContentProvider>
    </RoseCityFooterPreview>
  ) : null;

  function renderSection(id: string) {
    if (!draft) return null;
    if (id === "logo") {
      return (
        <div className={styles.fields}>
          <div className={classic.previews}>
            {[{ name: "light", path: draft.logoPath }, { name: "dark", path: inversePath || draft.logoPath }].map(({ name, path }) => (
              <div key={name} className={`${classic.logoBox} ${name === "light" ? classic.light : classic.dark}`}>
                {path ? <div className={classic.logoImage}><Image src={clubLogoUrl(path)} alt={`Logo on a ${name} background`} fill sizes="180px" /></div> : <span className={classic.noLogo}>No logo</span>}
                <span className={classic.caption}>ON {name.toUpperCase()}</span>
              </div>
            ))}
          </div>
          {inversePath && <p className={classic.hint}>The dark preview uses the club’s existing inverse logo.</p>}
          <ul className={classic.where} aria-label="Where the logo appears">{where.filter((place) => !footerHasOwnLogo || place !== "Website footer").map((place) => <li key={place}>{place}</li>)}</ul>
          {footerHasOwnLogo ? <p className={classic.hint}>{FOOTER_LOGO_NOTE}</p> : !draft.logoPath && <p className={classic.hint}>{NO_LOGO_NOTE}</p>}
          <div ref={mediaField} className={classic.upload}>
            <AdminImageField
              label="Club logo" previewUrl={clubLogoUrl(draft.logoPath)} initials="?" shape="square" size={64}
              {...adminImageRules("graphic")} disabled={locked} uploading={cleanupPending}
              onUpload={upload}
              onRemove={() => { void removeLogo(); }}
            />
            <p className={classic.hint}>{GRAPHIC_UPLOAD_TYPES_LABEL}, up to {GRAPHIC_UPLOAD_MAX_SIZE_LABEL}. Use a transparent background. The file uploads when you choose it and goes live when you press Save.</p>
            {cleanupPending && <p role="status" className={classic.hint}>Removing unused upload… Save is available when cleanup finishes.</p>}
            {uploadPending && <p role="status" className={classic.hint}>Uploading logo… Save is available when the upload finishes.</p>}
          </div>
        </div>
      );
    }
    return (
      <div className={styles.fields}>
        <ListField
          label="Footer tagline" value={draft.tagline} max={FOOTER_TAGLINE_LIMIT} multiline disabled={locked} error={shown.tagline}
          hint={footerHasOwnLogo ? FOOTER_LOGO_TAGLINE_HINT : draft.tagline.trim() ? TAGLINE_HINT : `${TAGLINE_HINT} Not set: the footer shows Onzio’s standard wording until you add a line.`}
          onChange={(value) => updateDraft({ ...latest.current!, tagline: value })}
        />
        <p className={classic.hint}>The links behind the social icons in the public website footer. Leave a link empty to hide its icon.</p>
        {draft.links.map((link) => {
          const id = `social-${link.id}`;
          const message = shown.links[link.id];
          return (
            <div key={link.id} className={kit.field}>
              <label htmlFor={id}>{link.label}</label>
              <input
                id={id} type="url" inputMode="url" autoComplete="off" maxLength={2048} value={link.href} placeholder="https://" disabled={locked}
                aria-invalid={message ? true : undefined} aria-describedby={message ? `${id}-error` : undefined}
                onChange={(event) => {
                  const value = latest.current!;
                  updateDraft({
                    ...value, links: value.links.map((item) => item.id === link.id ? { ...item, href: event.target.value } : item),
                    configured: value.configured.includes(link.id) ? value.configured : [...value.configured, link.id],
                  });
                }}
              />
              {message && <ValidationMessage id={`${id}-error`}>{message}</ValidationMessage>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <RoseCityFrame
      active="branding" state={pageState}
      onSave={() => { void saveCurrent.current(); }} onRetry={() => { void saveCurrent.current(); }}
      onDiscard={() => setConfirmDiscard(true)} notice={notice}
    >
      <ShimmerRegion loading={loading} loadingLabel="Loading club settings" minHeight={180} skeleton={<SectionCardsSkeleton count={2} />}>
        {loadError ? (
          <div className={classic.notice}><p role="alert">{loadError}</p><button className={classic.action} type="button" onClick={() => setLoadingAttempt((value) => value + 1)}>Retry loading</button></div>
        ) : !draft ? null : (
          <SectionCards sections={sections} label="Branding sections" onEdit={(id, event) => dialog.openSection(id as SectionId, event)} />
        )}
        <p className={styles.operatorNote}>Club name, colors and your website address are set by Onzio.</p>
      </ShimmerRegion>
      {draft && <EditorDialog
        open={dialog.open} onClose={dialog.close} title="Edit branding" mode="split" returnFocusRef={dialog.returnFocusRef}
        sections={sections} activeId={dialog.activeId} onActiveChange={(id) => dialog.switchTo(id as SectionId)}
        renderSection={(id) => dialog.open ? renderSection(id) : null}
        previewHint="Website footer, desktop" renderPreview={() => dialog.open ? footerPreview : null}
      />}
      <AdminConfirmDialog
        open={confirmDiscard} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
        onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); void discard().catch(() => undefined); }}
      >
        Discard unsaved club settings edits and load the saved ones?
      </AdminConfirmDialog>
    </RoseCityFrame>
  );
}
