"use client";

import { Menu } from "@base-ui/react/menu";
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { IconEdit, IconMore } from "@/components/admin/icons";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { KIT_EDIT_PROPS } from "@/components/admin/ui/editor-kit/kitEdit";
import { SCOPED_PREVIEW_ATTRIBUTES, scopePreviewIds } from "@/components/admin/ui/editor-kit/scopePreviewIds";
import { watchEditTargetStamps, type EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { fieldUnder, hideFieldHover, showFieldHover } from "@/components/admin/list-cards/ItemPreviewCards";
import type { EditTargetId, ResolvedEditTarget } from "@/lib/admin-edit-targets";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import { CinematicNewsList } from "@/components/cinematic/CinematicNews";
import CinematicShell from "@/components/cinematic/CinematicShell";
import type { CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { newsCategory } from "@/lib/cinematic-news";
import type { NewsPublicArticle } from "@/lib/cinematic-news-query";
import { draftFingerprint, previewArticle, type NewsCardItem } from "./news-page";
import styles from "./NewsCards.module.css";
import { useFitPreviewScale } from "@/components/admin/ui/editor-kit/fitPreviewScale";

const PREVIEW_WIDTH = 860;
const PREVIEW_SCALE = 0.4;

export const newsShortDate = (publishedAt: string, timeZone: string) =>
  new Date(publishedAt).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });

/** Mounts children once the box has been near the viewport; always, where IntersectionObserver is missing. */
function useNearViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (near || !enabled) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, near]);
  return { ref, near };
}

type ThumbProps = { card: NewsCardItem; shared: CinematicHomepageContent | null; lazy: boolean; stamps?: readonly EditTargetStamp[] };

