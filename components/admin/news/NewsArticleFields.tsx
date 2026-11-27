"use client";

import { useId, type ReactNode } from "react";
import { EditorImage } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { mediaAccept, mediaHint } from "@/lib/media-rules";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import { NEWS_CATEGORIES, NEWS_LIMITS, newsSlug } from "@/lib/cinematic-news";
import type { NewsDraft, NewsDraftProblems } from "@/lib/cinematic-news-editor";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import { draftParagraphs, overlongParagraph, type NewsSectionId } from "./news-page";
import { newsTarget, type NewsField } from "./news-edit-targets";
import styles from "./NewsEditor.module.css";
import { LINK_DESTINATION_HINT } from "@/lib/link-destination";

export type NewsFieldsApi = {
  /** The article's id (a saved article's uuid, `new-N` for an unsaved one): the row every control's edit target is keyed by. */
  articleKey: string;
  draft: NewsDraft;
  slug: string | null;
  timeZone: string;
  problems: NewsDraftProblems;
  locked: boolean;
  uploading: boolean;
  update: (patch: Partial<NewsDraft>) => void;
  upload: (file: File) => void;
  removeCover: () => void;
};

type FieldProps = {
  label: string; value: string; max?: number; disabled: boolean; hint?: ReactNode; error?: string;
  multiline?: boolean; rows?: number; target?: EditTargetId; type?: "text" | "url" | "datetime-local"; extra?: ReactNode; onChange: (value: string) => void;
};

/** A labelled input or textarea with its hint, its error (linked and announced) and a character count. */
function Field({ label, value, max, disabled, hint, error, multiline, rows, type = "text", extra, target, onChange }: FieldProps) {
  const id = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null, max ? `${id}-count` : null, extra ? `${id}-extra` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, disabled, value, maxLength: max, "aria-invalid": error ? true : undefined, "aria-describedby": described, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
  return <div className={styles.field} {...editTargetProps(target)}>
    <label htmlFor={id} className={ADMIN_LABEL_CLASS}>{label}</label>
    {multiline ? <textarea className={`${ADMIN_INPUT_CLASS} ${styles.textarea}`} rows={rows} {...common} />
      : <input className={ADMIN_INPUT_CLASS} type={type} {...common} />}
    {hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
    {max ? <span id={`${id}-count`} className={styles.count} data-full={value.length >= max || undefined}>{value.length} of {max}</span> : null}
    {extra && <span id={`${id}-extra`} className={styles.hint} role="status">{extra}</span>}
    {error && <span id={`${id}-error`} className={styles.error} role="alert">{error}</span>}
  </div>;
}

function CategoryField({ api }: { api: NewsFieldsApi }) {
  const legend = useId();
  const name = useId();
  return <fieldset className={styles.category} disabled={api.locked} aria-describedby={`${legend}-hint`}>
    <legend className={ADMIN_LABEL_CLASS}>Category</legend>
    <div className={styles.categories}>
      {NEWS_CATEGORIES.map(item => <label key={item.key} className={styles.categoryOption} {...editTargetProps(api.draft.category === item.key ? newsTarget(api.articleKey, "category") : null)}>
        <input type="radio" name={name} value={item.key} checked={api.draft.category === item.key} onChange={() => api.update({ category: item.key })} />
        <span className={styles.categoryLook}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>
      </label>)}
    </div>
    <span id={`${legend}-hint`} className={styles.hint}>Sets the colour band on the card and the dot on the article.</span>
  </fieldset>;
}

/** The fields of one dialog section. Every field edits the same NewsDraft key the old editor did. */
export function NewsArticleFields({ api, id }: { api: NewsFieldsApi; id: NewsSectionId }) {
  const { draft, problems, locked, update } = api;
  const at = (field: NewsField) => newsTarget(api.articleKey, field);
  const text = (key: "cardHeading" | "title" | "subtitle" | "coverAlt" | "actionLabel" | "actionHref", label: string, max: number, hint?: string, type?: FieldProps["type"]) =>
    <Field label={label} value={draft[key]} max={max} disabled={locked} hint={hint} error={problems[key]} type={type} target={at(key)} onChange={value => update({ [key]: value })} />;

  if (id === "details") {
    const address = api.slug ? `/news/${api.slug}` : `/news/${newsSlug(draft.title) || "…"}`;
    return <div className={styles.fields}>
      <p className={styles.note}>Web address: <code>{address}</code>{api.slug ? "" : " (set when you first save; it doesn’t change later)"}</p>
      <CategoryField api={api} />
      <div className={styles.row}>
        {text("cardHeading", "Card heading", NEWS_LIMITS.cardHeading, "Short heading above the card on the News page, like “Foothill Transit”.")}
        <Field label="Date and time" type="datetime-local" target={at("publishedLocal")} value={draft.publishedLocal} disabled={locked} error={problems.publishedLocal} onChange={value => update({ publishedLocal: value })}
          hint={`Shown on the article. Club time (${api.timeZone}). Newest articles are listed first.`} />
      </div>
      {text("title", "Title", NEWS_LIMITS.title)}
      {text("subtitle", "Subtitle (optional)", NEWS_LIMITS.subtitle)}
    </div>;
  }
  if (id === "photo") return <div className={styles.fields}>
    <div {...editTargetProps(at("cover"))}><EditorImage label="Cover photo" noun="photo" url={draft.coverUrl} alt={draft.coverAlt || "Cover photo"} accept={mediaAccept("photo")} hint={mediaHint("photo")} shape="wide"
      empty="No photo yet. The website shows a dark box here." uploading={api.uploading} disabled={locked || api.uploading} hasImage={!!draft.coverAssetId}
      onFile={api.upload} onRemove={draft.coverAssetId ? api.removeCover : undefined} /></div>
    {text("coverAlt", "Photo description", NEWS_LIMITS.coverAlt, "Describe the photo for people using screen readers.")}
  </div>;

  const paragraphs = draftParagraphs(draft).length;
  const over = overlongParagraph(draft);
  const limit = over ? `Paragraph ${over.index + 1} is ${over.length.toLocaleString("en-US")} characters. Each paragraph can be ${NEWS_LIMITS.paragraph.toLocaleString("en-US")} at most.` : null;
  return <div className={styles.fields}>
    <div className={styles.field}>
      <Field label="Article text" multiline rows={12} value={draft.body} target={at("body")} disabled={locked} error={problems.body}
        hint={`Put each paragraph on its own line. Up to ${NEWS_LIMITS.paragraphs} paragraphs of ${NEWS_LIMITS.paragraph.toLocaleString("en-US")} characters.`}
        extra={`${draft.body.length.toLocaleString("en-US")} characters · ${paragraphs} of ${NEWS_LIMITS.paragraphs} paragraphs`} onChange={value => update({ body: value })} />
      {limit && <ValidationMessage live="polite">{limit}</ValidationMessage>}
    </div>
    <div className={styles.row}>
      {text("actionLabel", "Button label (optional)", NEWS_LIMITS.actionLabel, "Shown under the article, like “Partner with us”.")}
      {text("actionHref", "Button link", NEWS_LIMITS.actionHref, LINK_DESTINATION_HINT)}
    </div>
  </div>;
}
