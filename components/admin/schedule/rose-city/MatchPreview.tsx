"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import previewCards from "@/components/admin/ui/editor-kit/PreviewCards.module.css";
import { SCOPED_PREVIEW_ATTRIBUTES, scopePreviewIds } from "@/components/admin/ui/editor-kit/scopePreviewIds";
import { SettledPreview } from "@/components/admin/stadium/SettledPreview";
import HomepagePreviewFrame from "@/components/admin/homepage/HomepagePreviewFrame";
import CinematicShell from "@/components/cinematic/CinematicShell";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import type { CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { Fixture } from "@/lib/data";
import styles from "./RoseCityScheduleEditor.module.css";

const CSS_ESCAPE = (value: string) => value.replace(/["\\]/g, "");

/** The public Schedule is a list. One preview is one of its rows: the page heading, column titles, note and every other row are hidden. */
export const hidePublicChrome = (ownId: string) => `
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule::before,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .schedule-heading,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .schedule-columns,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .schedule-disclaimer,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .schedule-pagination,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .fixture-number,
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-schedule .fixture-item:not([data-fixture-id="${CSS_ESCAPE(ownId)}"]) { display: none !important; }
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-site .cinematic-schedule .schedule-page { padding: 0 !important; }
[data-own-row="${CSS_ESCAPE(ownId)}"] .cinematic-site .cinematic-schedule .fixture-item { margin-bottom: 0 !important; }
`;

const PHONE_QUERY = "(max-width: 900px)";
const subscribe = (listener: () => void) => { const query = window.matchMedia(PHONE_QUERY); query.addEventListener("change", listener); return () => query.removeEventListener("change", listener); };
const usePhoneLayout = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);

/** Natural size of one public row: the desktop row, or the stacked card the public page switches to under 900px. */
export const THUMB_SIZE = { desktop: { width: 1100, height: 215 }, phone: { width: 420, height: 270 } } as const;

function useNearViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return { ref, near };
}

type LiveProps = { fixtures: readonly Fixture[]; timeZone: string; shared: CinematicHomepageContent | null };
const PublicRow = ({ fixtures, timeZone, shared }: LiveProps) => (
  <CinematicShell contentOnly initialContent={shared}>
    <CinematicSchedule schedule={{ fixtures: [...fixtures], seasonLabel: "", timeZone }} />
  </CinematicShell>
);

type ThumbProps = LiveProps & { urls: readonly string[]; signature: string; ownId: string };

/**
 * The real public Schedule row, fed the draft, at a fixed box that never moves the page. Mounts when near the viewport
 * and stays hidden (shimmer under it) until its images and fonts settle. Re-renders only when its own fixture changes.
 */
export const MatchThumb = memo(function MatchThumb({ fixtures, timeZone, shared, urls, ownId }: ThumbProps) {
  const phone = usePhoneLayout();
  const size = phone ? THUMB_SIZE.phone : THUMB_SIZE.desktop;
  const { ref, near } = useNearViewport();
  const scope = `pv${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => { if (node.clientWidth) setScale(node.clientWidth / size.width); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, size.width]);
  useEffect(() => {
    const node = ref.current;
    if (!node || !near) return;
    scopePreviewIds(node, scope);
    const observer = new MutationObserver(() => scopePreviewIds(node, scope));
    observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: SCOPED_PREVIEW_ATTRIBUTES });
    return () => observer.disconnect();
  }, [ref, near, scope]);
  return (
    <div ref={ref} className={`${previewCards.box} ${styles.thumb}`} aria-hidden="true" inert data-preview-box="" data-preview-mounted={near}
      style={{ "--thumb-ratio": `${size.width} / ${size.height}` } as CSSProperties}>
      <Shimmer className={previewCards.placeholder} data-preview-placeholder="" />
      {near && (
        <div className={previewCards.scaled} style={{ "--preview-width": `${size.width}px`, "--preview-scale": scale } as CSSProperties}>
          <SettledPreview urls={urls}><div data-own-row={ownId}><style>{hidePublicChrome(ownId)}</style><PublicRow fixtures={fixtures} timeZone={timeZone} shared={shared} /></div></SettledPreview>
        </div>
      )}
    </div>
  );
}, (a, b) => a.signature === b.signature && a.timeZone === b.timeZone && a.shared === b.shared);

/** The live card in the dialog: one real, narrow viewport (an iframe), so the public page's own phone layout applies. */
export function MatchLive({ fixtures, timeZone, shared, host, ownId }: LiveProps & { host: string; ownId: string }) {
  return (
    <div className={styles.live}>
      <HomepagePreviewFrame host={host} label="Schedule match card">
        <div data-own-row={ownId}>
          <style>{hidePublicChrome(ownId)}</style>
          <PublicRow fixtures={fixtures} timeZone={timeZone} shared={shared} />
        </div>
      </HomepagePreviewFrame>
    </div>
  );
}

export function fixturesSignature(fixtures: readonly Fixture[]) {
  return JSON.stringify(fixtures);
}

export function useFixtures(own: Fixture, next: Fixture | null) {
  return useMemo(() => (next && next.id !== own.id ? [next, own] : [own]), [own, next]);
}
