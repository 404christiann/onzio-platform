"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { useClubContext } from "@/components/ClubContextProvider";
import ContactPageCanvas, { type ContactCanvasTarget } from "@/components/admin/contact/ContactPageCanvas";
import { buildContactPagePayload, buildContactProfilePayload, emptyContactDraft, validateContactDraft, type ContactDraft, type ContactPageDraft, type ContactProfileDraft, type ContactValidationErrors } from "@/lib/contact-admin";
import { type ContactEditorSaveRequest, type ContactEditorSnapshot } from "@/lib/contact-page-editor/contract";
import type { ContactContent } from "@/lib/queries";
import "@/components/admin/contact/contact-editor.css";

const sections: { id: ContactCanvasTarget; label: string; summary: string }[] = [
  { id: "hero", label: "Page heading", summary: "The introduction at the top of Contact." },
  { id: "details", label: "Contact details", summary: "Ways for visitors to reach your club." },
  { id: "social", label: "Social links", summary: "The same links used across your website." },
];

function draftFromSnapshot(snapshot: ContactEditorSnapshot): ContactDraft {
  return {
    profile: {
      publicEmail: snapshot.profile?.public_email ?? "",
      publicPhone: snapshot.profile?.public_phone ?? "",
      serviceArea: snapshot.profile?.service_area ?? "",
      hours: snapshot.profile?.hours ?? "",
    },
    page: {
      eyebrow: snapshot.page?.eyebrow ?? "",
      headline: snapshot.page?.headline ?? "",
      intro: snapshot.page?.intro ?? "",
      heroMediaAssetId: snapshot.page?.hero_media_asset_id ?? null,
      heroMediaPreviewUrl: snapshot.heroMediaUrl ?? "",
    },
  };
}

function normalizedDraft(draft: ContactDraft): ContactDraft {
  return {
    profile: {
      publicEmail: draft.profile.publicEmail.trim(),
      publicPhone: draft.profile.publicPhone.trim(),
      serviceArea: draft.profile.serviceArea.trim(),
      hours: draft.profile.hours.trim(),
    },
    page: {
      ...draft.page,
      eyebrow: draft.page.eyebrow.trim(),
      headline: draft.page.headline.trim(),
      intro: draft.page.intro.trim(),
    },
  };
}

