// RC2027-NEWS: Sam's News list ("Rose City FC News page 12 2027.jpg") and article
// ("Rose City FC News x Foothill Transit page 10 28 2027.jpg"). Approved preview: outer design-explorations/news-2027.
import Link from "next/link";
import NativeImage from "@/components/ResilientNativeImage";
import { NEWS_CATEGORIES, newsArticleDate, newsCategory } from "@/lib/cinematic-news";
import type { NewsPublicArticle } from "@/lib/cinematic-news-query";
import CinematicNewsPartners from "./CinematicNewsPartners";
import "./news.css";

function Cover({ article, className, alt }: { article: NewsPublicArticle; className?: string; alt: string }) {
  return article.cover
    ? <NativeImage className={className} src={article.cover.url} width={article.cover.width} height={article.cover.height} alt={alt} />
    : <span className={`${className ?? ""} news-cover-empty`} aria-hidden="true" />;
}

export function CinematicNewsList({ articles }: { articles: NewsPublicArticle[] }) {
  return <>
    <section className="cinematic-news">
      <header className="news-heading"><h1>RCFC News</h1><p>Stay up-to-date</p></header>
      <div className="news-body">
        <ul className="news-legend" aria-label="Categories">
          {NEWS_CATEGORIES.map(item => <li key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</li>)}
        </ul>
        {articles.length === 0 ? <p className="news-empty">News is coming soon.</p>
          : <ol className="news-list">{articles.map((article, index) => {
            const kind = newsCategory(article.content.category);
            return <li key={article.id} className="news-item">
              <h2>{article.content.cardHeading}</h2>
              <Link className="news-card" href={`/news/${article.slug}`} style={{ ["--news-color" as string]: kind.color }}>
                <span className="news-card-main">
                  <span className="news-card-title">{article.content.title}</span>
                  <Cover className="news-card-cover" article={article} alt="" />
                  <span className="news-card-number" aria-hidden="true">{index + 1}</span>
                </span>
                <span className="news-card-band"><span className="sr-only">Category: </span>{kind.band}</span>
              </Link>
            </li>;
          })}</ol>}
      </div>
    </section>
    <CinematicNewsPartners />
  </>;
}

export function CinematicNewsArticle({ article, timeZone }: { article: NewsPublicArticle; timeZone: string }) {
  const { content } = article;
  const kind = newsCategory(content.category);
  return <>
    <article className="cinematic-news-article">
      <header className="article-head">
        <p className="article-eyebrow">News</p>
        <h1>{content.title}</h1>
        {content.subtitle && <p className="article-subtitle">{content.subtitle}</p>}
      </header>
      <div className="article-cover"><Cover article={article} alt={content.coverAlt} /></div>
      <div className="article-body">
        <p className="article-category"><i style={{ background: kind.color }} aria-hidden="true" />{kind.label}</p>
        <p className="article-date"><time dateTime={article.publishedAt}>{newsArticleDate(article.publishedAt, timeZone)}</time></p>
        {content.paragraphs.map((text, index) => <p key={index} className="article-paragraph">{text}</p>)}
        {content.actionLabel && content.actionHref && <p className="article-action"><Link href={content.actionHref}>{content.actionLabel}</Link></p>}
      </div>
    </article>
    <CinematicNewsPartners />
  </>;
}
