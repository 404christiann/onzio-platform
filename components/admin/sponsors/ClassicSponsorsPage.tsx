"use client";

import { X, ChevronLeft, ChevronRight, AlertTriangle } from "@/components/admin/icons";

import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

import Image from "@/components/ResilientImage";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useAnimatedList } from "@/components/admin/ui/useAnimatedList";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import {
  confirmSponsorInserts,
  persistSponsorAttempt,
  reconcileSponsorDraft,
  type SponsorEditorLogo,
  type SponsorSaveAttempt,
} from "@/components/admin/sponsors/classic-sponsors-save";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import {
  AdminSectionRail,
  type AdminSectionRailItem,
} from "@/components/admin/AdminSectionRail";
import FileUpload from "@/components/admin/FileUpload";
import {
  GRAPHIC_UPLOAD_ACCEPT,
  GRAPHIC_UPLOAD_TYPES_LABEL,
} from "@/lib/media-upload-types";
import {
  deleteUnusedSponsorStorageUrls,
  uploadSponsorLogo,
} from "@/lib/sponsor-storage";
import SponsorCarousel from "@/components/SponsorCarousel";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { fetchSponsorList } from "@/lib/queries";
import {
  canAddSponsorLogo,
  diffSponsorLogos,
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  SPONSOR_NAME_LIMIT,
  sponsorLimitForPlacement,
  sponsorNameFromFile,
  sponsorsForPlacement,
} from "@/lib/sponsor-content";
import { createClient } from "@/lib/admin-client";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";

const PLACEMENT_ORDER: SponsorLogoPlacement[] = ["carousel", "footer"];

// Each rail row states both the placement and its upload cap directly, so the
// cap is visible before a save ever runs — not just in the description text.
const PLACEMENT_LABELS: Record<SponsorLogoPlacement, string> = {
  carousel: `Carousel — up to ${MAX_CAROUSEL_SPONSORS}`,
  footer: `Footer — up to ${MAX_FOOTER_SPONSORS}`,
};

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function toDraft(logos: DBSiteSponsorLogo[]): SponsorEditorLogo[] {
  return logos.map((logo) => ({
    key: logo.id,
    id: logo.id,
    name: logo.name,
    logo_url: logo.logo_url,
  }));
}

