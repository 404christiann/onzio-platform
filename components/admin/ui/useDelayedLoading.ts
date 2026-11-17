"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";

export type DelayedLoadingPhase =
  | "waiting"
  | "skeleton"
  | "crossfade"
  | "content"
  | "refreshing"
  | "refresh-reveal";

type DelayedLoadingOptions = {
  quietRefresh?: boolean;
};

function fadeDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? ADMIN_MOTION_DURATIONS.reducedMotionFade
    : ADMIN_MOTION_DURATIONS.skeletonCrossfade;
}

export function useDelayedLoading(
  loading: boolean,
  { quietRefresh = false }: DelayedLoadingOptions = {},
) {
  const [phase, setPhase] = useState<DelayedLoadingPhase>(() =>
    loading ? (quietRefresh ? "refreshing" : "waiting") : "content",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonShownAt = useRef<number | null>(null);
  const cycleKind = useRef<"initial" | "refresh" | null>(
    loading ? (quietRefresh ? "refresh" : "initial") : null,
  );

  useLayoutEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;

    if (loading) {
      if (skeletonShownAt.current !== null) {
        cycleKind.current = "initial";
        setPhase("skeleton");
      } else {
        cycleKind.current = quietRefresh ? "refresh" : "initial";
        if (quietRefresh) {
          setPhase("refreshing");
        } else {
          setPhase("waiting");
          timer.current = setTimeout(() => {
            skeletonShownAt.current = performance.now();
            setPhase("skeleton");
          }, ADMIN_MOTION_DURATIONS.skeletonDelay);
        }
      }
    } else if (cycleKind.current === "refresh") {
      cycleKind.current = null;
      setPhase("refresh-reveal");
      timer.current = setTimeout(
        () => setPhase("content"),
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? ADMIN_MOTION_DURATIONS.reducedMotionFade
          : 200,
      );
    } else if (skeletonShownAt.current !== null) {
      cycleKind.current = null;
      const elapsed = performance.now() - skeletonShownAt.current;
      const remaining = Math.max(0, ADMIN_MOTION_DURATIONS.skeletonMinimum - elapsed);
      timer.current = setTimeout(() => {
        setPhase("crossfade");
        timer.current = setTimeout(() => {
          skeletonShownAt.current = null;
          setPhase("content");
        }, fadeDuration());
      }, remaining);
    } else {
      cycleKind.current = null;
      setPhase("content");
    }
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [loading, quietRefresh]);

  return {
    phase,
    showSkeleton: phase === "skeleton" || phase === "crossfade",
    showContent: phase === "content" || phase === "crossfade" ||
      phase === "refreshing" || phase === "refresh-reveal",
  };
}

