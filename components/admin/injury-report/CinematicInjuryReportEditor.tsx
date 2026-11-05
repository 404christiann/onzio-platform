"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { z } from "zod";
import { ChevronDown, ChevronUp, X } from "@/components/admin/icons";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import NativeImage from "@/components/ResilientNativeImage";
import CinematicInjuryReport from "@/components/cinematic/CinematicInjuryReport";
import CinematicShell from "@/components/cinematic/CinematicShell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import {
  INJURY_REPORT_ROUTE, MAX_INJURY_ENTRIES, cinematicInjuryReportDraftSchema, cinematicInjuryReportSaveSchema, starterCinematicInjuryReportContent,
  type CinematicInjuryReportContent, type CinematicInjuryReportSave,
} from "@/lib/cinematic-injury-report-content";
import {
  addInjuryEntry, availablePlayers, injuryReportSaveRequest, loadCinematicInjuryReportEditor, moveInjuryEntry, removeInjuryEntry,
  retiredFromRoster, saveCinematicInjuryReportEditor, unusedInjuryUploads, type CinematicInjuryReportSnapshot, type InjuryMedia,
} from "@/lib/cinematic-injury-report-editor";
import { fetchInjuryPreviewRoster, injuryReportView, type InjuryAsset, type InjuryPlayerRow } from "@/lib/cinematic-injury-report-query";
import { mediaAssetUrl } from "@/lib/media-assets";
import { supabase } from "@/lib/supabase";
import "@/components/admin/homepage/homepage-editor.css";

const mediaSchema = z.object({ id: z.uuid(), storage_path: z.string(), width: z.number(), height: z.number(), kind: z.enum(["graphic", "photograph"]) });
const recoverySchema = z.object({
  content: cinematicInjuryReportDraftSchema,
  pending: cinematicInjuryReportSaveSchema.nullable(),
  uploads: z.array(z.uuid()),
  media: z.array(mediaSchema),
});
type Slot = "logo" | "band";
const UPLOADS: Record<Slot, { bucket: string; folder: string; accept: string; kind: InjuryMedia["kind"]; label: string }> = {
  logo: { bucket: "sponsors", folder: "injury-report-logo", accept: "image/png,image/webp", kind: "graphic", label: "logo" },
  band: { bucket: "news", folder: "injury-report-band", accept: "image/png,image/jpeg,image/webp", kind: "photograph", label: "photo" },
};

function mergeMedia(...lists: InjuryMedia[][]): InjuryMedia[] {
  const byId = new Map<string, InjuryMedia>();
  for (const item of lists.flat()) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}
const asAsset = (item: InjuryMedia): InjuryAsset => ({ id: item.id, storage_bucket: "onzio-media", storage_path: item.storage_path, width: item.width, height: item.height });
function mediaUrl(item: InjuryMedia | undefined): string {
  if (!item) return "";
  try { return mediaAssetUrl(asAsset(item)); } catch { return ""; }
}
async function retireUploads(ids: string[]) {
  await Promise.all(ids.map(assetId => fetch("/api/admin/media/cleanup", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
  }).catch(() => undefined)));
}

