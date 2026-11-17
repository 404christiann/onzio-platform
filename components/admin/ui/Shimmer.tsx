"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { useDelayedLoading } from "./useDelayedLoading";
import styles from "./Shimmer.module.css";

type ShimmerProps = HTMLAttributes<HTMLSpanElement>;

export function Shimmer({ children, className, ...props }: ShimmerProps) {
  return (
    <span
      {...props}
      className={className ? `${styles.shimmer} ${className}` : styles.shimmer}
      data-admin-shimmer=""
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

type ShimmerRegionProps = {
  loading: boolean;
  quietRefresh?: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  minHeight: CSSProperties["minHeight"];
  className?: string;
  loadingLabel?: string;
};

export function ShimmerRegion({
  loading,
  quietRefresh,
  skeleton,
  children,
  minHeight,
  className,
  loadingLabel = "Loading content",
}: ShimmerRegionProps) {
  const { phase, showSkeleton, showContent } = useDelayedLoading(loading, { quietRefresh });

  return (
    <div
      className={className ? `${styles.region} ${className}` : styles.region}
      style={{ minHeight }}
      data-admin-loading-region=""
      data-phase={phase}
      aria-busy={phase !== "content"}
    >
      {showSkeleton && (
        <div
          className={styles.skeletonLayer}
          data-admin-skeleton-layer=""
          role="status"
          aria-label={loadingLabel}
          aria-hidden={phase === "crossfade" || undefined}
        >
          {skeleton}
        </div>
      )}
      {showContent && (
        <div className={styles.contentLayer} data-admin-content-layer="">
          {children}
        </div>
      )}
    </div>
  );
}

export function ShimmerRefreshText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className ? `${styles.refreshText} ${className}` : styles.refreshText}
      data-admin-refresh-text=""
    >
      {children}
    </span>
  );
}

