import { newsArticleDate, newsCategory, type NewsEditorArticle } from "@/lib/cinematic-news";

type Props = {
  articles: NewsEditorArticle[]; timeZone: string; disabled: boolean;
  onEdit: (article: NewsEditorArticle) => void; onRemove: (article: NewsEditorArticle) => void; onRestore: (article: NewsEditorArticle) => void;
};

// Same 44px secondary action as the cinematic editor kit (CinematicEditorKit.module.css .action / .remove).
const BUTTON = "admin-press inline-flex min-h-11 items-center justify-center rounded-[9px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-55 disabled:hover:bg-background";

function Row({ article, timeZone, children }: { article: NewsEditorArticle; timeZone: string; children: React.ReactNode }) {
  const kind = newsCategory(article.content.category);
  return <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-foreground [overflow-wrap:anywhere]">{article.content.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: kind.color }} aria-hidden="true" />{kind.label}</span>
        <span>{newsArticleDate(article.publishedAt, timeZone)}</span>
        <a className="font-medium text-primary underline underline-offset-2 [overflow-wrap:anywhere]" href={`/news/${article.slug}`} target="_blank" rel="noreferrer">/news/{article.slug}</a>
      </p>
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </li>;
}

/** The News editor's article list: shown articles first, then removed ones. */
export default function NewsEditorList({ articles, timeZone, disabled, onEdit, onRemove, onRestore }: Props) {
  const shown = articles.filter(article => !article.removedAt);
  const removed = articles.filter(article => article.removedAt);
  return <div className="space-y-6">
    {shown.length === 0 ? <p className="text-sm text-muted-foreground">No articles yet.</p>
      : <ul className="space-y-3">{shown.map(article => <Row key={article.id} article={article} timeZone={timeZone}>
        <button type="button" className={BUTTON} aria-label={`Edit “${article.content.title}”`} disabled={disabled} onClick={() => onEdit(article)}>Edit</button>
        <button type="button" className={`${BUTTON} text-destructive`} aria-label={`Remove “${article.content.title}”`} disabled={disabled} onClick={() => onRemove(article)}>Remove</button>
      </Row>)}</ul>}
    {removed.length > 0 && <section>
      <h3 className="mb-1 text-[15px] font-semibold text-foreground">Removed from the site</h3>
      <p className="mb-3 text-sm text-muted-foreground">Visitors can’t see these. Restore one to show it again.</p>
      <ul className="space-y-3">{removed.map(article => <Row key={article.id} article={article} timeZone={timeZone}>
        <button type="button" className={BUTTON} aria-label={`Edit “${article.content.title}”`} disabled={disabled} onClick={() => onEdit(article)}>Edit</button>
        <button type="button" className={BUTTON} aria-label={`Restore “${article.content.title}”`} disabled={disabled} onClick={() => onRestore(article)}>Restore</button>
      </Row>)}</ul>
    </section>}
  </div>;
}
