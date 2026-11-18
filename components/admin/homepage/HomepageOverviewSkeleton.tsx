"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import frame from "@/components/admin/ui/editor-kit/PageFrame.module.css";
import kitSkeleton from "@/components/admin/ui/editor-kit/skeletons.module.css";
import { OVERVIEW_DESIGN_WIDTH, OVERVIEW_TWO_COLUMN_MIN, overviewReservedHeight } from "./HomepageOverviewPreview";
import styles from "./HomepageOverview.module.css";

/** Shaped like the loaded editor: the same header, toolbar and column boxes (same aspect ratios), so nothing moves when the page arrives. */
export default function HomepageOverviewSkeleton() {
  const root = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<1 | 2>(2);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setColumns(element.clientWidth >= OVERVIEW_TWO_COLUMN_MIN ? 2 : 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const ratio = `${OVERVIEW_DESIGN_WIDTH} / ${overviewReservedHeight(columns)}`;
  return <div className={frame.frame} aria-busy="true" aria-label="Homepage editor" role="group" data-homepage-overview-skeleton="">
    <span className="sr-only" role="status">Loading your homepage…</span>
    <div className={frame.header} aria-hidden="true">
      <div className={frame.heading}><Shimmer className={kitSkeleton.crumb} /><Shimmer className={kitSkeleton.title} /></div>
      <Shimmer className={kitSkeleton.open} />
      <div className={frame.saveGroup}><Shimmer className={kitSkeleton.save} /></div>
    </div>
    <div className={frame.content} aria-hidden="true">
      <div className={styles.root}>
        <div className={styles.toolbar}><Shimmer style={{ inlineSize: 200, blockSize: 44, borderRadius: 10 }} /></div>
        <Shimmer style={{ blockSize: 44, borderRadius: 12 }} />
        <div ref={root} className={styles.columns} style={{ "--columns": columns } as CSSProperties}>
          {Array.from({ length: columns }, (_, index) => <div key={index} className={styles.box} style={{ aspectRatio: ratio }}><Shimmer className={styles.cover} /></div>)}
        </div>
      </div>
    </div>
  </div>;
}
