"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  ChevronLeft,
  IconBranding,
  IconClock,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSuccess,
  IconUpload,
} from "@/components/admin/icons";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/admin-client";
import type { YourClubData } from "@/lib/admin-your-club-data";
import { CLUB_LOGO_BUCKET, clubLogoUrl, resolveFooterTagline } from "@/lib/club-branding";
import type { SiteSocialPlatform } from "@/lib/db-types";
import {
  GRAPHIC_UPLOAD_ACCEPT,
  GRAPHIC_UPLOAD_TYPES_LABEL,
  isGraphicUploadType,
} from "@/lib/media-upload-types";
import type { WebsiteState } from "@/lib/save-status";
import {
  SOCIAL_PLATFORMS,
  YOUR_CLUB_LIMITS,
  changeSummary,
  counterLabel,
  draftFromSaved,
  effectiveSocialHref,
  validateYourClub,
  type YourClubDraft,
  type YourClubField,
  type YourClubShown,
} from "@/lib/your-club";
import { FitLogo } from "./FitLogo";
import { TopBarTakeover } from "./TopBar";
import barStyles from "./reimagined.module.css";
import styles from "./your-club.module.css";

// ADMIN-RE-14: Your club (design: cd-your-club; decision 0006; group 3
// decisions 10 and 11). The logo, how people reach the club, the social pages
// and the footer line, with one Save. On the right, the website's footer and
// Contact page follow what is typed. Writes go through the admin client, which
// sends every one to POST /api/admin/data: Zod there, RLS under it. Only what
// changed is written, so saving never creates empty rows.

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
/** How long the Save button keeps confirming before it is ready again. */
const DONE_MS = 4000;

type SaveState = "idle" | "busy" | "done";
type Errors = Partial<Record<YourClubField | "logo", string>>;

