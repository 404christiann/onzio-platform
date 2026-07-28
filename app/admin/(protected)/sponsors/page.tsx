"use client";

import { useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import {
  canAddSponsorLogo,
  defaultSponsorLogosForPlacement,
  diffSponsorLogos,
  sponsorLimitForPlacement,
  sponsorStoragePathFromPublicUrl,
  type DraftSponsorLogo,
} from "@/lib/sponsor-content";
import { createClient } from "@/lib/admin-client";

const inputStyle: CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.5rem",
  color: "white",
  padding: "0.65rem 0.75rem",
  fontSize: "0.88rem",
  outline: "none",
};

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
  const clubId = useClubId();
  const [placement, setPlacement] = useState<SponsorLogoPlacement>("carousel");
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
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const replacingIndexRef = useRef<number | null>(null);

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
      if (fileRef.current) fileRef.current.value = "";
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
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          Sponsors
        </h1>
        <p
          className="font-body mt-1"
          style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}
        >
          Manage sponsor logos for the homepage carousel and footer.
        </p>
      </div>

      {loading ? (
        <p
          className="font-display text-sm uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Loading…
        </p>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
          <section
            className="min-w-0 self-start rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg p-1" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              {[
                { id: "carousel" as const, label: "Carousel" },
                { id: "footer" as const, label: "Footer" },
              ].map((tab) => {
                const isSelected = placement === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={saving || uploading}
                    onClick={() => {
                      if (tab.id === placement) return;
                      if (dirty && !window.confirm("Discard unsaved sponsor changes before switching placements?")) {
                        return;
                      }
                      setPlacement(tab.id);
                      setSaved(false);
                    }}
                    className="font-display rounded-md px-3 py-3 text-xs uppercase tracking-widest transition-colors"
                    style={{
                      backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                      color: isSelected ? "#141414" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p
                  className="font-display text-xs uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {placement === "carousel" ? "Homepage Carousel Logos" : "Footer Logos"}
                </p>
                <p
                  className="font-body mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  {placement === "carousel"
                    ? "Scrolling sponsor logos shown after the homepage slideshow."
                    : "Static sponsor logos shown in the website footer."}
                </p>
              </div>
              <span
                className="font-display text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {draftLogos.length}/{limit}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {draftLogos.map((logo, index) => (
                <div key={logo.id ?? logo.logo_url} className="min-w-0">
                  <div
                    className="group relative aspect-[16/9] w-full overflow-hidden rounded-lg"
                    style={{ border: "1px solid rgba(255,255,255,0.08)", backgroundColor: "#0D0D0D" }}
                  >
                    <Image
                      src={logo.logo_url}
                      alt={logo.name || `Sponsor ${index + 1}`}
                      fill
                      sizes="220px"
                      className="object-contain p-4"
                    />
                    <button
                      type="button"
                      onClick={() => void removeLogo(index)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full opacity-100 transition-opacity sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      style={{ backgroundColor: "#E7001B" }}
                      aria-label={`Remove sponsor logo ${index + 1}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <input
                    value={logo.name}
                    onChange={(event) => setLogoName(index, event.target.value)}
                    placeholder={`Sponsor ${index + 1} name`}
                    className="mt-2"
                    style={inputStyle}
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
              ))}

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !canAddSponsorLogo(placement, draftLogos.length)}
                className="flex aspect-[16/9] w-full flex-col items-center justify-center rounded-lg transition-colors"
                style={{
                  border: "1px dashed rgba(255,255,255,0.15)",
                  backgroundColor: uploading ? "rgba(255,255,255,0.03)" : "transparent",
                  color: "rgba(255,255,255,0.3)",
                  cursor:
                    uploading || !canAddSponsorLogo(placement, draftLogos.length)
                      ? "not-allowed"
                      : "pointer",
                  opacity: canAddSponsorLogo(placement, draftLogos.length) ? 1 : 0.4,
                }}
                aria-label="Add sponsor logos"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span
                  className="font-display mt-1 uppercase"
                  style={{ fontSize: "0.55rem", letterSpacing: "0.08em" }}
                >
                  {uploading ? "Uploading" : "Add"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handleUpload(event.target.files)}
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
              <p className="font-body mt-4 text-sm" style={{ color: "#E7001B" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveDisabled}
              className="font-display mt-5 w-full rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition-opacity"
              style={{
                backgroundColor: "#E7001B",
                color: "white",
                opacity: saveDisabled ? 0.5 : 1,
                cursor: saveDisabled ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : `Save ${placement === "carousel" ? "Carousel" : "Footer"} Logos`}
            </button>
          </section>

          <section
            className="min-w-0 overflow-hidden rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p
              className="font-display mb-4 text-xs uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {placement === "carousel" ? "Carousel Preview" : "Footer Preview"}
            </p>

            {placement === "carousel" ? (
              <SponsorCarousel sponsors={previewLogos} compact />
            ) : (
              <div
                className="rounded-xl border border-white/10 px-5 py-8"
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
          </section>
        </div>
      )}
    </div>
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
      className="flex h-7 flex-1 items-center justify-center rounded-md text-xs transition-opacity"
      style={{
        backgroundColor: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.45)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
