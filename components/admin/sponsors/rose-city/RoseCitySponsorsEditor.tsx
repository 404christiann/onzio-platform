"use client";

import Link from "next/link";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCards, PreviewCardsSkeleton, ValidationMessage,
  derivePageSaveState, useEditorDialog, type PageSaveFailure,
} from "@/components/admin/ui/editor-kit";
import { DISCARD_CONFIRM } from "@/components/admin/editor-copy";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicSponsors from "@/components/cinematic/CinematicSponsors";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  confirmSponsorInserts,
  persistSponsorAttempt,
  type SponsorSaveAttempt,
} from "@/components/admin/sponsors/classic-sponsors-save";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSponsorList } from "@/lib/queries";
import { sponsorNameFromFile, type SponsorDraft } from "@/lib/sponsor-content";
import { deleteUnusedSponsorStorageUrls, uploadSponsorLogo } from "@/lib/sponsor-storage";
import {
  PLACES, PLACE_CAP, PLACE_NOUN, canAddTo, diffRoseCitySponsors, draftFingerprint, draftsFromRows, inPlace,
  listedCount, moveWithinPlace, MAX_LISTED_SPONSORS, placeCount, placesOverCap, applyReplace, rebaseDrafts, removeFromPlace, retiredFiles, unsavedReplacedFile,
  rowsFingerprint, websiteProblems, type Place,
} from "./rose-city-sponsors-model";
import { RoseCitySponsorFields, type SponsorFieldsApi } from "./RoseCitySponsorFields";
import { sponsorStampsByPlace } from "./sponsors-edit-targets";
import styles from "./RoseCitySponsorsEditor.module.css";

const NO_STAMPS: readonly never[] = [];

const PAGE = "Sponsors";
const CRUMBS = [{ label: "Website", href: "/admin/website-pages" as const }, { label: "Partners" }];
const DESCRIPTION = "Manage sponsor logos for the homepage carousel. Save applies all changes together.";
const TITLES: Record<Place, string> = { carousel: "Homepage carousel", footer: "Website footer" };

/** Natural width the public homepage strip is laid out at inside its preview box (its sizes follow the viewport). */
const PREVIEW = { width: 960, scale: 0.375 } as const;

function previewRows(drafts: readonly SponsorDraft[], place: Place): DBSiteSponsorLogo[] {
  return inPlace(drafts, place).map((draft, index) => ({
    id: draft.id ?? `draft-${draft.key}`,
    placement: place,
    name: draft.name.trim() || `Sponsor ${index + 1}`,
    logo_url: draft.logo_url,
    sort_order: index,
    show_on_homepage: draft.homepage,
    show_in_footer: draft.footer,
    website_url: null,
    created_at: "",
  }));
}

