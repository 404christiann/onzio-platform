import { newsArticleDate, newsCategory, type NewsEditorArticle } from "@/lib/cinematic-news";

type Props = {
  articles: NewsEditorArticle[]; timeZone: string; disabled: boolean;
  onEdit: (article: NewsEditorArticle) => void; onRemove: (article: NewsEditorArticle) => void; onRestore: (article: NewsEditorArticle) => void;
};

const BUTTON = "min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50";

function Row({ article, timeZone, children }: { article: NewsEditorArticle; timeZone: string; children: React.ReactNode }) {
  const kind = newsCategory(article.content.category);
  return <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{article.content.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: kind.color }} aria-hidden="true" />{kind.label}</span>
        <span>{newsArticleDate(article.publishedAt, timeZone)}</span>
        <a className="text-primary underline" href={`/news/${article.slug}`} target="_blank" rel="noreferrer">/news/{article.slug}</a>
      </p>
    </div>
    <div className="flex gap-2">{children}</div>
  </li>;
}

/** The News editor's article list: shown articles first, then removed ones. */
export default function NewsEditorList({ articles, timeZone, disabled, onEdit, onRemove, onRestore }: Props) {
  const shown = articles.filter(article => !article.removedAt);
  const removed = articles.filter(article => article.removedAt);
  return <div className="space-y-6">
    {shown.length === 0 ? <p className="text-sm text-muted-foreground">No articles yet.</p>
      : <ul className="space-y-3">{shown.map(article => <Row key={article.id} article={article} timeZone={timeZone}>
        <button type="button" className={BUTTON} disabled={disabled} onClick={() => onEdit(article)}>Edit</button>
        <button type="button" className={`${BUTTON} text-destructive`} disabled={disabled} onClick={() => onRemove(article)}>Remove</button>
      </Row>)}</ul>}
    {removed.length > 0 && <section>
      <h3 className="mb-1 text-base font-semibold">Removed from the site</h3>
      <p className="mb-3 text-sm text-muted-foreground">Visitors can’t see these. Restore one to show it again.</p>
      <ul className="space-y-3">{removed.map(article => <Row key={article.id} article={article} timeZone={timeZone}>
        <button type="button" className={BUTTON} disabled={disabled} onClick={() => onEdit(article)}>Edit</button>
        <button type="button" className={BUTTON} disabled={disabled} onClick={() => onRestore(article)}>Restore</button>
      </Row>)}</ul>
    </section>}
  </div>;
}
