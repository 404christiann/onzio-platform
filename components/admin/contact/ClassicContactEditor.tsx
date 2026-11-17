"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { PreviewToggle, type PreviewSize } from "@/components/admin/ui/PreviewToggle";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Button } from "@/components/ui/button";
import ContactPageCanvas, { type ContactCanvasTarget } from "./ContactPageCanvas";
import { buildContactPagePayload, buildContactProfilePayload, emptyContactDraft, validateContactDraft, type ContactDraft, type ContactValidationErrors } from "@/lib/contact-admin";
import type { ContactEditorSaveRequest, ContactEditorSnapshot } from "@/lib/contact-page-editor/contract";
import type { ContactContent } from "@/lib/queries";
import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";

const sections = { hero: "Page heading", details: "Contact details", social: "Social links" };

function fromSnapshot(snapshot: ContactEditorSnapshot): ContactDraft {
  return {
    profile: { publicEmail: snapshot.profile?.public_email ?? "", publicPhone: snapshot.profile?.public_phone ?? "", serviceArea: snapshot.profile?.service_area ?? "", hours: snapshot.profile?.hours ?? "" },
    page: { eyebrow: snapshot.page?.eyebrow ?? "", headline: snapshot.page?.headline ?? "", intro: snapshot.page?.intro ?? "", heroMediaAssetId: snapshot.page?.hero_media_asset_id ?? null, heroMediaPreviewUrl: snapshot.heroMediaUrl ?? "" },
  };
}

function identity(draft: ContactDraft) {
  return JSON.stringify({ profile: buildContactProfilePayload(draft.profile), page: buildContactPagePayload(draft.page) });
}

function validate(draft: ContactDraft): ContactValidationErrors {
  const errors = validateContactDraft(draft);
  if (!draft.page.headline.trim()) errors.headline = "Add a headline.";
  if (errors.publicEmail) errors.publicEmail = "Enter a valid email address.";
  if (errors.publicPhone) errors.publicPhone = "Enter a valid phone number.";
  return errors;
}

