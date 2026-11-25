"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubTimeZone } from "@/components/ClubTimeZoneProvider";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { DISCARD_CONFIRM } from "@/components/admin/editor-copy";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import { IconAdd, IconSearch } from "@/components/admin/icons";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { adminImageRules, imageFileIssue } from "@/components/admin/ui/adminImageFiles";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import {
  EditorDialog, PageFrame, PageFrameSkeleton, PreviewCardsSkeleton, ValidationMessage, derivePageSaveState, useEditorDialog,
} from "@/components/admin/ui/editor-kit";
import { CinematicNewsArticle } from "@/components/cinematic/CinematicNews";
import CinematicShell from "@/components/cinematic/CinematicShell";
import type { NewsPublicArticle } from "@/lib/cinematic-news-query";
import { createClient } from "@/lib/admin-client";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { NEWS_CATEGORIES, newsCategory, newsInstantToLocal, newsLocalToInstant, type NewsEditorArticle } from "@/lib/cinematic-news";
import { loadNewsEditor, newsDraftFromArticle, saveNewsArticle, type NewsDraft, type NewsDraftProblems } from "@/lib/cinematic-news-editor";
import "@/components/admin/homepage/homepage-editor.css";
import { NewsArticleFields, type NewsFieldsApi } from "./NewsArticleFields";
import { NewsCards, NewsEmpty } from "./NewsCards";
import { newsOwnsTarget, newsSectionOf, newsStampsByCard } from "./news-edit-targets";
import {
  DEFAULT_NEWS_FILTER, NEWS_SECTIONS, landCover, changedEntries, dropOnClose, entryForArticle, entryForNew, entryTitle, filterNewsCards, newsCards,
  newsPageFailure, planPageSave, previewArticle, rebaseEntries, runSaveItems, savedPrefix, draftParagraphs, type NewsCardItem, type NewsEntry, type NewsFilter, type NewsSaveItem, type NewsSectionId, type NewsSendResult,
} from "./news-page";
import styles from "./NewsEditor.module.css";

const PAGE = "News";
const NO_STAMPS: readonly never[] = [];
const CRUMBS = [{ label: "Website" }, { label: "Pages", href: "/admin/website-pages" as const }];
const DESCRIPTION = "Write the articles shown on your News page. Saving shows an article on the site right away.";

type Confirm = { kind: "reload" } | { kind: "remove"; card: NewsCardItem } | { kind: "discard"; card: NewsCardItem } | null;