async function getSnapshot(operationId?: string): Promise<ContactEditorSnapshot> {
  const response = await fetch(`/api/admin/contact-editor${operationId ? `?operationId=${encodeURIComponent(operationId)}` : ""}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Unable to load contact content");
  return body as ContactEditorSnapshot;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="cep-field-error" role="alert">{message}</p> : null;
}

function ContactEditor() {
  const club = useClubContext();
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [baseline, setBaseline] = useState<ContactDraft>(emptyContactDraft);
  const [revision, setRevision] = useState("0");
  const [loaded, setLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasPage, setHasPage] = useState(false);
  const [socialLinks, setSocialLinks] = useState<ContactContent["socialLinks"]>([]);
  const [selected, setSelected] = useState<ContactCanvasTarget>("hero");
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const [deviceChoice, setDeviceChoice] = useState<"phone" | "desktop" | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<ContactValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ContactEditorSnapshot | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<ContactEditorSaveRequest | null>(null);
  const phone = deviceChoice === "phone" || (deviceChoice === null && narrow);
  const dirty = JSON.stringify(normalizedDraft(draft)) !== JSON.stringify(normalizedDraft(baseline));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getSnapshot();
      const next = draftFromSnapshot(snapshot);
      setDraft(next);
      setBaseline(next);
      setRevision(snapshot.revision);
      setHasProfile(Boolean(snapshot.profile)); setHasPage(Boolean(snapshot.page)); setLoaded(true);
      setSocialLinks(snapshot.socialLinks ?? []);
      setErrors({});
      setConflict(null);
      setUnconfirmed(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load contact content");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [club.id, load]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const dialog = sheetRef.current;
    if (!narrow || !sheetOpen || !dialog) return;
    // The native modal makes the rest of the admin shell inert, contains focus,
    // and restores focus to the guide/canvas trigger when it closes.
    dialog.showModal();
    const initialFocus = dialog.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), a")
      ?? dialog.querySelector<HTMLElement>("button");
    initialFocus?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [narrow, sheetOpen]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  function choose(section: ContactCanvasTarget) { setSelected(section); setSheetOpen(true); }
  function updateProfile<K extends keyof ContactProfileDraft>(field: K, value: ContactProfileDraft[K]) {
    setDraft((current) => ({ ...current, profile: { ...current.profile, [field]: value } }));
    setHasProfile(true); setErrors((current) => ({ ...current, [field]: undefined })); setSaved(false); setError(null);
  }
  function updatePage<K extends keyof ContactPageDraft>(field: K, value: ContactPageDraft[K]) {
    setDraft((current) => ({ ...current, page: { ...current.page, [field]: value } }));
    setHasPage(true); setErrors((current) => ({ ...current, [field]: undefined })); setSaved(false); setError(null);
  }

  function applyCommitted(snapshot: ContactEditorSnapshot) {
    const next = draftFromSnapshot({ ...snapshot, heroMediaUrl: draft.page.heroMediaPreviewUrl });
    setDraft(next); setBaseline(next); setRevision(snapshot.revision);
    setHasProfile(Boolean(snapshot.profile)); setHasPage(Boolean(snapshot.page));
    setConflict(null); setUnconfirmed(null); setErrors({}); setError(null); setSaved(true);
  }

  async function save() {
    if (saving || loading || conflict) return;
    const validation = validateContactDraft(draft);
    if (Object.keys(validation).length) {
      setErrors(validation); setError("Review the highlighted fields before saving.");
      choose(validation.publicEmail || validation.publicPhone || validation.serviceArea || validation.hours ? "details" : "hero");
      return;
    }
    const request: ContactEditorSaveRequest = unconfirmed ?? {
      operationId: crypto.randomUUID(), expectedRevision: revision,
      profile: buildContactProfilePayload(draft.profile) as ContactEditorSaveRequest["profile"],
      page: buildContactPagePayload(draft.page) as ContactEditorSaveRequest["page"],
    };
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch("/api/admin/contact-editor", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
      });
      const body = await response.json() as ContactEditorSnapshot & { error?: { code?: string; message?: string } };
      if (!response.ok) {
        // A server/database transport error can arrive after the transaction commits.
        // Reconcile its original operation before unlocking or creating another save.
        if (response.status >= 500 || body.error?.code === "DATABASE_OPERATION_FAILED") throw new Error("Save status unknown");
        setUnconfirmed(null);
        if (response.status === 409 && body.error?.code === "CONTACT_CHANGED") {
          try { setConflict(await getSnapshot()); setSheetOpen(false); }
          catch { setError("The page changed, but its latest version could not be loaded. Your draft is still here."); return; }
        }
        setError(body.error?.message ?? "Unable to save contact content");
        return;
      }
      applyCommitted(body);
    } catch {
      try {
        const check = await getSnapshot(request.operationId);
        if (check.operation?.status === "committed") applyCommitted(check.operation.receipt);
        else { setUnconfirmed(request); setError("Save did not finish. Retry the exact save to confirm it. Your draft is locked until then."); }
      } catch {
        setUnconfirmed(request);
        setError("Save status is unknown. Retry the exact save to confirm it. Your draft is locked until then.");
      }
    } finally { setSaving(false); }
  }

  const content: ContactContent = {
    profile: hasProfile ? { publicEmail: draft.profile.publicEmail.trim(), publicPhone: draft.profile.publicPhone.trim(), serviceArea: draft.profile.serviceArea.trim(), hours: draft.profile.hours.trim() } : null,
    page: hasPage ? { eyebrow: draft.page.eyebrow.trim(), headline: draft.page.headline.trim(), intro: draft.page.intro.trim(), heroMediaUrl: draft.page.heroMediaPreviewUrl } : null,
    socialLinks,
  };
  const current = sections.find((section) => section.id === selected)!;
  const canSave = !loading && !saving && !conflict && (dirty || Boolean(unconfirmed));
  const buttonLabel = saving ? "Saving…" : unconfirmed ? "Confirm save" : "Save page";

  const mobileSave = <div className="cep-mobile-save"><span>{dirty ? "Unsaved changes" : "All changes saved"}</span><button type="button" disabled={!canSave} onClick={() => void save()}>{buttonLabel}</button></div>;
  const inspectorContents = <>
          <div className="cep-inspector-head"><div><span className="cep-scope" data-shared={selected !== "hero"}>{selected === "hero" ? "Contact page only" : "Shared club data"}</span><h2 id="contact-section-title">{current.label}</h2></div><button type="button" onClick={() => setSheetOpen(false)}>Done</button></div>
          <div className="cep-inspector-body">
            {narrow && sheetOpen && error && <div role="alert" className="cep-error">{error}</div>}
            <p className="cep-help">{current.summary}</p>
            <fieldset disabled={saving || Boolean(unconfirmed)} className="cep-fields">
              {selected === "hero" && <>
                <div><label htmlFor="contact-eyebrow">Eyebrow</label><input id="contact-eyebrow" value={draft.page.eyebrow} maxLength={80} onChange={(event) => updatePage("eyebrow", event.target.value)} aria-invalid={Boolean(errors.eyebrow)} /><FieldError message={errors.eyebrow} /></div>
                <div><label htmlFor="contact-headline">Headline</label><input id="contact-headline" value={draft.page.headline} maxLength={80} onChange={(event) => updatePage("headline", event.target.value)} aria-invalid={Boolean(errors.headline)} /><FieldError message={errors.headline} /></div>
                <div><label htmlFor="contact-intro">Introduction</label><textarea id="contact-intro" rows={5} value={draft.page.intro} maxLength={320} onChange={(event) => updatePage("intro", event.target.value)} aria-invalid={Boolean(errors.intro)} /><FieldError message={errors.intro} /><small>{draft.page.intro.length}/320</small></div>
                <p className="cep-help"><strong>Hero image</strong><br />Your website design controls the hero image. The current image remains in place.</p>
              </>}
              {selected === "details" && <>
                <div><label htmlFor="contact-email">Public email</label><input id="contact-email" type="email" autoComplete="email" value={draft.profile.publicEmail} onChange={(event) => updateProfile("publicEmail", event.target.value)} aria-invalid={Boolean(errors.publicEmail)} /><FieldError message={errors.publicEmail} /></div>
                <div><label htmlFor="contact-phone">Public phone</label><input id="contact-phone" type="tel" autoComplete="tel" value={draft.profile.publicPhone} onChange={(event) => updateProfile("publicPhone", event.target.value)} aria-invalid={Boolean(errors.publicPhone)} /><FieldError message={errors.publicPhone} /></div>
                <div><label htmlFor="contact-area">Service area</label><input id="contact-area" value={draft.profile.serviceArea} maxLength={120} onChange={(event) => updateProfile("serviceArea", event.target.value)} aria-invalid={Boolean(errors.serviceArea)} /><FieldError message={errors.serviceArea} /></div>
                <div><label htmlFor="contact-hours">Hours</label><input id="contact-hours" value={draft.profile.hours} maxLength={200} onChange={(event) => updateProfile("hours", event.target.value)} aria-invalid={Boolean(errors.hours)} /><FieldError message={errors.hours} /></div>
              </>}
            </fieldset>
            {selected === "details" && <p className="cep-ownership">These are canonical club contact details. Changes also appear wherever your website uses them.</p>}
            {selected === "social" && <div className="cep-ownership"><strong>Social links are managed in Branding.</strong><br />The Contact page and footer use the same destinations.<br /><Link href="/admin/branding">Edit social links in Branding →</Link></div>}
          </div>
  </>;

  return <AdminPage className="cep-root">
    <AdminSaveFeedback saving={saving} saved={saved} savingLabel="Saving contact content…" successLabel="Contact content saved" />
    <AdminPageHeader eyebrow="Public website" title="Contact" description="Choose a section to edit. Your changes appear on the public page preview before you save." />
    {loading ? <p role="status">Loading contact content…</p> : !loaded ? <div role="alert" className="cep-error">{error || "Unable to load contact content"}<button type="button" onClick={() => void load()}>Try again</button></div> : <>
      {error && <div role="alert" className="cep-error">{error}</div>}
      {conflict && <div className="cep-error" role="region" aria-label="Review latest Contact page">
        <strong>Another editor saved this page.</strong> Your draft is still here. The latest saved headline is “{conflict.page?.headline || "Untitled"}” and its public email is {conflict.profile?.public_email || "blank"}.
        <button type="button" onClick={() => { setConflict(null); setRevision(conflict.revision); setError(null); }}>Keep my draft and save over latest</button>
        <button type="button" onClick={() => { if (window.confirm("Discard your Contact draft and load the latest saved page?")) void load(); }}>Discard draft and load latest</button>
      </div>}
      <div className="cep-layout">
        <nav className="cep-section-guide" aria-label="Contact page sections">
          <p>Section guide</p>
          {sections.map((section) => <button key={section.id} type="button" aria-pressed={selected === section.id} onClick={() => choose(section.id)}>{section.label}</button>)}
        </nav>
        <section className="cep-canvas" aria-label="Contact page canvas">
          <div className="cep-canvas-top"><span>Public Contact page {dirty ? "· Unsaved changes" : ""}</span>
            <div className="cep-device-toggle" role="group" aria-label="Preview device">
              <button type="button" aria-pressed={!phone} onClick={() => setDeviceChoice("desktop")}>Desktop</button>
              <button type="button" aria-pressed={phone} onClick={() => setDeviceChoice("phone")}>Phone</button>
            </div>
          </div>
          <ContactPageCanvas content={content} phone={phone} selected={selected} onSelect={choose} />
        </section>
        {narrow ? <dialog ref={sheetRef} className="cep-mobile-dialog" aria-labelledby="contact-section-title"
          onCancel={() => setSheetOpen(false)} onClose={() => setSheetOpen(false)}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]"))
              .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
            const first = controls[0]; const last = controls[controls.length - 1];
            if (!first || !last) { event.preventDefault(); return; }
            // Keep Tab within the sheet rather than allowing the browser chrome
            // to take focus after the final control in a native dialog.
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }}
          onClick={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
          <aside className="cep-inspector" data-open="true" aria-label={`${current.label} editor`}>
            {inspectorContents}
          </aside>
          {mobileSave}
        </dialog> : <aside className="cep-inspector" aria-label={`${current.label} editor`}>
          {inspectorContents}
        </aside>}
      </div>
      <div className="cep-savebar"><p>{dirty ? "Unsaved changes" : "All Contact changes saved"} · One Save updates this page and the shared contact details together.</p><button type="button" disabled={!canSave} onClick={() => void save()}>{buttonLabel}</button></div>
      {mobileSave}
    </>}
  </AdminPage>;
}

export default function AdminContactPage() {
  const club = useClubContext();
  if (club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1") {
    return <AdminPage><AdminPageHeader eyebrow="Public website" title="Contact" description="This website design does not publish a Contact page." /></AdminPage>;
  }
  return <ContactEditor />;
}
