"use client";

import { useClubContext } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import {
  AdminSectionRail,
  type AdminSectionRailItem,
} from "@/components/admin/AdminSectionRail";
import FileUpload from "@/components/admin/FileUpload";
import SponsorCarousel from "@/components/SponsorCarousel";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";
import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import {
  canAddSponsorLogo,
  defaultSponsorLogosForPlacement,
  diffSponsorLogos,
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  sponsorLimitForPlacement,
  sponsorStoragePathFromPublicUrl,
  type DraftSponsorLogo,
} from "@/lib/sponsor-content";
import { createClient } from "@/lib/admin-client";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import { Skeleton } from "@/components/ui/skeleton";

const PLACEMENT_ORDER: SponsorLogoPlacement[] = ["carousel", "footer"];

// Each rail row states both the placement and its upload cap directly, so the
// cap is visible before a save ever runs — not just in the description text.
const PLACEMENT_LABELS: Record<SponsorLogoPlacement, string> = {
  carousel: `Carousel — up to ${MAX_CAROUSEL_SPONSORS}`,
  footer: `Footer — up to ${MAX_FOOTER_SPONSORS}`,
};

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

async function uploadSponsorLogo(file: File, placement: SponsorLogoPlacement): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "png";
  const path = `site-sponsors/${placement}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("sponsors").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("sponsors").getPublicUrl(path);
  return data.publicUrl;
}

async function deleteSponsorStorageUrls(urls: string[]): Promise<void> {
  const paths = urls
    .map(sponsorStoragePathFromPublicUrl)
    .filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase.storage.from("sponsors").remove(paths);
  if (error) throw new Error(error.message);
}

async function deleteUnusedSponsorStorageUrls(urls: string[]): Promise<void> {
  const supabase = createClient();
  const unusedUrls: string[] = [];

  for (const url of urls) {
    const { count, error } = await supabase
      .from("site_sponsor_logos")
      .select("id", { count: "exact", head: true })
      .eq("logo_url", url);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) unusedUrls.push(url);
  }

  await deleteSponsorStorageUrls(unusedUrls);
}

function toDraft(logos: DBSiteSponsorLogo[]): DraftSponsorLogo[] {
  return logos.map((logo) => ({
    id: logo.id,
    name: logo.name,
    logo_url: logo.logo_url,
  }));
}

export default function AdminSponsorsPage() {
  const club = useClubContext();
  const clubId = club.id;
  // academy@1's footer deliberately renders no sponsor strip (DCFC-D132 — it
  // would duplicate the homepage SponsorCarousel), so footer-placement logos
  // are never displayed on an academy@1 site. Hide that placement tab and pin
  // the editor to the carousel; every other template keeps both placements.
  // editorial@1's EditorialFooter also renders no sponsor strip, so the same
  // applies there.
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const hidesSponsorFooterTab = isAcademy || isEditorial;
  // Rail rows follow PLACEMENT_ORDER. The footer row carries `hidden` for
  // academy@1/editorial@1 (same gate as before), which drops it out of the
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
  const [originalLogos, setOriginalLogos] = useState<DBSiteSponsorLogo[]>(
    defaultSponsorLogosForPlacement("carousel"),
  );
  const [draftLogos, setDraftLogos] = useState<DraftSponsorLogo[]>(
    toDraft(defaultSponsorLogosForPlacement("carousel")),
  );
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const replacingIndexRef = useRef<number | null>(null);
  const showFullLoader = useDelayedLoading(loading, 400);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSiteSponsorLogos(placement, clubId)
      .then((logos) => {
        setOriginalLogos(logos);
        setDraftLogos(toDraft(logos));
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load sponsor logos");
      })
      .finally(() => setLoading(false));
  }, [clubId, placement]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function setLogoName(index: number, name: string) {
    setDraftLogos((current) =>
      current.map((logo, logoIndex) => (logoIndex === index ? { ...logo, name } : logo)),
    );
    markDirty();
  }

  function moveLogo(index: number, delta: -1 | 1) {
    setDraftLogos((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    markDirty();
  }

  async function removeLogo(index: number) {
    const logo = draftLogos[index];
    setDraftLogos((current) => current.filter((_, logoIndex) => logoIndex !== index));
    markDirty();

    if (logo?.id === null) {
      try {
        await deleteSponsorStorageUrls([logo.logo_url]);
      } catch (deleteError: unknown) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to remove uploaded file");
      }
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = Math.max(0, sponsorLimitForPlacement(placement) - draftLogos.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    markDirty();
    try {
      const uploaded: DraftSponsorLogo[] = [];
      for (const file of selected) {
        uploaded.push({
          id: null,
          name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          logo_url: await uploadSponsorLogo(file, placement),
        });
      }
      setDraftLogos((current) =>
        [...current, ...uploaded].slice(0, sponsorLimitForPlacement(placement)),
      );
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleReplaceUpload(files: FileList | null) {
    const replaceIndex = replacingIndexRef.current;
    const file = files?.[0] ?? null;
    if (replaceIndex === null || !file || !draftLogos[replaceIndex]) return;

    const replacedLogo = draftLogos[replaceIndex];
    setUploading(true);
    setError(null);
    try {
      const nextUrl = await uploadSponsorLogo(file, placement);
      setDraftLogos((current) =>
        current.map((logo, logoIndex) =>
          logoIndex === replaceIndex
            ? {
                ...logo,
                logo_url: nextUrl,
                name: logo.name.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
              }
            : logo,
        ),
      );
      markDirty();

      if (replacedLogo.id === null) {
        await deleteSponsorStorageUrls([replacedLogo.logo_url]);
      }
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      replacingIndexRef.current = null;
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();
      const { toDelete, toInsert, toUpdate } = diffSponsorLogos(
        placement,
        originalLogos,
        draftLogos,
      );

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("site_sponsor_logos")
          .delete()
          .in("id", toDelete.map((logo) => logo.id));
        if (deleteError) throw new Error(deleteError.message);
      }

      for (const update of toUpdate) {
        const { error: updateError } = await supabase
          .from("site_sponsor_logos")
          .update({ name: update.name, logo_url: update.logo_url, sort_order: update.sort_order })
          .eq("id", update.id);
        if (updateError) throw new Error(updateError.message);
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("site_sponsor_logos")
          .insert(toInsert);
        if (insertError) throw new Error(insertError.message);
      }

      const replacedLogoUrls = toUpdate
        .map((update) => {
          const originalLogo = originalLogos.find((logo) => logo.id === update.id);
          return originalLogo && originalLogo.logo_url !== update.logo_url
            ? originalLogo.logo_url
            : null;
        })
        .filter((url): url is string => Boolean(url));

      await deleteUnusedSponsorStorageUrls([
        ...toDelete.map((logo) => logo.logo_url),
        ...replacedLogoUrls,
      ]);

      const fresh = await fetchSiteSponsorLogos(placement, clubId);
      setOriginalLogos(fresh);
      setDraftLogos(toDraft(fresh));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const limit = sponsorLimitForPlacement(placement);
  const saveDisabled = saving || uploading || !dirty;
  const previewLogos: DBSiteSponsorLogo[] = draftLogos.map((logo, index) => ({
    id: logo.id ?? `draft-${index}`,
    placement,
    name: logo.name.trim() || `Sponsor ${index + 1}`,
    logo_url: logo.logo_url,
    sort_order: index,
    created_at: "",
  }));

  return (
    // overflow-x-clip (not overflow-hidden): still clips the SlidingPanel's
    // horizontal slide animation, but `clip` doesn't turn this wrapper into a
    // scroll container, which would silently disable sticky descendants if
    // one is ever added here.
    <AdminPage className="overflow-x-clip">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        title="Sponsors"
        description={hidesSponsorFooterTab
          ? "Manage sponsor logos for the homepage carousel."
          : "Manage sponsor logos for the homepage carousel and footer."}
        actions={
          !loading ? (
            <>
              {dirty && (
                <div className="flex items-center gap-2 border-r border-border pr-3">
                  <span
                    className="h-2 w-2 flex-none rounded-full bg-warning"
                    aria-hidden="true"
                  />
                  <span className="font-body whitespace-nowrap text-sm text-muted-foreground">
                    Unsaved changes
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="rounded-lg bg-primary px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <AdminLoadingDots className="mr-2" />}
                {saving ? "Saving…" : `Save ${placement === "carousel" ? "Carousel" : "Footer"} Logos`}
              </button>
            </>
          ) : undefined
        }
      />

      {loading || showFullLoader ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading sponsors" />
        ) : (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]" role="status" aria-label="Loading sponsors">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        )
      ) : (
        <div className={`grid min-w-0 gap-6 ${!hidesSponsorFooterTab ? "xl:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]" : ""}`}>
          {!hidesSponsorFooterTab && (
            <AdminSectionRail
              className="self-start"
              items={sectionItems}
              value={placement}
              onChange={(id) => {
                // AdminSectionRail has no per-row disabled affordance, so a
                // mid-save/upload switch is simply ignored here instead of
                // rendering a visually disabled row.
                if (saving || uploading) return;
                const next = id as SponsorLogoPlacement;
                if (next === placement) return;
                if (dirty && !window.confirm("Discard unsaved sponsor changes before switching placements?")) {
                  return;
                }
                selectPlacement(next);
                setSaved(false);
              }}
            />
          )}

          <div className="flex min-w-0 flex-col gap-4">
          <AdminPanel className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                  {placement === "carousel" ? "Homepage Carousel Logos" : "Footer Logos"}
                </p>
                <p className="font-body mt-1 text-xs text-muted-foreground">
                  {placement === "carousel"
                    ? "Scrolling sponsor logos shown after the homepage slideshow."
                    : "Static sponsor logos shown in the website footer."}
                </p>
              </div>
              <span className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                {draftLogos.length}/{limit}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draftLogos.map((logo, index) => {
                const missingName = logo.name.trim() === "";
                return (
                <div key={logo.id ?? logo.logo_url} className="min-w-0">
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
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      aria-label={`Remove sponsor logo ${index + 1}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <input
                    value={logo.name}
                    onChange={(event) => setLogoName(index, event.target.value)}
                    placeholder={`Sponsor ${index + 1} name`}
                    aria-invalid={missingName || undefined}
                    className={`mt-2 ${inputClass}`}
                  />
                  <div className="mt-1 flex gap-1">
                    <OrderButton
                      label={`Replace sponsor logo ${index + 1}`}
                      disabled={uploading || saving}
                      onClick={() => {
                        replacingIndexRef.current = index;
                        replaceFileRef.current?.click();
                      }}
                    >
                      Replace
                    </OrderButton>
                    <OrderButton
                      label={`Move sponsor logo ${index + 1} left`}
                      disabled={index === 0}
                      onClick={() => moveLogo(index, -1)}
                    >
                      ←
                    </OrderButton>
                    <OrderButton
                      label={`Move sponsor logo ${index + 1} right`}
                      disabled={index === draftLogos.length - 1}
                      onClick={() => moveLogo(index, 1)}
                    >
                      →
                    </OrderButton>
                  </div>
                </div>
                );
              })}

              <FileUpload
                className="col-span-2 sm:col-span-3"
                label="Add sponsor logos"
                accept="image/*"
                multiple
                onUpload={(files) => void handleUpload(files)}
                uploading={uploading}
                disabled={!canAddSponsorLogo(placement, draftLogos.length)}
              />
              <input
                ref={replaceFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleReplaceUpload(event.target.files)}
              />
            </div>

            {error && (
              <p className="font-body mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </AdminPanel>

          <AdminPanel className="overflow-hidden p-4 sm:p-5">
            <p className="font-display mb-4 text-xs uppercase tracking-widest text-muted-foreground">
              {placement === "carousel" ? "Carousel Preview" : "Footer Preview"}
            </p>

            <SlidingPanel activeKey={placement} direction={placementDirection}>
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
            </SlidingPanel>
          </AdminPanel>
          </div>
        </div>
      )}
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
      className="flex h-7 flex-1 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