async function discardUnsavedCover(assetId: string | null, saved: NewsEditorArticle | null) {
  if (!assetId || saved?.cover?.assetId === assetId) return;
  await fetch("/api/admin/media/cleanup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) }).catch(() => undefined);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function CinematicNewsEditor() {
  const club = useClubContext();
  const [articles, setArticles] = useState<NewsEditorArticle[] | null>(null);
  const [entries, setEntries] = useState<Record<string, NewsEntry>>({});
  const timeZone = useClubTimeZone();
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, NewsDraftProblems>>({});
  const [pending, setPending] = useState<NewsSaveItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState<{ key: string; title: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [invalid, setInvalid] = useState<{ key: string; title: string } | null>(null);
  const [filter, setFilter] = useState<NewsFilter>(DEFAULT_NEWS_FILTER);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const epoch = useRef(0);
  const newCount = useRef(0);
  const uploadClub = useRef(club.id);
  const keepRef = useRef<HTMLButtonElement>(null);
  const lastShown = useRef<NewsEntry | null>(null);
  const entriesRef = useRef<Record<string, NewsEntry>>({});
  const dialog = useEditorDialog<NewsSectionId>();

  entriesRef.current = entries;
  const changed = useMemo(() => changedEntries(entries), [entries]);
  const locked = busy || uploading || !!pending;
  const unsaved = changed.length > 0 || !!pending;

  useEffect(() => {
    let active = true;
    epoch.current += 1;
    uploadClub.current = club.id;
    setArticles(null); setEntries({}); setProblems({}); setPending(null); setBusy(false); setUploading(false); setMessage(""); setFailed(false);
    setStatus(""); setConflict(null); setSaveFailed(false); setInvalid(null); setOpenKey(null); setLoadedClubId(null); setShared(null);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadNewsEditor(), fetchCinematicHomepageContent(club.id)]).then(([loaded, homepage]) => {
      if (!active) return;
      setArticles(loaded.articles); setShared(homepage); setLoadedClubId(club.id);
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load News."); setFailed(true); } });
    return () => { active = false; epoch.current += 1; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const cards = useMemo(() => (articles ? newsCards(articles, entries, timeZone) : []), [articles, entries, timeZone]);
  const visibleCards = useMemo(() => filterNewsCards(cards, filter), [cards, filter]);
  // Click-to-field: one stamps array per article card, rebuilt only when the set of article ids changes (never while typing).
  const cardKeys = cards.map(card => card.key).join("\n");
  const cardStamps = useMemo(() => newsStampsByCard(cardKeys ? cardKeys.split("\n") : []), [cardKeys]);

  const clearNotices = () => { setMessage(""); setFailed(false); setSaveFailed(false); setInvalid(null); };
  const replaceArticle = (article: NewsEditorArticle) => setArticles(current => [...(current ?? []).filter(item => item.id !== article.id), article]);
  const dropEntry = (key: string) => {
    setEntries(current => { const { [key]: _gone, ...rest } = current; return rest; });
    setProblems(current => { const { [key]: _gone, ...rest } = current; return rest; });
  };

  /** `target` is the field clicked in the card's preview: its section opens, not always Details, and the field is focused. */
  function open(card: NewsCardItem, event?: MouseEvent<HTMLElement>, target?: EditTargetId) {
    if (locked || !card.article && !entries[card.key]) return;
    if (card.article) setEntries(current => (current[card.key] ? current : { ...current, [card.key]: entryForArticle(card.article!, timeZone) }));
    setOpenKey(card.key);
    dialog.openSection(newsSectionOf(target) ?? "details", event);
    dialog.focusField(target);
  }
  function addArticle(event: MouseEvent<HTMLButtonElement>) {
    if (locked) return;
    newCount.current += 1;
    const key = `new-${newCount.current}`;
    setEntries(current => ({ ...current, [key]: entryForNew(key, newsInstantToLocal(new Date().toISOString(), timeZone)) }));
    clearNotices();
    setOpenKey(key);
    dialog.openSection("details", event);
  }
  /** Closing keeps edits. An article opened and left alone, or a new one left empty, drops out of the edited set. */
  function closeDialog() {
    dialog.close();
    const key = openKey;
    if (!key) return;
    const entry = entries[key];
    if (entry) lastShown.current = entry;
    if (dropOnClose(entry, uploading)) dropEntry(key);
  }

  const entry = openKey ? entries[openKey] ?? (lastShown.current?.key === openKey ? lastShown.current : null) : null;
  if (entry && openKey && entries[openKey]) lastShown.current = entries[openKey];

  function update(patch: Partial<NewsDraft>) {
    if (locked || !openKey) return;
    const key = openKey;
    setEntries(current => current[key] ? { ...current, [key]: { ...current[key], draft: { ...current[key].draft, ...patch } } } : current);
    setProblems(current => {
      if (!current[key]) return current;
      const next = { ...current[key] };
      for (const field of Object.keys(patch)) delete next[field as keyof NewsDraft];
      return { ...current, [key]: next };
    });
    setMessage(""); setFailed(false); setSaveFailed(false); setInvalid(null);
  }

  async function uploadCover(file: File) {
    if (!entry || locked) return;
    const clubId = club.id, previous = entry.draft.coverAssetId, saved = entry.article;
    setUploading(true); clearNotices(); setStatus("Adding your photo…");
    try {
      // The cover is a photo: refuse a wrong type, an oversize or an unreadable file here, with the reason, before it uploads.
      const issue = await imageFileIssue(file, adminImageRules("photo"));
      if (issue) throw new Error(issue);
      const client = createClient(), path = `covers/${crypto.randomUUID()}-${file.name}`;
      const result = await client.storage.from("news").upload(path, file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not upload the photo.");
      const publicResult = client.storage.from("news").getPublicUrl(path);
      if (publicResult.error || !publicResult.data.publicUrl) throw new Error("Could not prepare the photo.");
      if (uploadClub.current !== clubId) return;
      const key = entry.key, assetId = result.data.assetId;
      if (!entriesRef.current[key]) { await discardUnsavedCover(assetId, null); setStatus("The photo was not added because the article was closed."); return; }
      setEntries(current => landCover(current, key, assetId, publicResult.data.publicUrl).entries);
      setStatus("Photo ready. Save to use it.");
      await discardUnsavedCover(previous, saved);
    } catch (error) { if (uploadClub.current === clubId) { setMessage(error instanceof Error ? error.message : "Could not upload the photo."); setFailed(true); } }
    finally { if (uploadClub.current === clubId) setUploading(false); }
  }
  async function removeCover() {
    if (!entry || locked) return;
    const previous = entry.draft.coverAssetId;
    update({ coverAssetId: null, coverUrl: "" });
    await discardUnsavedCover(previous, entry.article);
  }

  /** Sends one request through the existing save call and receipt lookup. */
  async function sendItem(item: NewsSaveItem): Promise<NewsSendResult> {
    setPending(item);
    const result = await saveNewsArticle(item.request);
    return result.status === "committed" ? { status: "committed", article: result.result.article } : result;
  }
  function committed(item: NewsSaveItem, article: NewsEditorArticle) {
    replaceArticle(article);
    if (item.request.action === "save") dropEntry(item.key);
    else if (item.request.action === "remove") {
      // A removed article keeps no unsaved edits, however the remove was confirmed (first try or a retry).
      const edited = entriesRef.current[item.key];
      if (edited) { dropEntry(item.key); void discardUnsavedCover(edited.draft.coverAssetId, article); }
    }
    setPending(null);
  }
  /** Notices for the first request that did not commit. `item` stays pending only when the outcome is unknown. */
  function failedItem(item: NewsSaveItem, result: Exclude<NewsSendResult, { status: "committed" }>) {
    setFailed(true);
    if (result.status === "uncertain") { setMessage(`“${item.title}” could not be confirmed. Retry the same save: it won’t publish twice.`); return; }
    setPending(null);
    if (result.status === "conflict") { setConflict({ key: item.key, title: item.title }); setMessage(`“${item.title}” was changed elsewhere. Your edits are not lost.`); }
    else { setSaveFailed(true); setMessage(`“${item.title}”: ${result.message}`); }
  }

  /**
   * The page Save. Each edited article goes through the same save call and receipt it always had, one after
   * another; the first one that fails stops the run and is named. Articles already saved stay saved.
   */
  async function saveAll(): Promise<boolean> {
    if (busy || uploading || !articles) return false;
    const plan = planPageSave(pending, changed, cards.filter(card => card.article).map(card => card.key), timeZone, () => crypto.randomUUID());
    if (!plan.ok) {
      setProblems(current => ({ ...current, [plan.key]: plan.problems }));
      setInvalid({ key: plan.key, title: plan.title }); setSaveFailed(true);
      return false;
    }
    const items = plan.items;
    if (!items.length) return true;
    const generation = epoch.current;
    clearNotices(); setConflict(null); setBusy(true); setStatus(`Saving ${plural(items.length, "article", "articles")}…`);
    const run = await runSaveItems(items, async item => (generation === epoch.current ? sendItem(item) : { status: "uncertain", message: "" }),
      (item, article) => { if (generation === epoch.current) committed(item, article); });
    if (generation !== epoch.current) return false;
    setBusy(false);
    if (run.failure) {
      failedItem(run.failure.item, run.failure.result);
      const prefix = savedPrefix(run.done, run.total);
      if (prefix) setMessage(current => prefix + current);
      return false;
    }
    const only = items.length === 1 ? items[0] : null;
    const text = only?.request.action === "remove" ? "Article removed from the site. Restore it any time."
      : only?.request.action === "restore" ? "Article restored to the site."
      : only ? (only.request.action === "save" && only.request.articleId ? "Article saved." : "Article added to News.") : `${items.length} articles saved.`;
    setMessage(items.every(item => item.request.action === "save") ? "" : text); setStatus(text);
    return true;
  }

  async function setRemoved(card: NewsCardItem, remove: boolean, confirmed = false) {
    const article = card.article;
    if (locked || !article) return;
    if (remove && !confirmed) { setConfirm({ kind: "remove", card }); return; }
    const generation = epoch.current;
    clearNotices(); setConflict(null); setBusy(true);
    const item: NewsSaveItem = { key: article.id, title: card.title, request: { operationId: crypto.randomUUID(), action: remove ? "remove" : "restore", articleId: article.id, expectedRevision: article.revision } };
    const result = await sendItem(item);
    if (generation !== epoch.current) return;
    setBusy(false);
    if (result.status !== "committed") { failedItem(item, result); return; }
    committed(item, result.article);
    const text = remove ? "Article removed from the site. Restore it any time." : "Article restored to the site.";
    setMessage(text); setStatus(text);
  }

  async function discardEntry(card: NewsCardItem) {
    if (locked) return;
    const target = entries[card.key];
    if (!target) return;
    dropEntry(card.key);
    await discardUnsavedCover(target.draft.coverAssetId, target.article);
  }

  /** Discard asks first when there are unsaved edits (the same decision the old editor's confirm made). */
  function requestDiscard() {
    if (busy || uploading) return;
    if (pending) { setFailed(true); setMessage("Retry the same save before discarding your edits, so nothing is lost."); return; }
    if (changed.length) setConfirm({ kind: "reload" });
    else void reload();
  }
  async function reload(keepEdits = false) {
    if (locked) return;
    const generation = epoch.current;
    setBusy(true);
    try {
      const loaded = await loadNewsEditor();
      if (generation !== epoch.current) return;
      if (keepEdits) {
        setArticles(loaded.articles);
        setEntries(current => rebaseEntries(current, loaded.articles, timeZone));
        setMessage("Latest articles loaded. Your edits were kept."); setFailed(false);
      } else {
        const covers = changed.map(item => discardUnsavedCover(item.draft.coverAssetId, item.article));
        setArticles(loaded.articles); setEntries({}); setProblems({}); setMessage(""); setFailed(false);
        await Promise.all(covers);
      }
      setConflict(null); setSaveFailed(false); setInvalid(null);
    } catch (error) { if (generation === epoch.current) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to reload News."); } }
    finally { if (generation === epoch.current) setBusy(false); }
  }

  const saveAction = useSaveState({
    isDirty: unsaved,
    onSave: async () => { if (!(await saveAll())) throw new Error("News was not saved."); },
  });
  const latestSave = useRef(saveAll);
  latestSave.current = saveAll;
  useUnsavedGuard(articles ? {
    dirty: unsaved, edited: PAGE, onSave: () => latestSave.current(),
    onDiscard: () => {
      if (busy || uploading || pending) throw new Error("A save is still being confirmed.");
      for (const item of changed) void discardUnsavedCover(item.draft.coverAssetId, item.article);
      setEntries({}); setProblems({}); clearNotices(); setConflict(null);
    },
  } : undefined);

  const pageState = derivePageSaveState(saveAction.state, newsPageFailure({ pending: !!pending, conflict: !!conflict, saveFailed }));
  const loading = !articles || loadedClubId !== club.id;
  const live = (articles ?? []).filter(article => !article.removedAt).length;
  const removed = (articles ?? []).length - live;

  if (club.presentationTemplateKey !== "cinematic@2") return <PageFrame title={PAGE} breadcrumb={CRUMBS} description="This website design does not publish News.">{null}</PageFrame>;

  const notice = (message || invalid || conflict) ? <div className={styles.notice} data-news-notice="">
    {invalid && <ValidationMessage live="assertive" title={`“${invalid.title}” needs a few fixes before saving.`}>
      Fix the highlighted fields, then press Save again. Nothing was sent.
      <span className={styles.noticeActions}>
        <button type="button" className="admin-press" onClick={event => { const card = cards.find(item => item.key === invalid.key); if (card) open(card, event); }}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>Open “{invalid.title}”</button>
      </span>
    </ValidationMessage>}
    {(message || conflict) && <EditorNotice failed={failed || !!conflict}>{message}
      {conflict && <span className={styles.noticeActions}>
        <button ref={keepRef} type="button" className="admin-press" disabled={locked} onClick={() => void reload(true)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>Load latest and keep my edits</button>
        <EditorSecondaryButton disabled={locked} onClick={requestDiscard}>Reload saved page</EditorSecondaryButton>
      </span>}
    </EditorNotice>}
  </div> : null;

  if (!articles && failed) return <PageFrame title={PAGE} breadcrumb={CRUMBS} description={DESCRIPTION}>
    <EditorNotice failed>{message}</EditorNotice>
    <div><EditorSecondaryButton disabled={false} onClick={() => location.reload()}>Try again</EditorSecondaryButton></div>
  </PageFrame>;

  const draft = entry?.draft;
  const fieldsApi: NewsFieldsApi | null = entry && draft ? {
    articleKey: entry.key, draft, slug: entry.article?.slug ?? null, timeZone, problems: problems[entry.key] ?? {}, locked, uploading,
    update, upload: file => void uploadCover(file), removeCover: () => void removeCover(),
  } : null;
  const previewInstant = draft ? newsLocalToInstant(draft.publishedLocal, timeZone) : null;
  const dialogTitle = !entry ? "Edit article" : entry.article ? `Edit “${entryTitle(entry)}”` : "New article";

  return <>
    <ShimmerRegion loading={loading} loadingLabel="Loading News…" minHeight={480}
      skeleton={<div><PageFrameSkeleton cardCount={0} description /><PreviewCardsSkeleton count={6} /></div>}>
      <PageFrame title={PAGE} breadcrumb={CRUMBS} openPageHref="/news" description={DESCRIPTION} state={pageState}
        onSave={() => { void saveAction.save().catch(() => undefined); }}
        onConflict={() => keepRef.current?.focus()} onDiscard={requestDiscard} notice={notice}>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <span className={styles.searchIcon}><IconSearch size={18} aria-hidden="true" /></span>
            <input type="search" className={ADMIN_INPUT_CLASS} placeholder="Search articles" aria-label="Search articles" value={filter.query} onChange={event => setFilter({ ...filter, query: event.target.value })} />
          </div>
          <span className={styles.showRemoved}>
            <span aria-hidden="true">Show removed</span>
            <AdminSwitch label="Show removed articles" checked={filter.showRemoved} onCheckedChange={showRemoved => setFilter({ ...filter, showRemoved })} />
          </span>
          <button type="button" className={`admin-press ${styles.add}`} disabled={locked} onClick={addArticle} data-add-article=""><IconAdd size={16} aria-hidden="true" />Add article</button>
        </div>
        <div className={styles.chips} role="group" aria-label="Category">
          {[{ key: "all" as const, label: "All", color: "" }, ...NEWS_CATEGORIES].map(item => <button key={item.key} type="button" className={`admin-press ${styles.chip}`} aria-pressed={filter.category === item.key}
            onClick={() => setFilter({ ...filter, category: item.key })}>{item.color && <i style={{ background: item.color }} aria-hidden="true" />}{item.label}</button>)}
        </div>
        <p className={styles.countLine}><b>{live} on the site</b>{removed ? ` · ${removed} removed` : ""} · newest first</p>
        {visibleCards.length
          ? <NewsCards cards={visibleCards} shared={shared} timeZone={timeZone} locked={locked} onEdit={(card, event, target) => open(card, event, target)}
            stamps={key => cardStamps.get(key) ?? NO_STAMPS} ownsTarget={newsOwnsTarget}
            onRemove={card => void setRemoved(card, true)} onRestore={card => void setRemoved(card, false)}
            onDiscard={card => setConfirm({ kind: "discard", card })} />
          : <NewsEmpty hasArticles={cards.length > 0} />}
      </PageFrame>
    </ShimmerRegion>
    <p className={styles.srOnly} role="status" data-news-status="">{status}</p>
    <EditorDialog open={dialog.open} onClose={closeDialog} title={dialogTitle} mode="split" returnFocusRef={dialog.returnFocusRef} focusRequest={dialog.focusRequest}
      footerNote="Edits stay on the page until you press Save. Saving shows the article on the site right away."
      previewHint="The article as visitors see it"
      sections={NEWS_SECTIONS.map(section => ({
        id: section.id, title: section.title,
        summary: !draft ? undefined : section.id === "details" ? `${newsCategory(draft.category).label}${draft.cardHeading ? ` · ${draft.cardHeading}` : ""}`
          : section.id === "photo" ? (draft.coverUrl ? "Photo added" : "No photo yet") : plural(draftParagraphs(draft).length, "paragraph", "paragraphs"),
      }))}
      activeId={dialog.activeId} onActiveChange={id => dialog.switchTo(id as NewsSectionId)}
      renderSection={id => dialog.open && fieldsApi ? <NewsArticleFields api={fieldsApi} id={id as NewsSectionId} /> : null}
      renderPreview={() => dialog.open && entry && draft ? <div className={styles.livePreview}>
        <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="News article">
          <CinematicShell contentOnly initialContent={shared}>
            <CinematicNewsArticle timeZone={timeZone} article={previewArticle({ key: entry.key, draft, publishedAt: previewInstant ?? new Date().toISOString() }, entry.article?.slug ?? "preview") as NewsPublicArticle} />
          </CinematicShell>
        </HomepagePreviewFrame></div> : null} />
    <AdminConfirmDialog open={confirm?.kind === "reload"} title={DISCARD_CONFIRM.title} confirmLabel={DISCARD_CONFIRM.confirmLabel} destructive
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void reload(); }}>
      Discard unsaved News edits and load the saved page?
    </AdminConfirmDialog>
    <AdminConfirmDialog open={confirm?.kind === "discard"} title="Discard your changes?" confirmLabel="Discard changes" cancelLabel="Keep editing" destructive
      onCancel={() => setConfirm(null)} onConfirm={() => { const card = confirm?.kind === "discard" ? confirm.card : null; setConfirm(null); if (card) void discardEntry(card); }}>
      Your changes to this article will be discarded.
    </AdminConfirmDialog>
    <AdminConfirmDialog open={confirm?.kind === "remove"} title={`Remove “${confirm?.kind === "remove" ? confirm.card.title : ""}” from the site?`} confirmLabel="Remove article" cancelLabel="Keep article" destructive
      onCancel={() => setConfirm(null)} onConfirm={() => { const card = confirm?.kind === "remove" ? confirm.card : null; setConfirm(null); if (card) void setRemoved(card, true, true); }}>
      Visitors will no longer see this article and its web address stops working. You can restore it later.{confirm?.kind === "remove" && confirm.card.changed ? " Your unsaved edits to it will be discarded." : ""}
    </AdminConfirmDialog>
  </>;
}
