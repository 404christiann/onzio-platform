/** RC2027-NEWS: Sam's News list and article pages for cinematic@2. */
import { z } from "zod";

/** Sam's legend, in his order and colours. `band` is the label on a card's colour band. */
export const NEWS_CATEGORIES = [
  { key: "sponsor-partner", label: "Sponsor/Partner", band: "Sponsor/Partner", color: "#fc1618" },
  { key: "partner", label: "Partner", band: "Partner", color: "#5361ff" },
  { key: "community", label: "Community", band: "RCFC in the Community", color: "#ffa924" },
  { key: "new-player", label: "New Player", band: "New Player", color: "#00adc6" },
  { key: "news", label: "News", band: "News", color: "#3ba84b" },
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["key"];
export const NEWS_CATEGORY_KEYS = NEWS_CATEGORIES.map(item => item.key) as [NewsCategory, ...NewsCategory[]];

export function newsCategory(key: NewsCategory) {
  return NEWS_CATEGORIES.find(item => item.key === key) ?? NEWS_CATEGORIES[4];
}

export const NEWS_LIMITS = { cardHeading: 40, title: 140, subtitle: 200, coverAlt: 200, paragraphs: 40, paragraph: 4000, actionLabel: 40, actionHref: 2000 } as const;

/** A button link: https on a public host, or a path on this site. */
export function isSafeNewsHref(value: string): boolean {
  if (value.trim() !== value || /[\s\\]/.test(value) || value.length > NEWS_LIMITS.actionHref) return false;
  if (/^\/(?!\/)[-A-Za-z0-9_/?#=&%.]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")
      && !/^(?:localhost|127\.|0\.)|\.localhost$/i.test(url.hostname);
  } catch { return false; }
}

const required = (max: number, message: string) => z.string().max(max).refine(value => value.trim() !== "", { message });
export const newsArticleContentSchema = z.object({
  category: z.enum(NEWS_CATEGORY_KEYS),
  cardHeading: required(NEWS_LIMITS.cardHeading, "Enter a card heading."),
  title: required(NEWS_LIMITS.title, "Enter a title."),
  subtitle: z.string().max(NEWS_LIMITS.subtitle),
  coverAlt: z.string().max(NEWS_LIMITS.coverAlt),
  paragraphs: z.array(required(NEWS_LIMITS.paragraph, "Remove the empty paragraph.")).min(1, "Write the article text.").max(NEWS_LIMITS.paragraphs),
  actionLabel: z.string().max(NEWS_LIMITS.actionLabel),
  actionHref: z.string().max(NEWS_LIMITS.actionHref),
}).strict().superRefine((value, context) => {
  if (!value.actionLabel.trim() !== !value.actionHref) context.addIssue({ code: "custom", path: [value.actionLabel.trim() ? "actionHref" : "actionLabel"], message: "A button needs both a label and a link." });
  if (value.actionHref && !isSafeNewsHref(value.actionHref)) context.addIssue({ code: "custom", path: ["actionHref"], message: "Use an https link or a page on this site, like /community/partnership." });
});
export type NewsArticleContent = z.infer<typeof newsArticleContentSchema>;

/** "Friday, Nov 20, 2026 at 12:00 PM" in the club's time zone. */
export function newsArticleDate(publishedAt: string, timeZone: string): string {
  const at = new Date(publishedAt);
  const day = at.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "short", day: "numeric", year: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

function zoneParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function zoneOffset(instant: number, timeZone: string) {
  const p = zoneParts(instant, timeZone);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(instant / 60000) * 60000;
}

/** The editor's "YYYY-MM-DDTHH:MM" in the club's time zone, as an ISO instant; null when invalid. */
export function newsLocalToInstant(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  let instant = wall - zoneOffset(wall, timeZone);
  instant = wall - zoneOffset(instant, timeZone);
  return new Date(instant).toISOString();
}

/** A stored instant as the editor's "YYYY-MM-DDTHH:MM" in the club's time zone. */
export function newsInstantToLocal(instant: string, timeZone: string): string {
  const p = zoneParts(new Date(instant).getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Article web addresses that belong to other News pages. */
export const RESERVED_NEWS_SLUGS = ["injury-report"] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isNewsSlug(value: string): boolean {
  return value.length <= 80 && SLUG_PATTERN.test(value) && !(RESERVED_NEWS_SLUGS as readonly string[]).includes(value);
}

/** The article's web address, made once from its first title. */
export function newsSlug(title: string): string {
  const words = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 80) break;
    slug = next;
  }
  if (!slug && words[0]) slug = words[0].slice(0, 80);
  return isNewsSlug(slug) ? slug : slug ? `${slug}-article` : "article";
}

/** Each line of the editor's article text is a paragraph; blank lines are ignored. */
export function splitNewsParagraphs(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function joinNewsParagraphs(paragraphs: readonly string[]): string {
  return paragraphs.join("\n\n");
}

/** Newest first; articles with the same date keep a stable order by id. */
export function newestNewsFirst<T extends { id: string; publishedAt: string }>(articles: readonly T[]): T[] {
  return [...articles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
}

const revision = z.string().regex(/^[0-9]{1,20}$/);
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/);
/** What the editor sends to the save route; the database re-checks every field. */
export const newsArticleSaveSchema = z.discriminatedUnion("action", [
  z.object({
    operationId: z.uuid(), action: z.literal("save"), articleId: z.uuid().nullable(), expectedRevision: revision,
    slug: z.string().max(80), publishedAt: instant, coverAssetId: z.uuid().nullable(), content: newsArticleContentSchema,
  }).strict(),
  z.object({ operationId: z.uuid(), action: z.enum(["remove", "restore"]), articleId: z.uuid(), expectedRevision: revision }).strict(),
]);
export type NewsArticleSave = z.infer<typeof newsArticleSaveSchema>;

export type NewsCover = { assetId: string; storage_bucket: string; storage_path: string; width: number; height: number };
/** One article as the editor sees it. */
export type NewsEditorArticle = {
  id: string; slug: string; revision: string; publishedAt: string; removedAt: string | null;
  cover: NewsCover | null; content: NewsArticleContent;
};
export type NewsSaveResult = { operationId: string; article: NewsEditorArticle };
export type NewsEditorSnapshot = {
  articles: NewsEditorArticle[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: NewsSaveResult };
};