async function getSnapshot(operationId?: string): Promise<ContactEditorSnapshot> {
  const response = await fetch(`/api/admin/contact-editor${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Unable to load contact content");
  return body;
}

function asContent(draft: ContactDraft, socialLinks: ContactContent["socialLinks"]): ContactContent {
  return {
    profile: { publicEmail: draft.profile.publicEmail.trim(), publicPhone: draft.profile.publicPhone.trim(), serviceArea: draft.profile.serviceArea.trim(), hours: draft.profile.hours.trim() },
    page: { eyebrow: draft.page.eyebrow.trim(), headline: draft.page.headline.trim(), intro: draft.page.intro.trim(), heroMediaUrl: draft.page.heroMediaPreviewUrl },
    socialLinks,
  };
}

export default function ClassicContactEditor() {
  const club = useClubContext();
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const latest = useRef(draft);
  const epoch = useRef(0);
  const [baseline, setBaseline] = useState<ContactDraft>(emptyContactDraft);
  const baselineRef = useRef(baseline);
  const [revision, setRevision] = useState("0");
  const [socialLinks, setSocialLinks] = useState<ContactContent["socialLinks"]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingPromise = useRef<Promise<boolean> | null>(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<ContactValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactCanvasTarget | null>(null);
  const [device, setDevice] = useState<PreviewSize>("desktop");
  const [conflict, setConflict] = useState<ContactEditorSnapshot | null>(null);
  const [reviewConflict, setReviewConflict] = useState(false);
  const [discardConflict, setDiscardConflict] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<ContactEditorSaveRequest | null>(null);
  const attemptedDraft = useRef<ContactDraft | null>(null);
  const attemptedEpoch = useRef(0);
  const confirmedEpoch = useRef<number | null>(null);
  const pageActions = useRef<HTMLDivElement>(null);
  const fieldFocus = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const socialFocus = useRef<HTMLAnchorElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dirty = identity(draft) !== identity(baseline);
  const loadingView = useDelayedLoading(loading);

  function choose(section: ContactCanvasTarget) {
    const active = document.activeElement;
    opener.current = active instanceof HTMLIFrameElement ? active.contentDocument?.activeElement as HTMLElement : active as HTMLElement;
    setSelected(section);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const snapshot = await getSnapshot();
      const next = fromSnapshot(snapshot);
      latest.current = next;
      baselineRef.current = next;
      setDraft(next); setBaseline(next); setRevision(snapshot.revision);
      setSocialLinks(snapshot.socialLinks ?? []); setLoaded(true);
      setErrors({}); setConflict(null); setUnconfirmed(null); attemptedDraft.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load contact content"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [club.id, load]);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1900);
    return () => window.clearTimeout(timer);
  }, [saved]);

  function edit(next: ContactDraft) {
    epoch.current += 1;
    latest.current = next;
    setDraft(next); setSaved(false);
    if (Object.keys(errors).length) {
      const validation = validate(next);
      const remaining = Object.fromEntries(Object.keys(errors).filter((key) => validation[key as keyof ContactValidationErrors]).map((key) => [key, validation[key as keyof ContactValidationErrors]]));
      setErrors(remaining);
      if (!Object.keys(remaining).length) setError(null);
    } else setError(null);
  }

  function committed(snapshot: ContactEditorSnapshot, submitted: ContactDraft, submittedEpoch: number): boolean {
    const confirmed = fromSnapshot({ ...snapshot, heroMediaUrl: submitted.page.heroMediaPreviewUrl });
    baselineRef.current = confirmed;
    setBaseline(confirmed); setRevision(snapshot.revision);
    setConflict(null); setUnconfirmed(null); attemptedDraft.current = null;
    setErrors({}); setError(null);
    // Persistence may finish after another interaction. Keep the current draft,
    // and only let the navigation guard leave the submitted revision.
    const current = epoch.current === submittedEpoch && identity(latest.current) === identity(confirmed);
    confirmedEpoch.current = current ? submittedEpoch : null;
    return current;
  }

  async function performSave(): Promise<boolean> {
    if (loading || conflict) return false;
    if (!unconfirmed && identity(latest.current) === identity(baselineRef.current)) return true;
    const submitted = unconfirmed && attemptedDraft.current ? attemptedDraft.current : latest.current;
    const submittedEpoch = unconfirmed ? attemptedEpoch.current : epoch.current;
    if (!unconfirmed) {
      const validation = validate(submitted);
      if (Object.keys(validation).length) {
        setErrors(validation); setError("Review the highlighted fields before saving.");
        setSelected(validation.headline || validation.eyebrow || validation.intro ? "hero" : "details");
        return false;
      }
    }
    const request: ContactEditorSaveRequest = unconfirmed ?? {
      operationId: crypto.randomUUID(), expectedRevision: revision,
      profile: buildContactProfilePayload(submitted.profile) as ContactEditorSaveRequest["profile"],
      page: buildContactPagePayload(submitted.page) as ContactEditorSaveRequest["page"],
    };
    attemptedDraft.current = submitted; attemptedEpoch.current = submittedEpoch;
    confirmedEpoch.current = null;
    const started = performance.now();
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch("/api/admin/contact-editor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const body = await response.json() as ContactEditorSnapshot & { error?: { code?: string; message?: string } };
      if (!response.ok) {
        if (response.status >= 500 || body.error?.code === "DATABASE_OPERATION_FAILED") throw new Error("Save status unknown");
        setUnconfirmed(null);
        if (response.status === 409 && body.error?.code === "CONTACT_CHANGED") {
          try { setConflict(await getSnapshot()); setSelected(null); setReviewConflict(true); }
          catch { setError("The page changed, but its latest version could not be loaded. Your draft is still here."); return false; }
        }
        setError(body.error?.message ?? "Unable to save contact content");
        return false;
      }
      return committed(body, submitted, submittedEpoch);
    } catch {
      try {
        const check = await getSnapshot(request.operationId);
        if (check.operation?.status === "committed") return committed(check.operation.receipt, submitted, submittedEpoch);
        setUnconfirmed(request);
        setError("Save did not finish. Retry the exact save to confirm it. Your draft is locked until then.");
      } catch {
        setUnconfirmed(request);
        setError("Save status is unknown. Retry the exact save to confirm it. Your draft is locked until then.");
      }
      return false;
    } finally {
      const remaining = ADMIN_MOTION_DURATIONS.savingMinimum - (performance.now() - started);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      setSaved(confirmedEpoch.current === epoch.current && identity(latest.current) === identity(baselineRef.current));
      setSaving(false);
    }
  }

  function save(): Promise<boolean> {
    if (savingPromise.current) return savingPromise.current;
    const interaction = epoch.current;
    const operation = performSave().then((confirmed) => confirmed && interaction === epoch.current && identity(latest.current) === identity(baselineRef.current));
    savingPromise.current = operation;
    void operation.finally(() => { if (savingPromise.current === operation) savingPromise.current = null; });
    return operation;
  }

  const latestSaveAttempt = useRef(save);
  latestSaveAttempt.current = save;
  useUnsavedGuard({
    dirty: dirty || saving || Boolean(unconfirmed), edited: "your Contact page and shared club contact details", onSave: () => latestSaveAttempt.current(),
    onDiscard: () => {
      epoch.current += 1;
      latest.current = baselineRef.current;
      setDraft(baselineRef.current); setErrors({}); setError(null); setSelected(null);
    },
  });

  function field(group: "page" | "profile", name: keyof ContactDraft["page"] | keyof ContactDraft["profile"], label: string, maximum?: number, rows?: number, first?: boolean) {
    const value = (group === "page" ? draft.page[name as keyof ContactDraft["page"]] : draft.profile[name as keyof ContactDraft["profile"]]) ?? "";
    const issue = errors[name as keyof ContactValidationErrors];
    const id = `classic-contact-${name}`;
    const props = {
      id, value, maxLength: maximum, disabled: Boolean(unconfirmed), "aria-invalid": Boolean(issue), "aria-describedby": `${id}-help`,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => edit({ ...latest.current, [group]: { ...latest.current[group], [name]: event.target.value } }),
    };
    return <div className="cc-field" key={name}>
      <label htmlFor={id}>{label}{name === "headline" && <span className="sr-only"> (required)</span>}</label>
      {rows ? <textarea {...props} rows={rows} ref={first ? fieldFocus as React.RefObject<HTMLTextAreaElement> : undefined} /> : <input {...props} ref={first ? fieldFocus as React.RefObject<HTMLInputElement> : undefined} type={name === "publicEmail" ? "email" : name === "publicPhone" ? "tel" : "text"} autoComplete={name === "publicEmail" ? "email" : name === "publicPhone" ? "tel" : "off"} aria-required={name === "headline" || undefined} />}
      <div id={`${id}-help`} className="cc-field-help">{maximum && <span className="cc-counter">{value.length}/{maximum}</span>}{issue && <span role="alert" className="cc-field-error">{issue}</span>}</div>
    </div>;
  }

  const content = asContent(draft, socialLinks);
  const invalid = { hero: Boolean(errors.eyebrow || errors.headline || errors.intro), details: Boolean(errors.publicEmail || errors.publicPhone || errors.serviceArea || errors.hours), social: false };
  const preview = <ContactPageCanvas content={content} phone={device === "phone"} selected={selected} onSelect={choose} classic invalid={invalid} />;
  const state = saving ? "saving" : saved ? "saved" : !loading && !conflict && (dirty || unconfirmed) ? "dirty" : "clean";

  return <AdminPage className="cc-root">
    <AdminPageHeader eyebrow="Public website" title="Contact" description="Tap what you want to edit." actions={<div ref={pageActions}>{unconfirmed ? <div className="cc-confirm-actions"><span>Confirm the previous save before editing.</span><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Confirm save"}</Button></div> : <AdminSaveActions state={state} onSave={() => void save()} stackOnMobile />}</div>} />
    {error && <div role="alert" className="cc-error">{error}</div>}
    {conflict && <div className="cc-error" role="region" aria-label="Review latest Contact page"><p>Another editor saved this page. Your draft is still here.</p><Button variant="outline" onClick={() => setReviewConflict(true)}>Review latest version</Button><Button variant="outline" onClick={() => setDiscardConflict(true)}>Discard draft and load latest</Button></div>}
    <section className="cc-preview" aria-label="Contact page canvas">
      <div className="cc-preview-toolbar"><span>What visitors see</span><PreviewToggle value={device} onChange={setDevice} /></div>
      <div className="cc-loading-region" data-admin-loading-region="" data-phase={loadingView.phase} aria-busy={loadingView.phase !== "content"}>
        <div className="cc-preview-content" data-admin-content-layer="" data-visible={loadingView.showContent} inert={!loadingView.showContent} aria-hidden={!loadingView.showContent || undefined}>
          {loading || loaded ? preview : <div role="alert" className="cc-error">{error || "Unable to load contact content"}<Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
        </div>
        {loadingView.showSkeleton && <div className="cc-loading-layer" data-admin-skeleton-layer="" aria-hidden="true"><Shimmer className="cc-loading-shimmer" /></div>}
        <span className="sr-only" role="status">{loadingView.phase !== "content" ? "Loading Contact page" : "Contact page loaded"}</span>
      </div>
    </section>
    <AdminDialog open={selected !== null} onClose={() => setSelected(null)} title={selected ? sections[selected] : "Contact"} initialFocus={selected === "social" ? socialFocus : fieldFocus} finalFocus={() => opener.current?.isConnected ? opener.current : pageActions.current?.querySelector("button") ?? false} footer={<AdminDialogFooter primary={<Button type="button" onClick={() => setSelected(null)}>Done</Button>} status={dirty ? "Changes appear in your preview. Save when ready." : undefined} />}>
      <div className="cc-editor">
        <span className="cc-scope" data-shared={selected !== "hero"}>{selected === "hero" ? "Contact page only" : "Shared club data"}</span>
        {selected === "hero" && <>
          {field("page", "eyebrow", "Eyebrow", 80, undefined, true)}
          {field("page", "headline", "Headline", 80)}
          {field("page", "intro", "Introduction", 320, 5)}
          <p className="cc-note"><strong>Hero image.</strong> Your website design controls the hero image. The current image stays in place.</p>
        </>}
        {selected === "details" && <>
          <p className="cc-note">These are your club&apos;s contact details. Changes also appear wherever your website uses them.</p>
          <div className="cc-two">{field("profile", "publicEmail", "Public email", undefined, undefined, true)}{field("profile", "publicPhone", "Public phone")}</div>
          {field("profile", "serviceArea", "Service area", 120)}
          {field("profile", "hours", "Hours", 200, 2)}
        </>}
        {selected === "social" && <>
          <p className="cc-note"><strong>Social links are managed in Club settings.</strong> The Contact page and the website footer use the same links.</p>
          <div className="cc-social-chips">{socialLinks.length ? socialLinks.map((link) => <span key={link.id}>{link.label}</span>) : <p>No social links yet.</p>}</div>
          <Link ref={socialFocus} href="/admin/branding" className="cc-settings-link">Edit social links in Club settings</Link>
        </>}
        {unconfirmed && <p role="status" className="cc-note">Retry the exact save from the page to confirm it. Your draft is locked until then.</p>}
      </div>
    </AdminDialog>
    <AdminConfirmDialog open={reviewConflict} title="Another editor saved this page" onCancel={() => setReviewConflict(false)} cancelLabel="Keep reviewing" confirmLabel="Keep my draft and save over latest" onConfirm={() => { if (conflict) setRevision(conflict.revision); setConflict(null); setReviewConflict(false); setError(null); }}>
      <p>Your draft is still here. The latest saved headline is &quot;{conflict?.page?.headline || "Untitled"}&quot; and its public email is {conflict?.profile?.public_email || "blank"}.</p>
      <Button type="button" variant="outline" className="mt-4" onClick={() => { setReviewConflict(false); setDiscardConflict(true); }}>Discard draft and load latest</Button>
    </AdminConfirmDialog>
    <AdminConfirmDialog open={discardConflict} title="Discard your Contact draft?" confirmLabel="Discard draft and load latest" destructive onCancel={() => setDiscardConflict(false)} onConfirm={() => { setDiscardConflict(false); setReviewConflict(false); void load(); }}>Load the latest saved Contact page and shared club details. Your current changes will be discarded.</AdminConfirmDialog>
  </AdminPage>;
}
