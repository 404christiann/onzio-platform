"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { EditorLoading, EditorNotice, EditorPageLink, EditorPreview, EditorPrimaryButton, EditorRemoveButton, EditorSaveBar, EditorSecondaryButton, EditorSection, kit } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import NewsEditorList from "@/components/admin/news/NewsEditorList";
import { useClubContext } from "@/components/ClubContextProvider";
import { CinematicNewsArticle } from "@/components/cinematic/CinematicNews";
import CinematicShell from "@/components/cinematic/CinematicShell";
import NativeImage from "@/components/ResilientNativeImage";
import { createClient } from "@/lib/admin-client";
import { NEWS_CATEGORIES, NEWS_LIMITS, newsInstantToLocal, newsLocalToInstant, newsSlug, splitNewsParagraphs, type NewsArticleSave, type NewsEditorArticle } from "@/lib/cinematic-news";
import { emptyNewsDraft, loadNewsEditor, newsDraftFromArticle, newsSaveRequest, saveNewsArticle, type NewsDraft, type NewsDraftProblems } from "@/lib/cinematic-news-editor";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import "@/components/admin/homepage/homepage-editor.css";

type Editing = { article: NewsEditorArticle | null; draft: NewsDraft; original: string };

async function discardUnsavedCover(assetId: string | null, saved: NewsEditorArticle | null) {
  if (!assetId || saved?.cover?.assetId === assetId) return;
  await fetch("/api/admin/media/cleanup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) }).catch(() => undefined);
}

export default function CinematicNewsEditor() {
  const club = useClubContext();
  const [articles, setArticles] = useState<NewsEditorArticle[] | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [shared, setShared] = useState<CinematicHomepageContent | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problems, setProblems] = useState<NewsDraftProblems>({});
  const [pending, setPending] = useState<NewsArticleSave | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(true);
  const [confirming, setConfirming] = useState<{ kind: "cancel" } | { kind: "remove"; article: NewsEditorArticle } | null>(null);
  const uploadClub = useRef(club.id);
  const dirty = !!editing && JSON.stringify(editing.draft) !== editing.original;

  useEffect(() => {
    let active = true;
    uploadClub.current = club.id;
    setArticles(null); setEditing(null); setPending(null); setMessage(""); setFailed(false);
    if (club.presentationTemplateKey !== "cinematic@2") return;
    Promise.all([loadNewsEditor(), fetchClubIdentity(club.id), fetchCinematicHomepageContent(club.id)]).then(([loaded, identity, homepage]) => {
      if (!active) return;
      setArticles(loaded.articles); setTimeZone(identity?.timeZone || "UTC"); setShared(homepage);
    }).catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "Unable to load News."); setFailed(true); } });
    return () => { active = false; };
  }, [club.id, club.presentationTemplateKey]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  if (club.presentationTemplateKey !== "cinematic@2") return <AdminPage><AdminPageHeader title="News" description="This website design does not publish News." /></AdminPage>;
  const locked = busy || uploading || !!pending;

  const open = (article: NewsEditorArticle | null) => {
    const draft = article ? newsDraftFromArticle(article, timeZone) : emptyNewsDraft(newsInstantToLocal(new Date().toISOString(), timeZone));
    setEditing({ article, draft, original: JSON.stringify(draft) }); setProblems({}); setMessage(""); setFailed(false);
  };
  const update = (patch: Partial<NewsDraft>) => {
    setEditing(current => current && { ...current, draft: { ...current.draft, ...patch } });
    setProblems(current => { const next = { ...current }; for (const key of Object.keys(patch)) delete next[key as keyof NewsDraft]; return next; });
  };
  const replaceArticle = (article: NewsEditorArticle) => setArticles(current => {
    const others = (current ?? []).filter(item => item.id !== article.id);
    return [...others, article].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  });

  async function send(request: NewsArticleSave, done: string) {
    setPending(request); setBusy(true); setMessage("Saving…"); setFailed(false);
    const result = await saveNewsArticle(request);
    setBusy(false);
    if (result.status === "committed") {
      setPending(null); replaceArticle(result.result.article); setMessage(done);
      return result.result.article;
    }
    if (result.status === "uncertain") { setMessage(result.message); setFailed(true); return null; }
    setPending(null); setMessage(result.message); setFailed(true);
    return null;
  }

  async function save() {
    if (!editing || locked && !pending) return;
    let request = pending;
    if (!request) {
      const built = newsSaveRequest(editing.draft, editing.article, timeZone, crypto.randomUUID());
      if (!built.ok) { setProblems(built.problems); setMessage("Fix the highlighted fields before saving."); setFailed(true); return; }
      request = built.request;
    }
    const saved = await send(request, editing.article ? "Article saved." : "Article added to News.");
    if (saved) setEditing(null);
  }

  async function cancel(confirmed = false) {
    if (!editing || locked) return;
    if (dirty && !confirmed) { setConfirming({ kind: "cancel" }); return; }
    await discardUnsavedCover(editing.draft.coverAssetId, editing.article);
    setEditing(null); setProblems({}); setMessage(""); setFailed(false);
  }

  async function setRemoved(article: NewsEditorArticle, remove: boolean, confirmed = false) {
    if (locked) return;
    if (remove && !confirmed) { setConfirming({ kind: "remove", article }); return; }
    await send({ operationId: crypto.randomUUID(), action: remove ? "remove" : "restore", articleId: article.id, expectedRevision: article.revision },
      remove ? "Article removed from the site. Restore it any time." : "Article restored to the site.");
  }

  async function uploadCover(files: FileList | null) {
    if (!files?.[0] || !editing || locked) return;
    const file = files[0], clubId = club.id, previous = editing.draft.coverAssetId, saved = editing.article;
    setUploading(true); setMessage(""); setFailed(false);
    try {
      const client = createClient(), path = `covers/${crypto.randomUUID()}-${file.name}`;
      const result = await client.storage.from("news").upload(path, file);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not upload the photo.");
      const publicResult = client.storage.from("news").getPublicUrl(path);
      if (publicResult.error || !publicResult.data.publicUrl) throw new Error("Could not prepare the photo.");
      if (uploadClub.current !== clubId) return;
      update({ coverAssetId: result.data.assetId, coverUrl: publicResult.data.publicUrl });
      await discardUnsavedCover(previous, saved);
    } catch (error) { if (uploadClub.current === clubId) { setMessage(error instanceof Error ? error.message : "Could not upload the photo."); setFailed(true); } }
    finally { if (uploadClub.current === clubId) setUploading(false); }
  }

  async function removeCover() {
    if (!editing || locked) return;
    const previous = editing.draft.coverAssetId;
    update({ coverAssetId: null, coverUrl: "" });
    await discardUnsavedCover(previous, editing.article);
  }

  const field = (key: keyof NewsDraft, label: string, control: ReactNode, hint?: string) => <label className="block min-w-0">
    <span className={ADMIN_LABEL_CLASS}>{label}</span>{control}
    {hint && <span className={kit.hint}>{hint}</span>}
    {problems[key] && <span className={kit.error} role="alert">{problems[key]}</span>}
  </label>;
  const text = (key: "cardHeading" | "title" | "subtitle" | "coverAlt" | "actionLabel" | "actionHref", label: string, max: number, hint?: string) => editing &&
    field(key, label, <input className={ADMIN_INPUT_CLASS} disabled={locked} value={editing.draft[key]} maxLength={max} aria-invalid={!!problems[key]} onChange={event => update({ [key]: event.target.value })} />, hint);

  const draft = editing?.draft;
  const previewInstant = draft ? newsLocalToInstant(draft.publishedLocal, timeZone) : null;
  const preview = draft && {
    id: editing!.article?.id ?? "new", slug: editing!.article?.slug ?? newsSlug(draft.title), publishedAt: previewInstant ?? new Date().toISOString(),
    content: { category: draft.category, cardHeading: draft.cardHeading, title: draft.title || "Article title", subtitle: draft.subtitle, coverAlt: draft.coverAlt,
      paragraphs: splitNewsParagraphs(draft.body), actionLabel: draft.actionLabel, actionHref: draft.actionHref },
    cover: draft.coverUrl ? { url: draft.coverUrl, width: 2287, height: 1237 } : null,
  };

  return <AdminPage className={kit.page}>
    <AdminPageHeader eyebrow="Public website" title="News" description="Write the articles shown on your News page. Saving shows an article on the site right away." actions={<EditorPageLink href="/news">Open News page</EditorPageLink>} />
    {message && <EditorNotice failed={failed}>{message}</EditorNotice>}
    {!articles ? <EditorLoading label={failed ? "News could not be loaded." : "Loading News…"} failed={failed} onRetry={() => location.reload()} />
      : !editing || !draft ? <EditorSection title="Articles" aside={<EditorPrimaryButton disabled={locked} onClick={() => open(null)}>Add article</EditorPrimaryButton>}>
        <NewsEditorList articles={articles} timeZone={timeZone} disabled={locked} onEdit={open} onRemove={article => void setRemoved(article, true)} onRestore={article => void setRemoved(article, false)} />
        {pending && <div className={`${kit.toolbar} mt-5`}><EditorPrimaryButton onClick={() => void send(pending, "Saved.")}>Retry the same save</EditorPrimaryButton><span className={kit.note}>Waiting for the last save to be confirmed.</span></div>}
      </EditorSection>
      : <>
        <EditorSection title={editing.article ? "Edit article" : "New article"} description={`Web address: /news/${editing.article?.slug ?? (newsSlug(draft.title) || "…")}${editing.article ? "" : " (set when you first save; it doesn’t change later)"}`}>
          <div className="grid gap-5 md:grid-cols-2">
            {field("category", "Category", <select className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.category} onChange={event => update({ category: event.target.value as NewsDraft["category"] })}>
              {NEWS_CATEGORIES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>, "Sets the colour band on the card and the dot on the article.")}
            {field("publishedLocal", "Date and time", <input type="datetime-local" className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.publishedLocal} aria-invalid={!!problems.publishedLocal} onChange={event => update({ publishedLocal: event.target.value })} />, `Shown on the article. Club time (${timeZone}). Newest articles are listed first.`)}
            {text("cardHeading", "Card heading", NEWS_LIMITS.cardHeading, "Short heading above the card on the News page, like “Foothill Transit”.")}
            {text("title", "Title", NEWS_LIMITS.title)}
            <div className="md:col-span-2">{text("subtitle", "Subtitle (optional)", NEWS_LIMITS.subtitle)}</div>
          </div>
        </EditorSection>
        <EditorSection title="Cover photo">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid min-w-0 gap-3">
              <div className={kit.imagePreview} data-shape="wide">
                {draft.coverUrl ? <NativeImage src={draft.coverUrl} alt={draft.coverAlt || "Cover photo"} />
                  : <span className={kit.imageEmpty}>No photo yet. The website shows a dark box here.</span>}
              </div>
              <FileUpload label={draft.coverAssetId ? "Replace photo" : "Upload photo"} accept="image/png,image/jpeg,image/webp" onUpload={files => void uploadCover(files)} uploading={uploading} />
              {draft.coverAssetId && <div><EditorRemoveButton disabled={locked} onClick={() => void removeCover()}>Remove photo</EditorRemoveButton></div>}
            </div>
            {text("coverAlt", "Photo description", NEWS_LIMITS.coverAlt, "Describe the photo for people using screen readers.")}
          </div>
        </EditorSection>
        <EditorSection title="Article">
          {field("body", "Article text", <textarea className={`${ADMIN_INPUT_CLASS} min-h-72`} disabled={locked} value={draft.body} aria-invalid={!!problems.body} onChange={event => update({ body: event.target.value })} />, `Put each paragraph on its own line. Up to ${NEWS_LIMITS.paragraphs} paragraphs.`)}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {text("actionLabel", "Button label (optional)", NEWS_LIMITS.actionLabel, "Shown under the article, like “Partner with us”.")}
            {text("actionHref", "Button link", NEWS_LIMITS.actionHref, "A page on this site, like /community/partnership, or a full https:// link. Leave both blank for no button.")}
          </div>
        </EditorSection>
        {preview && <EditorPreview title="What visitors see · this article" phone={phone} onPhoneChange={setPhone}>
          <HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="News article"><CinematicShell contentOnly initialContent={shared}><CinematicNewsArticle article={preview} timeZone={timeZone} /></CinematicShell></HomepagePreviewFrame>
        </EditorPreview>}
        <EditorSaveBar state={busy ? "saving" : "dirty"} onSave={() => void save()}
          status={uploading ? "Uploading photo…" : pending ? "Waiting for save confirmation" : dirty ? "Unsaved changes" : ""}
          primary={<EditorPrimaryButton busy={busy} disabled={uploading || (!dirty && !pending && !!editing.article)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry the same save" : editing.article ? "Save article" : "Add to News"}</EditorPrimaryButton>}>
          <EditorSecondaryButton disabled={locked} onClick={() => void cancel()}>Cancel</EditorSecondaryButton>
        </EditorSaveBar>
      </>}
    <AdminConfirmDialog open={confirming?.kind === "cancel"} title="Discard your changes?" confirmLabel="Discard changes" cancelLabel="Keep editing" destructive onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); void cancel(true); }}>Your changes to this article will be discarded.</AdminConfirmDialog>
    <AdminConfirmDialog open={confirming?.kind === "remove"} title={`Remove “${confirming?.kind === "remove" ? confirming.article.content.title : ""}” from the site?`} confirmLabel="Remove article" destructive onCancel={() => setConfirming(null)} onConfirm={() => { const target = confirming?.kind === "remove" ? confirming.article : null; setConfirming(null); if (target) void setRemoved(target, true, true); }}>Visitors will no longer see this article. You can restore it later.</AdminConfirmDialog>
  </AdminPage>;
}