function plural(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "change" : "changes"}`;
}

export function YourClub({
  clubName,
  data,
  shown,
  canSave,
  websiteState,
  savedText,
}: {
  clubName: string;
  data: YourClubData;
  shown: YourClubShown;
  canSave: boolean;
  websiteState: WebsiteState;
  /** The hold-aware label from lib/save-status.ts (decision 2), worked out on the server. */
  savedText: string;
}) {
  if (data.status === "error") {
    return (
      <div className={styles.page} data-admin-page="your-club">
        <PageHead />
        <p className={styles.alert} role="alert">
          We could not load your club’s details. Refresh the page to try again.
        </p>
      </div>
    );
  }
  return (
    <Editor
      clubName={clubName}
      data={data}
      shown={shown}
      canSave={canSave}
      websiteState={websiteState}
      savedText={savedText}
    />
  );
}

function PageHead() {
  return (
    <header className={styles.head}>
      <span className={styles.headIcon}>
        <IconBranding className="size-6" aria-hidden="true" />
      </span>
      <h1 className={styles.title}>Your club</h1>
    </header>
  );
}

function Editor({
  clubName,
  data,
  shown,
  canSave,
  websiteState,
  savedText,
}: {
  clubName: string;
  data: Extract<YourClubData, { status: "ready" }>;
  shown: YourClubShown;
  canSave: boolean;
  websiteState: WebsiteState;
  savedText: string;
}) {
  const router = useRouter();
  const { setClubLogoPath, refreshClubBranding } = useClubBranding();
  const [saved, setSaved] = useState<YourClubDraft>(data.saved);
  const [draft, setDraft] = useState<YourClubDraft>(() => draftFromSaved(data.saved));
  const [logoUrl, setLogoUrl] = useState(data.logoUrl);
  const [pendingLogo, setPendingLogo] = useState<{ file: File; url: string } | null>(null);
  const [fitting, setFitting] = useState<File | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A logo already uploaded by a Save that then failed later: a retry reuses it. */
  const uploadedLogo = useRef<{ file: File; path: string } | null>(null);

  const summary = useMemo(
    () => changeSummary(saved, draft, shown, pendingLogo !== null),
    [saved, draft, shown, pendingLogo],
  );
  const busy = save === "busy";
  const dirty = summary.count > 0;

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(
    () => () => {
      if (pendingLogo) URL.revokeObjectURL(pendingLogo.url);
    },
    [pendingLogo],
  );

  function edit(update: (current: YourClubDraft) => YourClubDraft, field: YourClubField) {
    setDraft(update);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(null);
    if (save === "done") setSave("idle");
  }

  function chooseLogo(file: File | null) {
    setErrors((current) => ({ ...current, logo: undefined }));
    if (!file) return;
    if (!isGraphicUploadType(file.type)) {
      setErrors((current) => ({ ...current, logo: `Choose a ${GRAPHIC_UPLOAD_TYPES_LABEL} picture.` }));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErrors((current) => ({ ...current, logo: "The logo must be 5 MB or smaller." }));
      return;
    }
    setFitting(file);
  }

  function keepLogo(file: File) {
    setPendingLogo({ file, url: URL.createObjectURL(file) });
    setFitting(null);
    setMessage(null);
    if (save === "done") setSave("idle");
    if (fileInput.current) fileInput.current.value = "";
  }

  function cancelFit() {
    setFitting(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** The errors that block this Save: only for what changed, so an old long value never traps an unrelated edit. */
  function blockingErrors(): Errors {
    const all = validateYourClub(draft, shown);
    const blocking: Errors = {};
    for (const [field, text] of Object.entries(all) as [YourClubField, string][]) {
      const social = SOCIAL_PLATFORMS.some((platform) => platform.id === field);
      const relevant = social
        ? summary.social.includes(field as SiteSocialPlatform)
        : field === "footerLine"
          ? summary.footerLine
          : summary.reach;
      if (relevant) blocking[field] = text;
    }
    return blocking;
  }

  /** True when everything that changed is saved. */
  async function saveAll(): Promise<boolean> {
    if (busy || !canSave || !dirty) return false;
    const blocking = blockingErrors();
    if (Object.keys(blocking).length) {
      setErrors(blocking);
      setMessage("Fix the highlighted answers, then save.");
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[data-yc-invalid="true"]')?.focus(),
      );
      return false;
    }

    setSave("busy");
    setMessage(null);
    setErrors({});
    const supabase = createClient();
    const now = new Date().toISOString();
    const savedParts: string[] = [];
    let nextSaved = saved;
    let failure: { part: string; reason: string } | null = null;
    let newLogoPath: string | null = null;

    try {
      // 1. The logo and the footer line share one row.
      if (summary.logo || summary.footerLine) {
        const row: Record<string, unknown> = { updated_at: now };
        if (summary.logo && pendingLogo) {
          let path = uploadedLogo.current?.file === pendingLogo.file ? uploadedLogo.current.path : null;
          if (!path) {
            const upload = await supabase.storage
              .from(CLUB_LOGO_BUCKET)
              .upload(`club-logo/${Date.now()}.png`, pendingLogo.file);
            if (upload.error || !upload.data?.path) {
              throw new Error(upload.error?.message ?? "The logo could not be uploaded.");
            }
            path = upload.data.path as string;
            uploadedLogo.current = { file: pendingLogo.file, path };
          }
          row.club_logo_path = path;
          newLogoPath = path;
        }
        if (summary.footerLine) row.footer_tagline = draft.footerLine.trim();
        const result = await supabase.from("site_branding").upsert(row);
        if (result.error) throw new Error(result.error.message);
        if (newLogoPath) {
          setClubLogoPath(newLogoPath);
          setLogoUrl(clubLogoUrl(newLogoPath));
          savedParts.push("your logo");
        }
        if (summary.footerLine) {
          nextSaved = { ...nextSaved, footerLine: draft.footerLine.trim() };
          savedParts.push("your footer line");
        }
      }
    } catch (cause) {
      failure = {
        part: summary.logo && summary.footerLine ? "your logo and footer line" : summary.logo ? "your logo" : "your footer line",
        reason: cause instanceof Error ? cause.message : "",
      };
    }

    // 2. Social pages: only the ones that changed. A cleared page keeps its row, blank.
    if (!failure && summary.social.length) {
      const rows = summary.social.map((id) => {
        const platform = SOCIAL_PLATFORMS.find((candidate) => candidate.id === id)!;
        return {
          id,
          label: platform.label,
          href: effectiveSocialHref(saved.social[id], draft.social[id]),
          icon: platform.icon,
          sort_order: SOCIAL_PLATFORMS.indexOf(platform),
          updated_at: now,
        };
      });
      const result = await supabase.from("site_social_links").upsert(rows);
      if (result.error) {
        failure = { part: "your social pages", reason: result.error.message };
      } else {
        nextSaved = {
          ...nextSaved,
          social: { ...nextSaved.social, ...Object.fromEntries(rows.map((row) => [row.id, row.href])) },
        };
        savedParts.push("your social pages");
      }
    }

    // 3. The public contact details, where the website shows them.
    if (!failure && summary.reach) {
      const result = await supabase.from("contact_profile").upsert({
        public_email: draft.email.trim(),
        public_phone: draft.phone.trim(),
        service_area: draft.area.trim(),
        hours: draft.hours.trim(),
      });
      if (result.error) {
        failure = { part: "how people reach you", reason: result.error.message };
      } else {
        nextSaved = {
          ...nextSaved,
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          area: draft.area.trim(),
          hours: draft.hours.trim(),
        };
        savedParts.push("how people reach you");
      }
    }

    setSaved(nextSaved);
    if (newLogoPath) setPendingLogo(null);
    if (savedParts.length) void refreshClubBranding();

    if (failure) {
      setSave("idle");
      const kept = savedParts.length ? ` Already saved: ${joinParts(savedParts)}.` : "";
      setMessage(`${capitalize(failure.part)} could not be saved.${kept} Try again.`);
      return false;
    }
    setSave("done");
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setSave("idle"), DONE_MS);
    return true;
  }

  function goHome() {
    if (dirty && !busy) setLeaving(true);
    else router.push("/admin");
  }

  const previewLogo = pendingLogo?.url ?? logoUrl;
  const reachFilled = [draft.email, draft.phone].some((value) => value.trim() !== "");
  // The footer shows a page once its field holds a web address.
  const lit = SOCIAL_PLATFORMS.filter((platform) =>
    /^https?:\/\/\S+$/i.test(effectiveSocialHref(saved.social[platform.id], draft.social[platform.id])),
  );

  return (
    <div className={styles.page} data-admin-page="your-club">
      <TopBarTakeover>
        <div className={barStyles.editBar} data-testid="your-club-bar">
          <div className={barStyles.editBarLead}>
            <Link
              href="/admin"
              className={barStyles.back}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                goHome();
              }}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              Home
            </Link>
            <span className={barStyles.editBarRule} aria-hidden="true" />
            <IconBranding className={barStyles.editBarPencil} aria-hidden="true" />
            <p className={barStyles.editBarTitle}>Your club</p>
          </div>
          <div className={barStyles.editBarEnd}>
            {save !== "done" ? (
              <p className={barStyles.editBarStatus} role="status" aria-live="off" data-dirty={dirty || undefined} data-testid="your-club-status">
                {dirty ? (
                  <>
                    <span className={barStyles.editBarLong}>{plural(summary.count)} not saved yet</span>
                    <span className={barStyles.editBarShort}>Not saved yet</span>
                  </>
                ) : (
                  <span className={barStyles.editBarLong}>Nothing to save yet</span>
                )}
              </p>
            ) : null}
            <button
              type="button"
              className={barStyles.editBarSave}
              data-testid="your-club-save"
              data-state={save === "busy" ? "saving" : save === "done" ? "saved" : "idle"}
              disabled={!canSave || busy || (!dirty && save !== "done")}
              onClick={() => void saveAll()}
            >
              {busy ? (
                <>
                  <Spinner className="size-4" />
                  Saving…
                </>
              ) : save === "done" ? (
                <>
                  <IconSuccess className="size-4" aria-hidden="true" />
                  {savedText}
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </TopBarTakeover>

      <PageHead />

      <p className={styles.srOnly} role="status" aria-live="polite">
        {save === "done" ? savedText : ""}
      </p>
      {message ? (
        <p className={styles.alert} role="alert" data-testid="your-club-message">
          {message}
        </p>
      ) : null}
      {!canSave ? (
        <p className={styles.notice}>Changes to your website are paused right now, so changes can’t be saved.</p>
      ) : null}

      <div className={styles.body}>
        <fieldset className={styles.questions} disabled={!canSave || busy}>
          <section className={styles.card} aria-labelledby="yc-logo-h">
            <h2 id="yc-logo-h" className={styles.h}>
              Your logo
            </h2>
            <div className={styles.logoRow}>
              <span className={styles.logoTile} data-testid="your-club-logo">
                {previewLogo ? (
                  // A logo file the browser cannot load shows a quiet note, not a broken picture.
                  <ResilientNativeImage
                    src={previewLogo}
                    alt={`${clubName} logo`}
                    fallback={<span className={styles.noLogo}>Can’t show it</span>}
                  />
                ) : (
                  <span className={styles.noLogo}>No logo</span>
                )}
              </span>
              <span className={styles.logoText}>
                <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>
                  <IconUpload className="size-4" aria-hidden="true" />
                  {pendingLogo ? "Choose a different logo" : "Change logo"}
                </button>
                {pendingLogo ? <span className={styles.pending}>New logo, not saved yet</span> : null}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept={GRAPHIC_UPLOAD_ACCEPT}
                className={styles.hiddenInput}
                aria-label="Choose a logo file"
                data-testid="your-club-logo-input"
                onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)}
              />
            </div>
            <p className={styles.hint}>
              Shows in your menu, footer and browser tab. {GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB.
            </p>
            {errors.logo ? (
              <p className={styles.fieldError} role="alert">
                {errors.logo}
              </p>
            ) : null}
          </section>

          {shown.reach ? (
            <section className={styles.card} aria-labelledby="yc-reach-h">
              <h2 id="yc-reach-h" className={styles.h}>
                How can people reach you?
              </h2>
              <Field
                id="yc-email"
                label="Email"
                placeholder="name@yourclub.com"
                value={draft.email}
                error={errors.email}
                maxLength={YOUR_CLUB_LIMITS.email}
                inputMode="email"
                autoComplete="email"
                onChange={(value) => edit((current) => ({ ...current, email: value }), "email")}
              />
              <Field
                id="yc-phone"
                label="Phone"
                placeholder="(555) 555-0100"
                value={draft.phone}
                error={errors.phone}
                maxLength={YOUR_CLUB_LIMITS.phone}
                inputMode="tel"
                autoComplete="tel"
                onChange={(value) => edit((current) => ({ ...current, phone: value }), "phone")}
              />
              <Field
                id="yc-hours"
                label="Hours"
                placeholder="When you answer"
                value={draft.hours}
                error={errors.hours}
                maxLength={YOUR_CLUB_LIMITS.hours}
                counter={counterLabel(draft.hours, YOUR_CLUB_LIMITS.hours)}
                onChange={(value) => edit((current) => ({ ...current, hours: value }), "hours")}
              />
              <Field
                id="yc-area"
                label="Area"
                placeholder="City or region"
                value={draft.area}
                error={errors.area}
                maxLength={YOUR_CLUB_LIMITS.area}
                onChange={(value) => edit((current) => ({ ...current, area: value }), "area")}
              />
            </section>
          ) : null}

          <section className={styles.card} aria-labelledby="yc-social-h">
            <h2 id="yc-social-h" className={styles.h}>
              Your social pages
              <span className={styles.aside}>Blank hides it</span>
            </h2>
            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform.id} className={styles.socialRow}>
                <span
                  className={styles.mark}
                  data-on={draft.social[platform.id].trim() !== "" || undefined}
                  style={{ maskImage: `url(${platform.icon})`, WebkitMaskImage: `url(${platform.icon})` }}
                  aria-hidden="true"
                />
                <Field
                  id={`yc-social-${platform.id}`}
                  label={platform.label}
                  hideLabel
                  placeholder={platform.placeholder}
                  value={draft.social[platform.id]}
                  error={errors[platform.id]}
                  maxLength={YOUR_CLUB_LIMITS.socialHref}
                  inputMode="url"
                  autoComplete="off"
                  onChange={(value) =>
                    edit((current) => ({ ...current, social: { ...current.social, [platform.id]: value } }), platform.id)
                  }
                />
              </div>
            ))}
          </section>

          {shown.footerLine ? (
            <section className={styles.card} aria-labelledby="yc-line-h">
              <h2 id="yc-line-h" className={styles.h}>
                A line for your footer
              </h2>
              <Field
                id="yc-line"
                label="Footer line"
                hideLabel
                multiline
                value={draft.footerLine}
                error={errors.footerLine}
                maxLength={YOUR_CLUB_LIMITS.footerLine}
                counter={counterLabel(draft.footerLine, YOUR_CLUB_LIMITS.footerLine)}
                onChange={(value) => edit((current) => ({ ...current, footerLine: value }), "footerLine")}
              />
            </section>
          ) : null}
        </fieldset>

        <aside className={styles.preview} aria-label="How it looks on your website">
          <p className={styles.previewCap}>
            Your website footer
            <span className={styles.live} data-state={websiteState}>
              <span className={styles.liveDot} aria-hidden="true" />
              {websiteState === "live" ? "Live" : "Paused"}
            </span>
          </p>
          <div className={styles.footerCard} data-testid="your-club-footer-preview">
            <span className={styles.footerBrand}>
              {previewLogo ? (
                <ResilientNativeImage src={previewLogo} alt="" className={styles.footerCrest} hideOnError />
              ) : null}
              <span className={styles.footerName} title={clubName}>
                {clubName}
              </span>
            </span>
            {shown.footerLine ? (
              // A cleared line puts the template's standard wording back, as on the website.
              <span className={styles.footerLine}>{resolveFooterTagline(draft.footerLine)}</span>
            ) : null}
            {shown.reach && reachFilled ? (
              <span className={styles.footerRows}>
                {draft.email.trim() ? (
                  <span className={styles.row}>
                    <IconMail className="size-4 shrink-0" aria-hidden="true" />
                    <span>{draft.email.trim()}</span>
                  </span>
                ) : null}
                {draft.phone.trim() ? (
                  <span className={styles.row}>
                    <IconPhone className="size-4 shrink-0" aria-hidden="true" />
                    <span>{draft.phone.trim()}</span>
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className={styles.footerSocial} data-testid="your-club-footer-social">
              {lit.length ? (
                lit.map((platform) => (
                  <span
                    key={platform.id}
                    className={styles.footerMark}
                    data-platform={platform.id}
                    role="img"
                    aria-label={platform.label}
                    style={{ maskImage: `url(${platform.icon})`, WebkitMaskImage: `url(${platform.icon})` }}
                  />
                ))
              ) : (
                <span className={styles.footerNone}>No social pages</span>
              )}
            </span>
          </div>

          {shown.reach ? (
            <>
              <p className={styles.previewCap}>On your Contact page</p>
              <div className={styles.contactCard} data-testid="your-club-contact-preview">
                <ContactRow icon={<IconMail className="size-4 shrink-0" aria-hidden="true" />} value={draft.email} />
                <ContactRow icon={<IconPhone className="size-4 shrink-0" aria-hidden="true" />} value={draft.phone} />
                <ContactRow icon={<IconClock className="size-4 shrink-0" aria-hidden="true" />} value={draft.hours} />
                <ContactRow icon={<IconMapPin className="size-4 shrink-0" aria-hidden="true" />} value={draft.area} />
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {fitting ? <FitLogo file={fitting} onUse={keepLogo} onUseAsIs={() => keepLogo(fitting)} onCancel={cancelFit} /> : null}

      <AdminModal
        open={leaving}
        onClose={() => setLeaving(false)}
        className={styles.leaveDialog}
        backdropClassName={styles.fitBackdrop}
        aria-labelledby="yc-leave-title"
      >
        <h2 id="yc-leave-title" className={styles.fitTitle}>
          Save your changes first?
        </h2>
        <p className={styles.leaveText}>
          {summary.count === 1 ? "1 change is" : `${summary.count.toLocaleString("en-US")} changes are`} not saved yet.
        </p>
        <div className={styles.fitActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={async () => {
              const ok = await saveAll();
              setLeaving(false);
              if (ok) router.push("/admin");
            }}
          >
            Save and continue
          </button>
          <button type="button" className={styles.secondary} onClick={() => setLeaving(false)}>
            Keep editing
          </button>
          <button type="button" className={styles.secondary} onClick={() => router.push("/admin")}>
            Leave without saving
          </button>
        </div>
      </AdminModal>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinParts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  const text = value.trim();
  return (
    <span className={styles.row} data-empty={text === "" || undefined}>
      {icon}
      <span>{text || "Not set"}</span>
    </span>
  );
}

function Field({
  id,
  label,
  hideLabel,
  value,
  error,
  maxLength,
  counter,
  placeholder,
  inputMode,
  autoComplete,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  error?: string;
  maxLength: number;
  counter?: string;
  placeholder?: string;
  inputMode?: "email" | "tel" | "url";
  autoComplete?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    value,
    maxLength,
    placeholder,
    className: styles.input,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    "data-yc-invalid": error ? "true" : undefined,
  } as const;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? styles.srOnly : styles.label}>
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={2} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          {...shared}
          type="text"
          inputMode={inputMode}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {counter ? (
        <span className={styles.counter} data-near={value.length >= maxLength * 0.9 || undefined}>
          {counter}
        </span>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
