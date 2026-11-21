"use client";

import { useEffect, useRef, useState } from "react";
import { createHeroVideoController, defaultHeroVideoDeps, type HeroVideoController, type HeroVideoDeps } from "@/lib/homepage-editor/hero-video-upload";

/**
 * Owns the hero video controller for the whole Overview editor, so an upload or processing poll keeps going while the
 * edit dialog is closed or the editor reloads. `enabled` latches on: a reload briefly clears the snapshot and must not
 * cancel a running upload.
 */
export function useHeroVideoController(enabled: boolean, refreshRevision: HeroVideoDeps["refreshRevision"]): HeroVideoController | null {
  const refresh = useRef(refreshRevision);
  refresh.current = refreshRevision;
  const [latched, setLatched] = useState(false);
  const [controller, setController] = useState<HeroVideoController | null>(null);
  if (enabled && !latched) setLatched(true);
  useEffect(() => {
    if (!latched) return;
    const next = createHeroVideoController(defaultHeroVideoDeps(range => refresh.current(range)));
    setController(next);
    void next.load();
    return () => { next.dispose(); setController(null); };
  }, [latched]);
  return controller;
}