/** The real public News card (CinematicNewsList with one article), fed the draft. Re-renders only when its own draft changes. */
const Thumb = memo(function Thumb({ card, shared, lazy, stamps }: ThumbProps) {
  const { ref, near } = useNearViewport(lazy);
  const scale = useFitPreviewScale(ref, PREVIEW_WIDTH, PREVIEW_SCALE);
  const scope = `nv${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  useEffect(() => {
    const node = ref.current;
    if (!node || !near) return;
    scopePreviewIds(node, scope);
    const observer = new MutationObserver(() => scopePreviewIds(node, scope));
    observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: SCOPED_PREVIEW_ATTRIBUTES });
    return () => observer.disconnect();
  }, [ref, near, scope]);
  const scaledRef = useRef<HTMLDivElement>(null);
  // Click-to-field: the thumbnail is an inert, non-iframe div, so the stamps go straight onto its nodes.
  useEffect(() => {
    const node = scaledRef.current;
    return node && near && stamps ? watchEditTargetStamps(node, stamps) : undefined;
  }, [near, stamps]);
  const article = useMemo(() => previewArticle(card, card.slug ?? "preview") as NewsPublicArticle,
    // The draft's fingerprint stands for the draft: saved articles rebuild theirs on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.key, draftFingerprint(card.draft), card.publishedAt, card.slug]);
  return <div ref={ref} className={styles.box} aria-hidden="true" inert data-news-thumb="" data-preview-mounted={near}>
    <Shimmer className={styles.placeholder} data-preview-placeholder="" />
    {near && <div ref={scaledRef} className={styles.scaled} style={{ "--preview-width": `${PREVIEW_WIDTH}px`, "--preview-scale": scale } as CSSProperties}>
      <SettledPreview urls={article.cover ? [article.cover.url] : []}>
        <CinematicShell contentOnly initialContent={shared}><CinematicNewsList articles={[article]} /></CinematicShell>
      </SettledPreview>
    </div>}
  </div>;
}, (a, b) => a.shared === b.shared && a.lazy === b.lazy && a.stamps === b.stamps && a.card.key === b.card.key && a.card.publishedAt === b.card.publishedAt && a.card.slug === b.card.slug && draftFingerprint(a.card.draft) === draftFingerprint(b.card.draft));

export type NewsCardsProps = {
  cards: readonly NewsCardItem[];
  shared: CinematicHomepageContent | null;
  timeZone: string;
  /** Holds every control while a save or an upload runs. */
  locked: boolean;
  /**
   * The event's currentTarget is the pressed button. `target` is the field under the pointer when the preview itself was
   * clicked with a mouse or touch (only with `stamps`); the footer Edit button, the menu and the keyboard pass none.
   */
  onEdit: (card: NewsCardItem, event: MouseEvent<HTMLButtonElement>, target?: EditTargetId) => void;
  /**
   * Opt in to click-to-field: the edit targets to stamp on the public nodes inside one article's card (this admin preview
   * only). Return the same array for an article until its id changes: a new array restarts that card's stamp watcher.
   * Without it the cards render and behave exactly as before.
   */
  stamps?: (cardKey: string) => readonly EditTargetStamp[];
  /** Whether a declared field belongs to the card for `cardKey` (only with `stamps`); another article's field is ignored. Default: every declared field in the card's own preview. */
  ownsTarget?: (cardKey: string, target: ResolvedEditTarget) => boolean;
  onRemove: (card: NewsCardItem) => void;
  onRestore: (card: NewsCardItem) => void;
  onDiscard: (card: NewsCardItem) => void;
  lazy?: boolean;
};

function CardMenu({ card, locked, onRemove, onDiscard }: { card: NewsCardItem; locked: boolean; onRemove: () => void; onDiscard: () => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".admin-theme") ?? document.body), []);
  const live = !!card.article && !card.removed;
  return <Menu.Root>
    <Menu.Trigger className={`admin-press ${styles.iconButton}`} disabled={locked} aria-label={`More actions for ${card.title}`}>
      <IconMore size={18} aria-hidden="true" />
    </Menu.Trigger>
    <Menu.Portal container={container}>
      <Menu.Positioner className={styles.positioner} side="bottom" align="end" sideOffset={6}>
        <Menu.Popup className={styles.menu}>
          {live && <Menu.LinkItem className={styles.menuItem} href={`/news/${card.slug}`} target="_blank" rel="noopener">Open on the site</Menu.LinkItem>}
          {(card.isNew || card.changed) && <Menu.Item className={styles.menuItem} onClick={onDiscard}>{card.isNew ? "Discard this new article" : "Discard my edits"}</Menu.Item>}
          {live && <Menu.Item className={`${styles.menuItem} ${styles.danger}`} onClick={onRemove}>Remove from the site</Menu.Item>}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>;
}

/** One card per article: the real News card as a mini preview, a Live / Removed marker, Edit and a more menu. */
export function NewsCards({ cards, shared, timeZone, locked, onEdit, onRemove, onRestore, onDiscard, lazy = true, stamps, ownsTarget }: NewsCardsProps) {
  return <ul className={styles.grid} aria-label="Articles" data-news-cards="">
    {cards.map(card => {
      const kind = newsCategory(card.draft.category);
      const status = card.removed ? "Removed" : card.isNew ? "Not saved yet" : "Live";
      return <li key={card.key} className={styles.card} data-removed={card.removed || undefined} data-news-card={card.key}>
        <div className={styles.previewWrap}>
          <Thumb card={card} shared={shared} lazy={lazy} stamps={stamps?.(card.key)} />
          {!card.removed && <button type="button" className={`admin-press ${styles.previewButton}`} tabIndex={-1} aria-label={`Edit ${card.title}`} disabled={locked}
            // A pointer click opens the field under the pointer; Enter or Space (detail 0) opens the article, as before.
            onClick={event => stamps
              ? onEdit(card, event, event.detail > 0 ? fieldUnder(event.currentTarget, card.key, event.clientX, event.clientY, ownsTarget)?.id : undefined)
              : onEdit(card, event)}
            onPointerMove={stamps ? event => { if (event.pointerType === "mouse") showFieldHover(event.currentTarget, card.key, event.clientX, event.clientY, ownsTarget); } : undefined}
            onPointerLeave={stamps ? event => hideFieldHover(event.currentTarget) : undefined}
            data-preview-button="" {...KIT_EDIT_PROPS} />}
          {stamps && !card.removed && <span className={styles.fieldHoverClip} data-field-hover-clip="" aria-hidden="true"><span className={styles.fieldHover} data-field-hover="" hidden /></span>}
        </div>
        <div className={styles.foot}>
          <div className={styles.text}>
            <h2 className={styles.title}>
              <span className={styles.titleText} title={card.title}>{card.title}</span>
              {card.changed && !card.isNew && <span className={styles.dot} data-unsaved-dot=""><span className="sr-only"> (unsaved edits)</span></span>}
            </h2>
            <p className={styles.meta}>
              <span className={styles.status} data-status={card.removed ? "removed" : card.isNew ? "new" : "live"}>{status}</span>
              <span className={styles.category}><i style={{ background: kind.color }} aria-hidden="true" />{kind.label}</span>
              <span>{newsShortDate(card.publishedAt, timeZone)}</span>
            </p>
          </div>
          <div className={styles.controls}>
            {card.removed
              ? <button type="button" className={`admin-press ${styles.action}`} disabled={locked} aria-label={`Restore ${card.title}`} onClick={() => onRestore(card)}>Restore</button>
              : <>
                <button type="button" className={`admin-press ${styles.action}`} disabled={locked} aria-label={`Edit ${card.title} article`} onClick={event => onEdit(card, event)} data-preview-edit="" {...KIT_EDIT_PROPS}>
                  <IconEdit size={16} aria-hidden="true" />Edit
                </button>
                <CardMenu card={card} locked={locked} onRemove={() => onRemove(card)} onDiscard={() => onDiscard(card)} />
              </>}
          </div>
        </div>
      </li>;
    })}
  </ul>;
}

export function NewsEmpty({ hasArticles }: { hasArticles: boolean }) {
  return <div className={styles.empty} data-news-empty="">{hasArticles ? <p>No articles match.</p> : <p>No articles yet. The News page shows “News is coming soon.” until you add one.</p>}</div>;
}