export function ClassicSponsorsPage() {
  const club = useClubContext();
  const clubId = club.id;
  // academy@1's footer deliberately renders no sponsor strip (DCFC-D132 — it
  // would duplicate the homepage SponsorCarousel), so footer-placement logos
  // are never displayed on an academy@1 site. Hide that placement tab and pin
  // the editor to the carousel; every other template keeps both placements.
  const sponsorsPolicy = codeSiteAdminFor(club)?.sponsors;
  const hidesSponsorFooterTab = sponsorsPolicy?.showFooterPlacement === false;
  // Rail rows follow PLACEMENT_ORDER. The footer row carries `hidden` for
  // academy@1, which drops it out of the
  // rail and the DOM entirely — AdminSectionRail never renders a disabled row.
  const sectionItems: AdminSectionRailItem[] = PLACEMENT_ORDER.map((item) => ({
    id: item,
    label: PLACEMENT_LABELS[item],
    hidden: item === "footer" ? hidesSponsorFooterTab : false,
  }));
  const [placement, setPlacement] = useState<SponsorLogoPlacement>("carousel");
  const [placementDirection, setPlacementDirection] =
    useState<SlidingPanelDirection>(1);
  const selectPlacement = (next: SponsorLogoPlacement) => {
    setPlacement((current) => {
      if (next === current) return current;
      setPlacementDirection(
        PLACEMENT_ORDER.indexOf(next) > PLACEMENT_ORDER.indexOf(current) ? 1 : -1,
      );
      return next;
    });
  };
  // The club's whole sponsor list (ADMIN-RE-15); each tab edits the logos its place shows.
  const [allLogos, setAllLogos] = useState<DBSiteSponsorLogo[]>([]);
  const [draftLogos, setDraftLogos] = useState<SponsorEditorLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [skeletonCount, setSkeletonCount] = useState(3);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const replacingKeyRef = useRef<string | null>(null);
  const activity = useRef(0);
  const draftRef = useRef(draftLogos);
  const dirtyRef = useRef(dirty);
  const uploadingRef = useRef(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const ownedUploads = useRef(new Set<string>());
  const pendingSave = useRef<SponsorSaveAttempt | null>(null);
  const latestSave = useRef<(origin?: "header" | "guard") => Promise<boolean>>(async () => false);
  const latestDiscard = useRef<() => Promise<void>>(async () => {});
  const list = useAnimatedList({ axis: "both" });
  draftRef.current = draftLogos;
  dirtyRef.current = dirty;

  function updateDraft(next: SponsorEditorLogo[]) {
    draftRef.current = next;
    setDraftLogos(next);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSponsorList(clubId)
      .then((logos) => {
        if (cancelled) return;
        setAllLogos(logos);
        updateDraft(toDraft(sponsorsForPlacement(placement, logos)));
        dirtyRef.current = false;
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load sponsor logos");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clubId, placement]);

  function markDirty() {
    activity.current += 1;
    dirtyRef.current = true;
    setDirty(true);
  }

  function setLogoName(index: number, name: string) {
    updateDraft(draftRef.current.map((logo, logoIndex) => logoIndex === index ? { ...logo, name } : logo));
    markDirty();
  }

  function moveLogo(index: number, delta: -1 | 1) {
    const destination = index + delta;
    if (destination < 0 || destination >= draftRef.current.length) return;
    const next = [...draftRef.current];
    [next[index], next[destination]] = [next[destination], next[index]];
    list.change({ type: "reorder" }, () => updateDraft(next));
    markDirty();
  }

  async function removeLogo(index: number) {
    if (savingRef.current || uploadingRef.current) return;
    const logo = draftRef.current[index];
    if (!logo) return;
    list.change({ type: "remove", key: logo.key }, () =>
      updateDraft(draftRef.current.filter((entry) => entry.key !== logo.key)),
    );
    markDirty();
    if (logo.id === null && !pendingSave.current?.logos.some((entry) => entry.logo_url === logo.logo_url)) {
      try {
        await deleteUnusedSponsorStorageUrls([logo.logo_url]);
        ownedUploads.current.delete(logo.logo_url);
      } catch (deleteError: unknown) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to remove uploaded file");
      }
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || uploadingRef.current) return;
    const remaining = Math.max(0, sponsorLimitForPlacement(placement) - draftRef.current.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    markDirty();
    try {
      for (const file of selected) {
        const url = await uploadSponsorLogo(file, placement);
        ownedUploads.current.add(url);
        if (!mounted.current) {
          await deleteUnusedSponsorStorageUrls([url]);
          ownedUploads.current.delete(url);
          continue;
        }
        const logo: SponsorEditorLogo = {
          key: crypto.randomUUID(), id: null,
          name: sponsorNameFromFile(file.name), logo_url: url,
        };
        list.change({ type: "add", key: logo.key }, () => updateDraft([...draftRef.current, logo]));
        markDirty();
      }
    } catch (uploadError: unknown) {
      if (mounted.current) setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      uploadingRef.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function handleReplaceUpload(files: FileList | null) {
    const key = replacingKeyRef.current;
    const file = files?.[0] ?? null;
    if (!key || !file || uploadingRef.current) return;
    const replacedLogo = draftRef.current.find((logo) => logo.key === key);
    if (!replacedLogo) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    markDirty();
    try {
      const nextUrl = await uploadSponsorLogo(file, placement);
      ownedUploads.current.add(nextUrl);
      if (!mounted.current || !draftRef.current.some((logo) => logo.key === key)) {
        await deleteUnusedSponsorStorageUrls([nextUrl]);
        ownedUploads.current.delete(nextUrl);
        return;
      }
      updateDraft(draftRef.current.map((logo) => logo.key === key
        ? { ...logo, logo_url: nextUrl, name: logo.name.trim() || sponsorNameFromFile(file.name) }
        : logo));
      markDirty();
      if (replacedLogo.id === null && !pendingSave.current?.logos.some((entry) => entry.logo_url === replacedLogo.logo_url)) {
        await deleteUnusedSponsorStorageUrls([replacedLogo.logo_url]);
        ownedUploads.current.delete(replacedLogo.logo_url);
      }
    } catch (uploadError: unknown) {
      if (mounted.current) setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      uploadingRef.current = false;
      replacingKeyRef.current = null;
      if (mounted.current) setUploading(false);
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  }

  async function persist() {
    if (savingRef.current || uploadingRef.current) throw new Error("Wait for the sponsor logos to finish uploading.");
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let attempt = pendingSave.current;
    if (!attempt) {
      const logos = draftRef.current.map((logo) => ({ ...logo }));
      const changes = diffSponsorLogos(placement, allLogos, logos);
      const replaced = changes.toUpdate.flatMap((update) => {
        const original = allLogos.find((logo) => logo.id === update.id);
        return original && update.changes.logo_url !== undefined && original.logo_url !== update.changes.logo_url
          ? [original.logo_url] : [];
      });
      attempt = {
        placement, version: activity.current, logos,
        originalIds: new Set(allLogos.map((logo) => logo.id)), changes,
        deleted: false, updates: 0, inserted: null, insertUncertain: false,
        retireUrls: [...changes.toDelete.map((logo) => logo.logo_url), ...replaced], retired: false,
      };
      pendingSave.current = attempt;
    }
    try {
      const supabase = createClient();
      const fresh = await persistSponsorAttempt(attempt, {
        remove: (ids) => supabase.from("site_sponsor_logos").delete().in("id", ids),
        update: (id, changes) => supabase.from("site_sponsor_logos").update(changes).eq("id", id),
        insert: (rows) => supabase.from("site_sponsor_logos").insert(rows),
        read: () => fetchSponsorList(clubId),
        retire: deleteUnusedSponsorStorageUrls,
      });
      pendingSave.current = null;
      if (!mounted.current) return;
      setAllLogos(fresh);
      const unchanged = activity.current === attempt.version && !uploadingRef.current;
      updateDraft(unchanged ? toDraft(sponsorsForPlacement(placement, fresh)) : reconcileSponsorDraft(draftRef.current, attempt));
      dirtyRef.current = !unchanged;
      setDirty(!unchanged);
    } catch (saveError: unknown) {
      if (mounted.current) setError(saveError instanceof Error ? saveError.message : "Save failed");
      throw saveError;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const save = useSaveState({ isDirty: dirty, onSave: persist });
  async function handleSave(origin: "header" | "guard" = "header") {
    if (savingRef.current || uploadingRef.current || (origin !== "guard" && save.state === "saving") || loading) return false;
    try {
      if (origin === "guard" && save.state === "saving") await persist();
      else await save.save();
      return !dirtyRef.current && !uploadingRef.current && !pendingSave.current;
    } catch { return false; }
  }
  latestSave.current = handleSave;

  async function discard() {
    if (savingRef.current || uploadingRef.current) throw new Error("Wait for the current upload or save.");
    const pending = pendingSave.current;
    const fresh = await fetchSponsorList(clubId);
    if (pending?.insertUncertain && !confirmSponsorInserts(pending, fresh)) {
      throw new Error("The previous save has not been confirmed.");
    }
    const urls = [...ownedUploads.current];
    await deleteUnusedSponsorStorageUrls(urls);
    urls.forEach((url) => ownedUploads.current.delete(url));
    pendingSave.current = null;
    setAllLogos(fresh);
    updateDraft(toDraft(sponsorsForPlacement(placement, fresh)));
    dirtyRef.current = false;
    setDirty(false);
    setError(null);
  }
  latestDiscard.current = discard;
  const requestNavigation = useUnsavedGuard({
    dirty: dirty || uploading || saving,
    edited: placement === "carousel" ? "homepage carousel sponsor logos" : "footer sponsor logos",
    onSave: () => latestSave.current("guard"),
    onDiscard: () => latestDiscard.current(),
  });

  const limit = sponsorLimitForPlacement(placement);
  const saveState = uploading ? "saving" : save.state;
  const previewLogos: DBSiteSponsorLogo[] = draftLogos.map((logo, index) => ({
    id: logo.id ?? `draft-${index}`,
    placement,
    name: logo.name.trim() || `Sponsor ${index + 1}`,
    logo_url: logo.logo_url,
    sort_order: index,
    show_on_homepage: placement === "carousel",
    show_in_footer: placement === "footer",
    website_url: null,
    created_at: "",
  }));

  return (
    // overflow-x-clip (not overflow-hidden): still clips the SlidingPanel's
    // horizontal slide animation, but `clip` doesn't turn this wrapper into a
    // scroll container, which would silently disable sticky descendants if
    // one is ever added here.
    <AdminPage className="overflow-x-clip">
      <AdminPageHeader
        title="Sponsors"
        description={hidesSponsorFooterTab
          ? "Manage sponsor logos for the homepage carousel."
          : "Manage sponsor logos for the homepage carousel and footer."}
        actions={<AdminSaveActions state={saveState} onSave={() => void handleSave()} stackOnMobile />}
      />

        <div className={`grid min-w-0 gap-6 ${!hidesSponsorFooterTab ? "xl:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]" : ""}`}>
          {!hidesSponsorFooterTab && (
            <AdminSectionRail
              className="self-start"
              items={sectionItems}
              value={placement}
              onChange={(id) => {
                if (savingRef.current || loading) return;
                const next = id as SponsorLogoPlacement;
                if (next === placement) return;
                requestNavigation({
                  kind: "switch", label: PLACEMENT_LABELS[next],
                  continue: () => {
                    setSkeletonCount(sponsorsForPlacement(next, allLogos).length);
                    setLoading(true);
                    selectPlacement(next);
                  },
                });
              }}
            />
          )}

          <ShimmerRegion loading={loading} skeleton={<SponsorsSkeleton placement={placement} count={skeletonCount} />} minHeight={0} loadingLabel="Loading sponsor logos">
          <div className="flex min-w-0 flex-col gap-4">
          <AdminPanel className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-body text-xs normal-case tracking-normal text-muted-foreground">
                  {placement === "carousel" ? "Homepage Carousel Logos" : "Footer Logos"}
                </p>
                <p className="font-body mt-1 text-xs text-muted-foreground">
                  {placement === "carousel"
                    ? "Sponsor logos shown on your homepage and your Sponsors page."
                    : "Static sponsor logos shown in the website footer."}
                </p>
              </div>
              <span className="font-body text-xs normal-case tracking-normal text-muted-foreground">
                {draftLogos.length}/{limit}
              </span>
            </div>

            <div ref={list.listRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draftLogos.map((logo, index) => {
                const missingName = logo.name.trim() === "";
                return (
                <div key={logo.key} {...list.rowProps(logo.key)} className="min-w-0">
                  <div
                    className="group relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-muted-foreground/40"
                  >
                    <Image
                      src={logo.logo_url}
                      alt={logo.name || `Sponsor ${index + 1}`}
                      fill
                      sizes="220px"
                      className="object-contain p-4"
                    />
                    {missingName && (
                      <span
                        title="Missing sponsor name — will save as “Sponsor N”"
                        aria-label="Missing sponsor name — will save as Sponsor N"
                        className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning text-warning-foreground"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void removeLogo(index)}
                      disabled={saving || uploading || loading}
                      className="admin-press absolute right-1 top-1 flex size-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove sponsor logo ${index + 1}`}
                    >
                      <X width="12" height="12" />
                    </button>
                  </div>
                  <input
                    value={logo.name}
                    disabled={loading}
                    aria-label={`Sponsor ${index + 1} name`}
                    onChange={(event) => setLogoName(index, event.target.value)}
                    placeholder={`Sponsor ${index + 1} name`}
                    maxLength={SPONSOR_NAME_LIMIT}
                    aria-invalid={missingName || undefined}
                    className={`mt-2 ${inputClass}`}
                  />
                  <div className="mt-1 flex gap-1">
                    <OrderButton
                      label={`Replace sponsor logo ${index + 1}`}
                      disabled={uploading || saving || loading}
                      onClick={() => {
                        replacingKeyRef.current = logo.key;
                        replaceFileRef.current?.click();
                      }}
                    >
                      Replace
                    </OrderButton>
                    <OrderButton
                      label={`Move sponsor logo ${index + 1} left`}
                      disabled={loading || index === 0}
                      onClick={() => moveLogo(index, -1)}
                    >
                      <ChevronLeft width="14" height="14" />
                    </OrderButton>
                    <OrderButton
                      label={`Move sponsor logo ${index + 1} right`}
                      disabled={loading || index === draftLogos.length - 1}
                      onClick={() => moveLogo(index, 1)}
                    >
                      <ChevronRight width="14" height="14" />
                    </OrderButton>
                  </div>
                </div>
                );
              })}

              <FileUpload
                className="col-span-2 sm:col-span-3"
                label="Add sponsor logos"
                accept={GRAPHIC_UPLOAD_ACCEPT}
                hint={`${GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB`}
                multiple
                onUpload={(files) => void handleUpload(files)}
                uploading={uploading}
                disabled={loading || saving || !canAddSponsorLogo(placement, draftLogos.length)}
              />
              <input
                ref={replaceFileRef}
                type="file"
                accept={GRAPHIC_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => handleReplaceUpload(event.target.files)}
              />
            </div>

            {error && (
              <p role="alert" className="font-body mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </AdminPanel>

          <AdminPanel className="overflow-hidden p-4 sm:p-5">
            <p className="font-body mb-4 text-xs normal-case tracking-normal text-muted-foreground">
              {placement === "carousel" ? "Carousel Preview" : "Footer Preview"}
            </p>

            <SlidingPanel activeKey={placement} direction={placementDirection}>
            <div data-admin-public-preview>
            {placement === "carousel" ? (
              <SponsorCarousel sponsors={previewLogos} compact />
            ) : (
              <div
                className="rounded-xl border border-border px-5 py-8"
                style={{ backgroundColor: "var(--color-black)" }}
              >
                <p
                  className="font-display mb-6 text-center text-xs uppercase tracking-widest"
                  style={{ color: "var(--color-gray-mid)" }}
                >
                  Proud Partners
                </p>
                <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                  {previewLogos.map((logo) => (
                    <div key={logo.id} className="relative h-12 w-32 md:h-14 md:w-36">
                      <Image
                        src={logo.logo_url}
                        alt={logo.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            </SlidingPanel>
          </AdminPanel>
          </div>
          </ShimmerRegion>
        </div>
    </AdminPage>
  );
}

function OrderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="admin-press flex min-h-11 flex-1 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SponsorsSkeleton({ placement, count }: { placement: SponsorLogoPlacement; count: number }) {
  const placeholders: DBSiteSponsorLogo[] = Array.from({ length: count }, (_, index) => ({
    id: `skeleton-${index}`, name: "", placement, sort_order: index,
    logo_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlElEQVRogeXOMQEAIAzAsMqeFrTgjcnIwZE/zbnvZ+mAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgLb69Z3wSh87CQAAAABJRU5ErkJggg==",
    show_on_homepage: placement === "carousel", show_in_footer: placement === "footer", website_url: null, created_at: "",
  }));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <AdminPanel className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-body text-xs normal-case tracking-normal text-muted-foreground"><Shimmer>{placement === "carousel" ? "Homepage Carousel Logos" : "Footer Logos"}</Shimmer></p>
            <p className="font-body mt-1 text-xs text-muted-foreground"><Shimmer>{placement === "carousel" ? "Sponsor logos shown on your homepage and your Sponsors page." : "Static sponsor logos shown in the website footer."}</Shimmer></p>
          </div>
          <span className="font-body text-xs normal-case tracking-normal text-muted-foreground"><Shimmer>{count}/{sponsorLimitForPlacement(placement)}</Shimmer></span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {placeholders.map((logo) => <div key={logo.id} className="min-w-0">
            <Shimmer className="aspect-[16/9] rounded-lg" />
            <Shimmer className="mt-2"><input aria-hidden="true" tabIndex={-1} disabled className={inputClass} style={{ visibility: "hidden" }} /></Shimmer>
            <div className="mt-1 flex gap-1"><Shimmer className="h-11 flex-1" /><Shimmer className="h-11 flex-1" /><Shimmer className="h-11 flex-1" /></div>
          </div>)}
          <Shimmer className="col-span-2 rounded-xl sm:col-span-3"><div style={{ visibility: "hidden" }}><FileUpload label="Add sponsor logos" accept={GRAPHIC_UPLOAD_ACCEPT} hint={`${GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB`} multiple onUpload={() => {}} disabled /></div></Shimmer>
        </div>
      </AdminPanel>
      <AdminPanel className="overflow-hidden p-4 sm:p-5">
        <p className="font-body mb-4 text-xs normal-case tracking-normal text-muted-foreground"><Shimmer>{placement === "carousel" ? "Carousel Preview" : "Footer Preview"}</Shimmer></p>
        {placement === "carousel" ? count > 0 && <Shimmer><div data-admin-public-preview style={{ visibility: "hidden" }}><SponsorCarousel sponsors={placeholders} compact /></div></Shimmer> : <Shimmer><div data-admin-public-preview className="rounded-xl border border-border px-5 py-8" style={{ visibility: "hidden" }}><p className="font-display mb-6 text-center text-xs uppercase tracking-widest">Proud Partners</p><div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">{placeholders.map((logo) => <div key={logo.id} className="relative h-12 w-32 md:h-14 md:w-36" />)}</div></div></Shimmer>}
      </AdminPanel>
    </div>
  );
}
