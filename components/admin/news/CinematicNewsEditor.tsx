"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import FileUpload from "@/components/admin/FileUpload";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import NewsEditorList from "@/components/admin/news/NewsEditorList";
import { useClubContext } from "@/components/ClubContextProvider";
import { CinematicNewsArticle } from "@/components/cinematic/CinematicNews";
import CinematicShell from "@/components/cinematic/CinematicShell";
import NativeImage from "@/components/ResilientNativeImage";
import { Button } from "@/components/ui/button";
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

  async function cancel() {
    if (!editing || locked) return;
    if (dirty && !window.confirm("Discard your changes to this article?")) return;
    await discardUnsavedCover(editing.draft.coverAssetId, editing.article);
    setEditing(null); setProblems({}); setMessage(""); setFailed(false);
  }

  async function setRemoved(article: NewsEditorArticle, remove: boolean) {
    if (locked) return;
    if (remove && !window.confirm(`Remove “${article.content.title}” from the site? You can restore it later.`)) return;
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

  const field = (key: keyof NewsDraft, label: string, control: ReactNode, hint?: string) => <label className="block space-y-2">
    <span className="text-sm font-medium">{label}</span>{control}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    {problems[key] && <span className="block text-sm text-destructive" role="alert">{problems[key]}</span>}
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

  return <AdminPage className="pb-24">
    <AdminPageHeader title="News" description="Write the articles shown on your News page. Saving shows an article on the site right away." actions={<Link className="text-primary underline" href="/news" target="_blank">Open News page</Link>} />
    {message && <div className={failed ? "rounded-lg border border-destructive p-4 text-sm" : "rounded-lg border border-border p-4 text-sm"} role={failed ? "alert" : "status"}>{message}</div>}
    {!articles ? <AdminPanel><p role="status">{failed ? "News could not be loaded." : "Loading News…"}</p>{failed && <Button onClick={() => location.reload()}>Try again</Button>}</AdminPanel>
      : !editing || !draft ? <AdminPanel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Articles</h2><Button disabled={locked} onClick={() => open(null)}>Add article</Button></div>
        <NewsEditorList articles={articles} timeZone={timeZone} disabled={locked} onEdit={open} onRemove={article => void setRemoved(article, true)} onRestore={article => void setRemoved(article, false)} />
        {pending && <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={() => void send(pending, "Saved.")}>Retry the same save</Button><span className="text-sm text-muted-foreground">Waiting for the last save to be confirmed.</span></div>}
      </AdminPanel>
      : <>
        <AdminPanel>
          <h2 className="mb-1 text-lg font-semibold">{editing.article ? "Edit article" : "New article"}</h2>
          <p className="mb-5 text-sm text-muted-foreground">Web address: /news/{editing.article?.slug ?? (newsSlug(draft.title) || "…")}{editing.article ? "" : " (set when you first save; it doesn’t change later)"}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {field("category", "Category", <select className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.category} onChange={event => update({ category: event.target.value as NewsDraft["category"] })}>
              {NEWS_CATEGORIES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>, "Sets the colour band on the card and the dot on the article.")}
            {field("publishedLocal", "Date and time", <input type="datetime-local" className={ADMIN_INPUT_CLASS} disabled={locked} value={draft.publishedLocal} aria-invalid={!!problems.publishedLocal} onChange={event => update({ publishedLocal: event.target.value })} />, `Shown on the article. Club time (${timeZone}). Newest articles are listed first.`)}
            {text("cardHeading", "Card heading", NEWS_LIMITS.cardHeading, "Short heading above the card on the News page, like “Foothill Transit”.")}
            {text("title", "Title", NEWS_LIMITS.title)}
            <div className="md:col-span-2">{text("subtitle", "Subtitle (optional)", NEWS_LIMITS.subtitle)}</div>
          </div>
        </AdminPanel>
        <AdminPanel>
          <h2 className="mb-5 text-lg font-semibold">Cover photo</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              {draft.coverUrl ? <NativeImage src={draft.coverUrl} alt={draft.coverAlt || "Cover photo"} className="h-auto w-full rounded-lg border border-border" />
                : <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No photo yet. The website shows a dark box here.</p>}
              <FileUpload label={draft.coverAssetId ? "Replace photo" : "Upload photo"} accept="image/png,image/jpeg,image/webp" onUpload={files => void uploadCover(files)} uploading={uploading} />
              {draft.coverAssetId && <button type="button" disabled={locked} onClick={() => void removeCover()} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">Remove photo</button>}
            </div>
            {text("coverAlt", "Photo description", NEWS_LIMITS.coverAlt, "Describe the photo for people using screen readers.")}
          </div>
        </AdminPanel>
        <AdminPanel>
          <h2 className="mb-5 text-lg font-semibold">Article</h2>
          {field("body", "Article text", <textarea className={`${ADMIN_INPUT_CLASS} min-h-72`} disabled={locked} value={draft.body} aria-invalid={!!problems.body} onChange={event => update({ body: event.target.value })} />, `Put each paragraph on its own line. Up to ${NEWS_LIMITS.paragraphs} paragraphs.`)}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {text("actionLabel", "Button label (optional)", NEWS_LIMITS.actionLabel, "Shown under the article, like “Partner with us”.")}
            {text("actionHref", "Button link", NEWS_LIMITS.actionHref, "A page on this site, like /community/partnership, or a full https:// link. Leave both blank for no button.")}
          </div>
        </AdminPanel>
        {preview && <AdminPanel><details><summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">Preview this article</summary>
          <div className="my-4 flex gap-3"><Button variant={phone ? "default" : "outline"} onClick={() => setPhone(true)}>Phone</Button><Button variant={!phone ? "default" : "outline"} onClick={() => setPhone(false)}>Desktop</Button></div>
          <div className="overflow-auto rounded-lg border border-border" style={{ "--hp-viewport": "100dvh" } as CSSProperties}><div style={{ width: phone ? 390 : 1280 }}><HomepagePreviewFrame host={club.primaryDomain ?? club.slug} label="News article"><CinematicShell contentOnly initialContent={shared}><CinematicNewsArticle article={preview} timeZone={timeZone} /></CinematicShell></HomepagePreviewFrame></div></div>
        </details></AdminPanel>}
        <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4 shadow-lg">
          <Button disabled={busy || uploading || (!dirty && !pending && !!editing.article)} onClick={() => void save()}>{busy ? "Saving…" : pending ? "Retry the same save" : editing.article ? "Save article" : "Add to News"}</Button>
          <Button variant="outline" disabled={locked} onClick={() => void cancel()}>Cancel</Button>
          <span className="self-center text-sm text-muted-foreground">{uploading ? "Uploading photo…" : pending ? "Waiting for save confirmation" : dirty ? "Unsaved changes" : "No changes"}</span>
        </div>
      </>}
  </AdminPage>;
}