/** The real Rose City homepage sponsor strip (CinematicSponsors), fed the draft. */
const PlacePreview = memo(function PlacePreview({ place, drafts, shared }: { place: Place; drafts: readonly SponsorDraft[]; shared: CinematicHomepageContent | null }) {
  const sponsors = useMemo(() => previewRows(drafts, place), [drafts, place]);
  const urls = useMemo(() => sponsors.map((sponsor) => sponsor.logo_url), [sponsors]);
  const empty = <p className={styles.empty}>No logos in the {PLACE_NOUN[place]} yet.</p>;
  return (
      <SettledPreview urls={urls}>
        <div className={styles.previewFrame} data-admin-public-preview>
          {sponsors.length === 0 ? empty : (
            <CinematicShell contentOnly initialContent={shared}>
              <CinematicSponsors sponsors={sponsors} treatments={shared?.presentation.sponsorTreatments ?? {}} heading={shared?.sponsors.heading ?? "Powered by our partners"} />
            </CinematicShell>
          )}
        </div>
      </SettledPreview>
  );
});

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function RoseCitySponsorsEditor() {
  const club = useClubContext();
  const clubId = club.id;
  const [rows, setRows] = useState<DBSiteSponsorLogo[]>([]);
  const [drafts, setDrafts] = useState<SponsorDraft[]>([]);
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<PageSaveFailure | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmReload, setConfirmReload] = useState(false);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const attempt = useRef<SponsorSaveAttempt | null>(null);
  const ownedUploads = useRef(new Set<string>());
  const savingRef = useRef(false);
  const uploadingRef = useRef(false);
  const committed = useRef(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dialog = useEditorDialog<Place>();

  const baseDrafts = useMemo(() => draftsFromRows(rows), [rows]);
  const dirty = draftFingerprint(drafts) !== draftFingerprint(baseDrafts);
  const unsaved = dirty || pendingSave;
  // While a save is running, uploading, or an earlier save waits to be re-sent as it was, the page cannot be edited.
  const locked = saving || uploading || pendingSave;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const dirtyRef = useRef(unsaved);
  dirtyRef.current = unsaved;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    attempt.current = null;
    ownedUploads.current = new Set();
    setLoadedClubId(null); setRows([]); setDrafts([]); setShared(null); setLoadError("");
    setMessage(""); setValidation(""); setErrors({}); setFailure(null); setPendingSave(false);
    Promise.all([
      fetchSponsorList(clubId),
      fetchCinematicHomepageContent(clubId).catch(() => null),
    ]).then(([loaded, content]) => {
      if (!active) return;
      setRows(loaded); setDrafts(draftsFromRows(loaded)); setShared(content); setLoadedClubId(clubId);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Failed to load sponsor logos");
    });
    return () => { active = false; epoch.current += 1; };
  }, [clubId]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function edit(next: SponsorDraft[]) {
    if (locked) return;
    setDrafts(next);
    setMessage(""); setValidation(""); setErrors({});
    // A conflict stays until it is resolved; any other failure clears with the next edit.
    setFailure((current) => (current === "conflict" ? current : null));
  }

  async function discardOwnedUploads() {
    const urls = [...ownedUploads.current];
    await deleteUnusedSponsorStorageUrls(urls);
    urls.forEach((url) => ownedUploads.current.delete(url));
  }

  /** A logo uploaded on this visit and never saved has no row to keep it: its file goes now, as the classic page does. */
  async function dropUnsavedFile(url: string) {
    if (attempt.current?.logos.some((entry) => entry.logo_url === url)) return;
    try {
      await deleteUnusedSponsorStorageUrls([url]);
      ownedUploads.current.delete(url);
    } catch (error: unknown) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "Failed to remove uploaded file");
    }
  }

  function removeLogo(key: string) {
    if (locked) return;
    const draft = drafts.find((entry) => entry.key === key);
    if (!draft) return;
    const next = removeFromPlace(drafts, key);
    edit(next);
    if (draft.id === null && !next.some((entry) => entry.key === key)) void dropUnsavedFile(draft.logo_url);
  }

  async function addLogos(place: Place, files: FileList | null) {
    if (!files || files.length === 0 || locked || uploadingRef.current) return;
    const room = Math.max(0, Math.min(PLACE_CAP[place] - placeCount(drafts, place), MAX_LISTED_SPONSORS - listedCount(rows, drafts)));
    const selected = Array.from(files).slice(0, room);
    if (selected.length === 0) return;
    uploadingRef.current = true; setUploading(true); setMessage(""); setStatus("Adding your logos…");
    let current = draftsRef.current;
    try {
      for (const file of selected) {
        const url = await uploadSponsorLogo(file, place);
        ownedUploads.current.add(url);
        if (!mounted.current) { await deleteUnusedSponsorStorageUrls([url]); ownedUploads.current.delete(url); continue; }
        const logo: SponsorDraft = {
          key: crypto.randomUUID(), id: null, name: sponsorNameFromFile(file.name), logo_url: url, website: "",
          homepage: place === "carousel", footer: place === "footer",
        };
        current = [...current, logo];
        draftsRef.current = current;
        setDrafts(current);
        setFailure((value) => (value === "conflict" ? value : null));
      }
      if (mounted.current) setStatus(`Added ${plural(selected.length, "logo", "logos")}. Save to publish.`);
    } catch (error: unknown) {
      if (mounted.current) { setMessage(error instanceof Error ? error.message : "Upload failed"); setStatus(""); }
    } finally {
      uploadingRef.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function replaceLogo(key: string, file: File) {
    if (locked || uploadingRef.current) return;
    // Edits are locked while uploading, so the draft read now is the draft the upload lands on.
    const replaced = draftsRef.current.find((entry) => entry.key === key);
    if (!replaced) return;
    uploadingRef.current = true; setUploading(true); setMessage(""); setStatus("Replacing the logo…");
    try {
      const url = await uploadSponsorLogo(file, "carousel");
      ownedUploads.current.add(url);
      const next = mounted.current ? applyReplace(draftsRef.current, key, url, sponsorNameFromFile(file.name)) : null;
      if (!next) { await deleteUnusedSponsorStorageUrls([url]); ownedUploads.current.delete(url); return; }
      draftsRef.current = next;
      setDrafts(next);
      setFailure((value) => (value === "conflict" ? value : null));
      setStatus("Logo replaced. Save to publish.");
      const orphan = unsavedReplacedFile(replaced);
      if (orphan) await dropUnsavedFile(orphan);
    } catch (error: unknown) {
      if (mounted.current) { setMessage(error instanceof Error ? error.message : "Upload failed"); setStatus(""); }
    } finally {
      uploadingRef.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function persist() {
    if (savingRef.current || uploadingRef.current) throw new Error("Wait for the sponsor logos to finish uploading.");
    savingRef.current = true; setSaving(true); setMessage(""); setValidation(""); setErrors({}); setStatus("Saving sponsors…");
    committed.current = false;
    const generation = epoch.current;
    try {
      let current = attempt.current;
      if (!current) {
        const problems = websiteProblems(rows, drafts);
        if (problems.length) {
          setErrors(Object.fromEntries(problems.map((problem) => [problem.key, problem.message])));
          setValidation("Fix the highlighted websites, then save.");
          throw new Error("Invalid website");
        }
        const over = placesOverCap(drafts);
        if (over.length) {
          const place = over[0];
          setValidation(`The ${PLACE_NOUN[place]} can show ${PLACE_CAP[place]} sponsors. Remove ${plural(placeCount(drafts, place) - PLACE_CAP[place], "sponsor", "sponsors")} from it.`);
          throw new Error("Over the limit");
        }
        // The list can change somewhere else (another tab, another person). Check before writing, so a save never lands on a list it did not load.
        const latest = await fetchSponsorList(clubId);
        if (rowsFingerprint(latest) !== rowsFingerprint(rows)) {
          setFailure("conflict");
          setMessage("The sponsors list changed somewhere else since you opened this page.");
          throw new Error("Conflict");
        }
        const logos = drafts.map((draft) => ({ key: draft.key, id: draft.id, name: draft.name, logo_url: draft.logo_url }));
        const changes = diffRoseCitySponsors(rows, drafts);
        current = {
          placement: "carousel", version: 0, logos, originalIds: new Set(rows.map((row) => row.id)), changes,
          deleted: false, updates: 0, inserted: null, insertUncertain: false,
          retireUrls: retiredFiles(rows, changes), retired: false,
        };
        attempt.current = current;
      }
      const supabase = createClient();
      const fresh = await persistSponsorAttempt(current, {
        remove: (ids) => supabase.from("site_sponsor_logos").delete().in("id", ids),
        update: (id, changes) => supabase.from("site_sponsor_logos").update(changes).eq("id", id),
        insert: (inserts) => supabase.from("site_sponsor_logos").insert(inserts),
        read: () => fetchSponsorList(clubId),
        retire: deleteUnusedSponsorStorageUrls,
      });
      attempt.current = null;
      if (!mounted.current || generation !== epoch.current) return;
      setPendingSave(false); setFailure(null);
      setRows(fresh); setDrafts(draftsFromRows(fresh));
      committed.current = true;
      setStatus("Sponsors saved.");
    } catch (error: unknown) {
      if (mounted.current && generation === epoch.current) {
        const pending = attempt.current !== null;
        setPendingSave(pending);
        setFailure((value) => (value === "conflict" ? value : pending ? "retry" : "error"));
        const text = error instanceof Error ? error.message : "Save failed";
        if (!["Invalid website", "Over the limit", "Conflict"].includes(text)) setMessage(text);
        setStatus("");
      }
      throw error;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const saveAction = useSaveState({ isDirty: unsaved, onSave: persist });
  const latestSave = useRef(saveAction.save);
  latestSave.current = saveAction.save;
  /** Resolves true only when everything is saved (or there was nothing to save). */
  async function saveNow(): Promise<boolean> {
    if (loadedClubId !== clubId || uploadingRef.current || savingRef.current) return false;
    try { await latestSave.current(); } catch { return false; }
    return committed.current || !dirtyRef.current;
  }
  const latestSaveNow = useRef(saveNow);
  latestSaveNow.current = saveNow;

  /** The saved list again: unsaved edits and uploads go, as the classic page's discard does. */
  async function reload() {
    if (savingRef.current || uploadingRef.current) throw new Error("Wait for the current upload or save.");
    const pending = attempt.current;
    const latest = await fetchSponsorList(clubId);
    if (pending?.insertUncertain && !confirmSponsorInserts(pending, latest)) {
      throw new Error("The previous save has not been confirmed. Retry the same save first.");
    }
    await discardOwnedUploads();
    attempt.current = null;
    setPendingSave(false); setFailure(null); setMessage(""); setValidation(""); setErrors({});
    setRows(latest); setDrafts(draftsFromRows(latest));
  }
  const latestReload = useRef(reload);
  latestReload.current = reload;
  async function runReload() {
    try { await reload(); } catch (error: unknown) { setMessage(error instanceof Error ? error.message : "Unable to reload the saved page."); }
  }
  function requestDiscard() {
    if (saving || uploading) return;
    if (unsaved) setConfirmReload(true);
    else void runReload();
  }

  async function keepMyEdits() {
    if (saving || uploading) return;
    try {
      const latest = await fetchSponsorList(clubId);
      const rebased = rebaseDrafts(draftsRef.current, rows, latest);
      setDrafts(rebased.drafts);
      setRows(latest);
      setFailure(null); setValidation(""); setErrors({});
      setMessage(["Latest saved sponsors loaded. Your edits were kept.", ...rebased.notes].join(" "));
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Unable to load the latest sponsors.");
    }
  }

  useUnsavedGuard(loadedClubId === clubId ? {
    dirty: unsaved || uploading || saving,
    edited: "sponsor logos",
    onSave: () => latestSaveNow.current(),
    onDiscard: () => latestReload.current(),
  } : undefined);

  const loading = loadedClubId !== clubId;
  const deferred = useDeferredValue(drafts);
  // Click-to-field: the sponsors the preview draws (the deferred draft), matched to their logos by URL.
  // One line per sponsor (key, then logo URL), so typing a name does not rebuild the stamps and restart the preview's watcher.
  const carouselStrip = inPlace(deferred, "carousel").map((draft) => `${draft.key}\t${draft.logo_url}`).join("\n");
  const placeStamps = useMemo(() => sponsorStampsByPlace({
    carousel: carouselStrip ? carouselStrip.split("\n").map((line) => { const [key, logoUrl = ""] = line.split("\t"); return { key, logoUrl }; }) : [],
  }), [carouselStrip]);
  const pageState = uploading ? "saving" : derivePageSaveState(saveAction.state, failure);
  const changedPlaces = useMemo(() => new Set(PLACES.filter((place) =>
    JSON.stringify(inPlace(drafts, place)) !== JSON.stringify(inPlace(baseDrafts, place)))), [drafts, baseDrafts]);

  const api: SponsorFieldsApi = {
    drafts,
    locked,
    uploading,
    errors,
    canAdd: (place) => canAddTo(rows, drafts, place),
    setName: (key, name) => edit(drafts.map((draft) => (draft.key === key ? { ...draft, name } : draft))),
    setWebsite: (key, website) => edit(drafts.map((draft) => (draft.key === key ? { ...draft, website } : draft))),
    move: (key, place, delta) => edit(moveWithinPlace(drafts, key, place, delta)),
    remove: removeLogo,
    replace: (key, file) => void replaceLogo(key, file),
    add: (place, files) => void addLogos(place, files),
  };

  const sectionItems = PLACES.map((place) => ({ id: place, title: TITLES[place], changed: changedPlaces.has(place) }));
  const sections = PLACES.map((place) => ({ id: place, title: TITLES[place], summary: `${placeCount(drafts, place)} of ${PLACE_CAP[place]}` }));

  if (loadError) {
    return (
      <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
        <EditorNotice failed>{loadError}</EditorNotice>
        <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
      </PageFrame>
    );
  }

  const conflict = failure === "conflict";
  const notice = (message || validation || conflict) ? (
    <div className={styles.notice} data-sponsors-notice="">
      {validation && <ValidationMessage live="assertive">{validation}</ValidationMessage>}
      {(message || conflict) && (
        <EditorNotice failed={failure !== null || Boolean(message)}>
          {message}
          {conflict && (
            <span className={styles.noticeActions}>
              <button ref={keepRef} type="button" className="admin-press" disabled={locked} onClick={() => void keepMyEdits()}
                style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>
                Load latest and keep my edits
              </button>
              <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
            </span>
          )}
        </EditorNotice>
      )}
    </div>
  ) : null;

  return (
    <>
      <ShimmerRegion
        loading={loading}
        loadingLabel="Loading sponsor logos…"
        minHeight={480}
        skeleton={
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <PageFrameSkeleton cardCount={0} description />
            <Shimmer style={{ blockSize: 64, borderRadius: 14 }} />
            <PreviewCardsSkeleton count={PLACES.length} />
          </div>
        }
      >
        <PageFrame
          title={PAGE}
          breadcrumb={CRUMBS}
          openPageHref="/"
          description={DESCRIPTION}
          state={pageState}
          onSave={() => { void saveAction.save().catch(() => undefined); }}
          onConflict={() => keepRef.current?.focus()}
          onDiscard={requestDiscard}
          notice={notice}
        >
          <section className={styles.partners} aria-label="Partners pages" data-sponsors-partners-note="">
            <p>The Club Partners and Partnership Opportunities pages have their own partner list. They can reuse these logos.</p>
            <Link href="/admin/partners">Edit Partners pages</Link>
          </section>
          <PreviewCards
            sections={sectionItems}
            label="Sponsor places"
            renderPreview={(id) => <PlacePreview place={id as Place} drafts={deferred} shared={shared} />}
            previewWidth={PREVIEW.width}
            previewScale={PREVIEW.scale}
            stamps={(id) => placeStamps.get(id) ?? NO_STAMPS}
            onEdit={(id, event: MouseEvent<HTMLButtonElement>, target) => { dialog.openSection(id as Place, event); dialog.focusField(target); }}
          />
        </PageFrame>
      </ShimmerRegion>
      <p className={styles.srOnly} role="status" data-sponsors-status="">{status}</p>
      {!loading && (
        <EditorDialog
          open={dialog.open}
          onClose={dialog.close}
          title="Edit sponsors"
          returnFocusRef={dialog.returnFocusRef}
          focusRequest={dialog.focusRequest}
          sections={sections}
          activeId={dialog.activeId}
          onActiveChange={(id) => dialog.switchTo(id as Place)}
          renderSection={(id) => (dialog.open ? <RoseCitySponsorFields api={api} place={id as Place} /> : null)}
        />
      )}
      <AdminConfirmDialog
        open={confirmReload}
        title={DISCARD_CONFIRM.title}
        confirmLabel={DISCARD_CONFIRM.confirmLabel}
        destructive
        onCancel={() => setConfirmReload(false)}
        onConfirm={() => { setConfirmReload(false); void runReload(); }}
      >
        Discard unsaved sponsor edits and load the saved page?
      </AdminConfirmDialog>
    </>
  );
}
