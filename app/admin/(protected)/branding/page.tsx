"use client";

import { useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { Loader } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Textarea } from "@/components/ui/textarea";
import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import {
  CLUB_LOGO_BUCKET,
  FOOTER_TAGLINE_LIMIT,
  resolveFooterTagline,
  validateFooterTagline,
} from "@/lib/club-branding";
import { fetchSiteSocialLinks } from "@/lib/queries";
import {
  DEFAULT_SITE_SOCIAL_LINKS,
  normalizeSiteSocialLinks,
  socialLinkLabel,
} from "@/lib/social-links";
import { deleteStoragePaths } from "@/lib/storage-cleanup";
import { createClient } from "@/lib/admin-client";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function fileExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function BrandingPage() {
  const clubId = useClubId();
  const { clubLogoPath, clubLogoUrl, inverseLogoUrl, setClubLogoPath } = useClubBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingSocialLinks, setSavingSocialLinks] = useState(false);
  const [saved, setSaved] = useState(false);
  const [socialSaved, setSocialSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] =
    useState<DBSiteSocialLink[]>(DEFAULT_SITE_SOCIAL_LINKS);
  // The club's footer tagline. Stored empty means "use the standard wording",
  // which is what the textarea shows as its placeholder.
  const [footerTagline, setFooterTagline] = useState("");

  useEffect(() => {
    if (!logoFile) {
      setLocalPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!saved && !socialSaved) return;
    const timeoutId = window.setTimeout(() => {
      setSaved(false);
      setSocialSaved(false);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [saved, socialSaved]);

  useEffect(() => {
    fetchSiteSocialLinks(clubId)
      .then(setSocialLinks)
      .catch((loadError: unknown) => {
        setSocialError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load social links.",
        );
      });

    createClient()
      .from("site_branding")
      .select("footer_tagline")
      .limit(1)
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setSocialError(loadError.message);
          return;
        }
        const row = (data ?? [])[0] as { footer_tagline?: string } | undefined;
        // Shows the resolved template default as a real, editable value
        // rather than a placeholder hint (Christian found the
        // placeholder-only pattern confusing, 2026-08-09). Clearing this back
        // to empty and saving still gets the "use the live template default"
        // blank state, since resolveFooterTagline treats blank exactly as it
        // always has.
        setFooterTagline(resolveFooterTagline(row?.footer_tagline));
      });
  }, [clubId]);

  function handleFile(file: File | null) {
    setError(null);
    setSaved(false);

    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("The logo must be 5 MB or smaller.");
      return;
    }

    setLogoFile(file);
  }

  /**
   * Club logo upload.
   *
   * This used to be a stub that unconditionally set the error "Logo uploads are
   * temporarily unavailable until the Phase 4 secure media processor is
   * enabled." That processor shipped in Phase 4 and every other admin surface
   * has used it since; only this handler was never reconnected, so /admin/branding
   * has been the one image field in the portal that could never succeed —
   * a different failure from MEDIA_AUTH_FAILED, on the same button.
   *
   * `logos_v2` is already mapped to the `branding` media surface in
   * lib/admin-client.ts, so this goes through the same
   * authorize -> stage -> finalize -> publish chain as every other upload, and
   * `clubLogoUrl` already resolves a published `<club>/<surface>/<uuid>.<ext>`
   * path against the public onzio-media bucket.
   */
  async function saveLogo() {
    if (!logoFile || saving) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: uploadError } = await supabase.storage
        .from(CLUB_LOGO_BUCKET)
        .upload(`club-logo/${Date.now()}.${fileExtension(logoFile)}`, logoFile);
      if (uploadError || !data?.path) {
        throw new Error(uploadError?.message ?? "The logo could not be uploaded.");
      }

      const { error: saveError } = await supabase
        .from("site_branding")
        .upsert({
          club_logo_path: data.path,
          updated_at: new Date().toISOString(),
        });
      if (saveError) throw new Error(saveError.message);

      setClubLogoPath(data.path);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSaved(true);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "The logo could not be uploaded.",
      );
    } finally {
      setSaving(false);
    }
  }

  function setSocialHref(id: SiteSocialPlatform, href: string) {
    setSocialLinks((current) =>
      normalizeSiteSocialLinks(
        current.map((link) => (link.id === id ? { ...link, href } : link)),
      ),
    );
    setSocialSaved(false);
  }

  async function saveSocialLinks() {
    if (savingSocialLinks) return;

    const taglineError = validateFooterTagline(footerTagline);
    if (taglineError) {
      setSocialError(taglineError);
      return;
    }

    setSavingSocialLinks(true);
    setSocialSaved(false);
    setSocialError(null);

    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const rows = normalizeSiteSocialLinks(socialLinks).map((link, index) => ({
        id: link.id,
        label: socialLinkLabel(link.id),
        href: link.href.trim(),
        icon: link.icon,
        sort_order: index,
        updated_at: now,
      }));

      const { error: saveError } = await supabase
        .from("site_social_links")
        .upsert(rows);
      if (saveError) throw new Error(saveError.message);

      const { error: taglineSaveError } = await supabase
        .from("site_branding")
        .upsert({ footer_tagline: footerTagline.trim(), updated_at: now });
      if (taglineSaveError) throw new Error(taglineSaveError.message);

      setSocialLinks(rows);
      setSocialSaved(true);
    } catch (saveError) {
      setSocialError(
        saveError instanceof Error
          ? saveError.message
          : "The social links could not be saved.",
      );
    } finally {
      setSavingSocialLinks(false);
    }
  }

  const previewUrl = localPreviewUrl ?? clubLogoUrl;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminSaveFeedback
        saving={saving || savingSocialLinks}
        saved={saved || socialSaved}
        savingLabel={savingSocialLinks ? "Updating footer…" : "Updating club logo…"}
        successLabel={socialSaved ? "Footer updated" : "Club logo updated"}
      />

      <div className="mb-8">
        <h1
          className="font-display font-black uppercase leading-none text-foreground"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Branding
        </h1>
        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
          Manage the club crest used across the public website and admin portal. Clubs can also carry an inverse crest for dark presentation surfaces.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <section
          className="rounded-xl border border-border bg-background p-5 sm:p-7"
          aria-labelledby="club-logo-heading"
        >
          <div className="mb-6">
            <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-destructive">
              Club Identity
            </p>
            <h2 id="club-logo-heading" className="mt-2 font-display text-2xl font-black uppercase text-foreground">
              Main Club Logo
            </h2>
            <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">
              For the cleanest result, use a square PNG with a transparent background. PNG, JPG, and WebP files up to 5 MB are accepted.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-black/20 p-5 sm:p-6">
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <div className="relative h-32 w-32 flex-none overflow-hidden rounded-full border border-border bg-card p-3">
                <Image
                  src={previewUrl}
                  alt="Club logo preview"
                  fill
                  sizes="128px"
                  className="object-contain p-3"
                  unoptimized={Boolean(localPreviewUrl)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-black uppercase text-foreground">
                  {logoFile ? "New logo selected" : "Current logo"}
                </p>
                <p className="mt-1 truncate font-body text-xs text-muted-foreground">
                  {logoFile?.name ?? "This is the logo currently shown throughout the site."}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="mt-4 rounded-lg border border-border bg-card px-5 py-2.5 font-display text-sm font-black uppercase tracking-widest text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {logoFile ? "Choose Different Image" : "Choose New Logo"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={saveLogo}
            disabled={!logoFile || saving}
            className="mt-6 w-full rounded-lg bg-destructive px-6 py-4 font-display text-lg font-black uppercase tracking-widest text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {saving && <Loader className="mr-2 inline size-4 animate-spin" />}
            {saving ? "Saving…" : "Save New Club Logo"}
          </button>
        </section>

        <aside className="space-y-4" aria-label="Logo previews and usage">
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border">
            <div className="flex aspect-square items-center justify-center bg-white p-5">
              <div className="relative h-full w-full">
                <Image src={previewUrl} alt="Logo on a light background" fill sizes="180px" className="object-contain" unoptimized={Boolean(localPreviewUrl)} />
              </div>
            </div>
            <div className="flex aspect-square items-center justify-center bg-background p-5">
              <div className="relative h-full w-full">
                <Image src={inverseLogoUrl || previewUrl} alt="Logo on a dark background" fill sizes="180px" className="object-contain" unoptimized={Boolean(localPreviewUrl)} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-5">
            <h2 className="font-display text-lg font-black uppercase text-foreground">Where it updates</h2>
            <ul className="mt-4 space-y-3 font-body text-sm text-muted-foreground">
              {["Website navigation", "Website footer", "Next match card", "Admin login and menu", "Players without a photo", "Browser tab icon"].map((location) => (
                <li key={location} className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-destructive" aria-hidden="true" />
                  {location}
                </li>
              ))}
            </ul>
          </div>

          <p className="font-body text-xs leading-relaxed text-muted-foreground">
            When you replace an admin-uploaded logo, the previous uploaded file is removed after the new logo is saved.
          </p>
        </aside>

        <section
          className="rounded-xl border border-border bg-background p-5 sm:p-7 lg:col-span-2"
          aria-labelledby="footer-social-heading"
        >
          <div className="mb-6">
            <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-destructive">
              Footer
            </p>
            <h2 id="footer-social-heading" className="mt-2 font-display text-2xl font-black uppercase text-foreground">
              Tagline and Social Links
            </h2>
            <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">
              Edit the club tagline beside the crest and the URLs used by the social icons in the public website footer.
            </p>
          </div>

          <div className="mb-6">
            <label
              htmlFor="footer-tagline"
              className={ADMIN_LABEL_CLASS}
            >
              Footer tagline
            </label>
            <Textarea
              id="footer-tagline"
              value={footerTagline}
              onChange={(event) => {
                setFooterTagline(event.target.value);
                setSocialSaved(false);
                setSocialError(null);
              }}
              rows={2}
              maxLength={FOOTER_TAGLINE_LIMIT}
            />
            <p className="mt-1 font-body text-xs text-muted-foreground">
              Shown under the club name in the footer. Press Enter for a second
              line. Leave empty to keep the standard wording shown here.
            </p>
          </div>

          <div className="space-y-3">
            {socialLinks.map((link) => (
              <div
                key={link.id}
                className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-end gap-x-3"
              >
                <label
                  htmlFor={`social-${link.id}`}
                  className={`col-start-2 ${ADMIN_LABEL_CLASS}`}
                >
                  {link.label}
                </label>
                <div className="relative h-8 w-8 self-center opacity-70">
                  <Image
                    src={link.icon}
                    alt=""
                    fill
                    sizes="32px"
                    className="object-contain brightness-0 invert"
                  />
                </div>
                <input
                  id={`social-${link.id}`}
                  type="url"
                  value={link.href}
                  onChange={(event) => setSocialHref(link.id, event.target.value)}
                  placeholder="https://..."
                  className={ADMIN_INPUT_CLASS}
                  style={{ colorScheme: "dark" }}
                />
              </div>
            ))}
          </div>

          {socialError && (
            <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive" role="alert">
              {socialError}
            </p>
          )}

          <button
            type="button"
            onClick={saveSocialLinks}
            disabled={savingSocialLinks}
            className="mt-6 w-full rounded-lg bg-destructive px-6 py-4 font-display text-lg font-black uppercase tracking-widest text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {savingSocialLinks && <Loader className="mr-2 inline size-4 animate-spin" />}
            {savingSocialLinks ? "Saving…" : "Save Footer"}
          </button>
        </section>
      </div>
    </div>
  );
}