export default function CinematicInjuryReportEditor() {
  const club = useClubContext();
  const [snapshot, setSnapshot] = useState<CinematicInjuryReportSnapshot | null>(null);
  const [draft, setDraft] = useState<CinematicInjuryReportContent | null>(null);
  const [pending, setPending] = useState<CinematicInjuryReportSave | null>(null);
  const [media, setMedia] = useState<InjuryMedia[]>([]);
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [roster, setRoster] = useState<{ players: InjuryPlayerRow[]; assets: InjuryAsset[] }>({ players: [], assets: [] });
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(false);
  const recoveryKey = useRef<string | null>(null);
  const uploadSlot = useRef<Slot | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = !!snapshot && !!draft && JSON.stringify(snapshot.content ?? starterCinematicInjuryReportContent()) !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    setSnapshot(null); setDraft(null); setPending(null); setMedia([]); setUploads([]); setMessage(""); setFailed(false); setErrors({}); recoveryKey.current = null;
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadCinematicInjuryReportEditor(), createClient().auth.getUser(), fetchCinematicHomepageContent(club.id), fetchInjuryPreviewRoster(club.id, supabase)])
      .then(([loaded, user, homepage, players]) => {
        if (!active) return;
        if (!user.data.user) throw new Error("Sign in again to edit the Injury Report.");
        const key = `onzio:cinematic-injury-report:v1:${location.origin}:${user.data.user.id}:${club.id}`;
        recoveryKey.current = key;
        let saved: z.infer<typeof recoverySchema> | null = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = recoverySchema.safeParse(JSON.parse(raw));
            if (parsed.success) saved = parsed.data;
            else localStorage.removeItem(key);
          }
        } catch {}
        setSnapshot(loaded);
        setDraft(saved?.content ?? loaded.content ?? starterCinematicInjuryReportContent());
        setPending(saved?.pending ?? null);
        setUploads(saved?.uploads ?? []);
        setMedia(mergeMedia(loaded.media, saved?.media ?? []));
        setShared(homepage);
        setRoster(players);
        if (saved) setMessage(saved.pending ? "An earlier save needs confirmation. Retry the same save." : "Your unsaved Injury Report draft has been restored.");
      }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load the Injury Report."); setFailed(true); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!draft || !snapshot || !recoveryKey.current) return;
    try {
      if (dirty || pending || uploads.length) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending, uploads, media }));
      else localStorage.removeItem(recoveryKey.current);
    } catch {}
  }, [draft, snapshot, dirty, pending, uploads, media]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="Injury Report" description="The Injury Report is part of the cinematic website design and is unavailable for this design." /></AdminPage>;
  const locked = busy || !!pending || !!uploading;
  const players = snapshot?.players ?? [];
  const retired = draft ? new Set(retiredFromRoster(draft, players)) : new Set<string>();
  const update = (change: (value: CinematicInjuryReportContent) => CinematicInjuryReportContent | void) => {
    setDraft(current => { if (!current) return current; const next = structuredClone(current); return change(next) ?? next; });
    setMessage(""); setFailed(false); setErrors({});
  };
  const clearRecovery = () => { try { if (recoveryKey.current) localStorage.removeItem(recoveryKey.current); } catch {} };
  const byMedia = new Map(media.map(item => [item.id, item]));

  async function upload(slot: Slot, file: File) {
    if (!draft || locked) return;
    const config = UPLOADS[slot];
    setUploading(slot); setFailed(false); setMessage(`Adding the ${config.label}…`);
    try {
      const result = await createClient().storage.from(config.bucket).upload(`${config.folder}/${crypto.randomUUID()}`, file);
      if (result.error || !result.data?.assetId) throw new Error(result.error?.message ?? `The ${config.label} upload failed.`);
      const bitmap = await createImageBitmap(file);
      const item: InjuryMedia = { id: result.data.assetId, storage_path: result.data.path, width: bitmap.width, height: bitmap.height, kind: config.kind };
      setMedia(current => mergeMedia([item], current));
      setUploads(current => [...current, item.id]);
      update(content => { if (slot === "logo") content.presenterLogoAssetId = item.id; else content.bandAssetId = item.id; });
      setMessage(`${slot === "logo" ? "Logo" : "Photo"} added. Save to publish it.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `The ${config.label} upload failed.`); setFailed(true);
    } finally { setUploading(null); }
  }

  async function save() {
    if (!draft || !snapshot || busy || uploading) return;
    let request = pending;
    if (!request) {
      if (retired.size) { setMessage("Remove the entries for players who are no longer on the Roster before saving."); setFailed(true); return; }
      const result = injuryReportSaveRequest(draft, snapshot, crypto.randomUUID());
      if (!result.ok) { setErrors(result.errors); setMessage("Review the highlighted fields before saving."); setFailed(true); return; }
      request = result.request;
    }
    setPending(request); setBusy(true); setMessage("Saving the Injury Report…"); setFailed(false);
    try { if (recoveryKey.current) localStorage.setItem(recoveryKey.current, JSON.stringify({ content: draft, pending: request, uploads, media })); } catch {}
    const result = await saveCinematicInjuryReportEditor(request);
    setBusy(false);
    if (result.status === "committed") {
      const saved = result.snapshot.content ?? starterCinematicInjuryReportContent();
      await retireUploads(unusedInjuryUploads(uploads, saved));
      setSnapshot(result.snapshot); setDraft(saved); setPending(null); setUploads([]);
      setMedia(mergeMedia(result.snapshot.media));
      setMessage("Injury Report saved."); clearRecovery();
    } else if (result.status === "uncertain") {
      setPending(result.request); setMessage(result.message); setFailed(true);
    } else {
      setPending(null); setMessage(result.message); setFailed(true);
    }
  }

  async function reload() {
    if (locked) return;
    if ((dirty || uploads.length) && !window.confirm("Discard unsaved Injury Report edits and load the saved page?")) return;
    try {
      const loaded = await loadCinematicInjuryReportEditor();
      await retireUploads(unusedInjuryUploads(uploads, loaded.content ?? starterCinematicInjuryReportContent()));
      setSnapshot(loaded); setDraft(loaded.content ?? starterCinematicInjuryReportContent()); setMedia(loaded.media); setUploads([]);
      setMessage(""); setFailed(false); setErrors({}); clearRecovery();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reload the Injury Report."); setFailed(true); }
  }

  const fieldError = (path: string) => errors[path] && <span className="block text-xs text-destructive" role="alert">{errors[path]}</span>;
  const field = (path: string, label: string, control: ReactNode, hint?: string, wide = false) =>
    <label className={`block space-y-2${wide ? " md:col-span-2" : ""}`}><span className="text-sm font-medium">{label}</span>{control}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}{fieldError(path)}</label>;
  const input = (path: string, value: string, maximum: number, onChange: (value: string) => void) =>
    <input className={ADMIN_INPUT_CLASS} disabled={locked} value={value} maxLength={maximum} aria-invalid={!!errors[path]} onChange={event => onChange(event.target.value)} />;
  const mediaSlot = (slot: Slot, assetId: string | null, empty: string) => {
    const url = mediaUrl(assetId ? byMedia.get(assetId) : undefined);
    return <div className="space-y-3">
      <div className={`flex items-center justify-center rounded-md border border-border p-3 ${slot === "logo" ? "h-24 bg-white" : "aspect-[5/3] max-w-md bg-neutral-900"}`}>
        {url ? <NativeImage src={url} alt="" className={slot === "logo" ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover"} />
          : <span className={`text-center text-xs ${slot === "logo" ? "text-muted-foreground" : "text-neutral-300"}`}>{empty}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={locked} onClick={() => { uploadSlot.current = slot; if (fileInput.current) { fileInput.current.accept = UPLOADS[slot].accept; fileInput.current.click(); } }}>
          {uploading === slot ? "Uploading…" : assetId ? `Replace ${UPLOADS[slot].label}` : `Upload ${UPLOADS[slot].label}`}</Button>
        {assetId && <Button variant="outline" disabled={locked} onClick={() => update(content => { if (slot === "logo") content.presenterLogoAssetId = null; else content.bandAssetId = null; })}><X width="14" height="14" /> Remove</Button>}
      </div>
    </div>;
  };
  const preview = draft ? injuryReportView(draft, roster.players, [...roster.assets, ...media.map(asAsset)]) : null;

  return <AdminPage className="pb-24">
    <AdminPageHeader title="Injury Report" description="Edit the Injury Report page. Each injury card shows a Roster player's name, number, position and photo; edit those in Roster. Save applies all changes together."
      actions={<Link className="text-primary underline" href={INJURY_REPORT_ROUTE} target="_blank">Open Injury Report</Link>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!draft || !snapshot ? <AdminPanel><p role="status">Loading the Injury Report…</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel> : <>
      <AdminPanel>
        <h2 className="mb-1 text-lg font-semibold">Presented by</h2>
        <p className="mb-5 text-sm text-muted-foreground">Shown under the page heading. Until a logo is uploaded, the page shows the partner&apos;s name.</p>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {field("page.presenterName", "Partner name", input("page.presenterName", draft.page.presenterName, 60, value => update(content => { content.page.presenterName = value; })), "Also the logo's description for screen readers.")}
          <div className="space-y-2"><span className="text-sm font-medium">Partner logo</span>{mediaSlot("logo", draft.presenterLogoAssetId, "No logo yet. The page shows the partner's name.")}
            <span className="block text-xs text-muted-foreground">PNG or WebP, ideally with a transparent background.</span></div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Injuries</h2>
            <p className="text-sm text-muted-foreground">Shown in this order. Pick a player from the <Link className="text-primary underline" href="/admin/roster">Roster</Link>; each player can appear once.</p></div>
          <span className="text-sm text-muted-foreground">{draft.entries.length}/{MAX_INJURY_ENTRIES}</span>
        </div>
        {draft.entries.length === 0 && <p className="mb-4 text-sm text-muted-foreground">No injuries. The page shows “No current injuries”.</p>}
        <ol className="space-y-4">{draft.entries.map((entry, index) => {
          const options = availablePlayers(players, draft, entry.id);
          const gone = retired.has(entry.id);
          const name = players.find(player => player.id === entry.playerId)?.name ?? `entry ${index + 1}`;
          return <li key={entry.id} className={`grid gap-4 rounded-lg border p-4 md:grid-cols-2 ${gone ? "border-destructive" : "border-border"}`}>
            {gone ? <p className="text-sm text-destructive md:col-span-2" role="alert">This player is no longer on the active Roster. Remove this entry to save.</p>
              : field(`entries.${index}.playerId`, "Player", <select className={ADMIN_INPUT_CLASS} disabled={locked} value={entry.playerId} onChange={event => update(content => { content.entries[index].playerId = event.target.value; })}>
                {options.map(player => <option key={player.id} value={player.id}>#{player.number} {player.name} · {player.position}</option>)}
              </select>, undefined, true)}
            {field(`entries.${index}.injury`, "Injury", input(`entries.${index}.injury`, entry.injury, 80, value => update(content => { content.entries[index].injury = value; })), "For example: Hamstring strain.")}
            {field(`entries.${index}.timeline`, "Timeline", input(`entries.${index}.timeline`, entry.timeline, 40, value => update(content => { content.entries[index].timeline = value; })), "For example: 2–3 weeks, or Day-to-day.")}
            {field(`entries.${index}.note`, "Note (optional)", input(`entries.${index}.note`, entry.note, 200, value => update(content => { content.entries[index].note = value; })), "One short line, shown in italics.", true)}
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button variant="outline" disabled={locked || index === 0} aria-label={`Move ${name} up`} onClick={() => update(content => moveInjuryEntry(content, index, -1))}><ChevronUp width="16" height="16" /></Button>
              <Button variant="outline" disabled={locked || index === draft.entries.length - 1} aria-label={`Move ${name} down`} onClick={() => update(content => moveInjuryEntry(content, index, 1))}><ChevronDown width="16" height="16" /></Button>
              <Button variant="outline" disabled={locked} aria-label={`Remove ${name}`} onClick={() => update(content => removeInjuryEntry(content, index))}><X width="14" height="14" /> Remove</Button>
            </div>
          </li>;
        })}</ol>
        <Button className="mt-4" variant="outline" disabled={locked || draft.entries.length >= MAX_INJURY_ENTRIES || availablePlayers(players, draft, "").length === 0}
          onClick={() => update(content => addInjuryEntry(content, players))}>Add injury</Button>
        {players.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Add players in Roster first.</p>}
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-1 text-lg font-semibold">Photo, rehab quote and video</h2>
        <p className="mb-5 text-sm text-muted-foreground">Shown below the injuries.</p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><span className="text-sm font-medium">Photo band</span>{mediaSlot("band", draft.bandAssetId, "No photo. The page goes straight to the Rehab heading.")}</div>
          {field("page.bandAlt", "Photo description", input("page.bandAlt", draft.page.bandAlt, 200, value => update(content => { content.page.bandAlt = value; })), "Describe the photo for screen readers.", true)}
          {field("page.rehabHeading", "Rehab heading", input("page.rehabHeading", draft.page.rehabHeading, 80, value => update(content => { content.page.rehabHeading = value; })), undefined, true)}
          {field("page.quote", "Quote", <textarea className={`${ADMIN_INPUT_CLASS} min-h-28`} disabled={locked} maxLength={600} value={draft.page.quote} aria-invalid={!!errors["page.quote"]} onChange={event => update(content => { content.page.quote = event.target.value; })} />, "Leave blank to hide the quote.", true)}
          {field("page.quoteAttribution", "Quote by", input("page.quoteAttribution", draft.page.quoteAttribution, 120, value => update(content => { content.page.quoteAttribution = value; })))}
          {field("page.videoUrl", "YouTube link", input("page.videoUrl", draft.page.videoUrl, 200, value => update(content => { content.page.videoUrl = value; })), "Paste a YouTube video link. Leave blank to show “Coming soon”.")}
        </div>
      </AdminPanel>

      <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview current edits</summary>
        <div className="my-4 flex flex-wrap gap-3">
          <Button variant={!phone ? "default" : "outline"} onClick={() => setPhone(false)}>Desktop</Button>
          <Button variant={phone ? "default" : "outline"} onClick={() => setPhone(true)}>Phone</Button>
        </div>
        {preview && <div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: phone ? 390 : 1280 }}>
          <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="Injury Report"><CinematicShell contentOnly initialContent={shared}><CinematicInjuryReport report={preview} /></CinematicShell></HomepagePreviewFrame>
        </div></div>}
      </details></AdminPanel>

      <input ref={fileInput} type="file" className="hidden" onChange={event => {
        const file = event.target.files?.[0]; const slot = uploadSlot.current;
        event.target.value = "";
        if (file && slot) void upload(slot, file);
      }} />
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg">
        <Button disabled={busy || !!uploading || (!dirty && !pending)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry same save" : "Save Injury Report"}</Button>
        <Button variant="outline" disabled={locked} onClick={() => void reload()}>Reload saved page</Button>
        <span className="self-center text-sm text-muted-foreground">{pending ? "Awaiting save confirmation" : uploading ? "Uploading…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>
    </>}
  </AdminPage>;
}
