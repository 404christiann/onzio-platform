"use client";

import { useEffect, useRef, useState } from "react";
import { createHeroVideoController, defaultHeroVideoDeps, type HeroVideoController, type HeroVideoDeps } from "@/lib/homepage-editor/hero-video-upload";

/** While bytes are still moving, in-app admin links do not navigate and closing the tab warns. */
export function useHeroUploadNavigationGuard(uploading: boolean) {
  useEffect(() => {
    if (!uploading) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash === window.location.hash) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [uploading]);
}

/**
 * Owns the hero video controller for the whole Overview editor, so an upload or processing poll keeps going while the
 * edit dialog is closed or the editor reloads. `enabled` latches on: a reload briefly clears the snapshot and must not
 * cancel a running upload.
 */
export function useHeroVideoController(enabled: boolean, refreshRevision: HeroVideoDeps["refreshRevision"], refreshPresentation: HeroVideoDeps["refreshPresentation"]): HeroVideoController | null {
  const refresh = useRef(refreshRevision);
  refresh.current = refreshRevision;
  const refreshArt = useRef(refreshPresentation);
  refreshArt.current = refreshPresentation;
  const [latched, setLatched] = useState(false);
  const [controller, setController] = useState<HeroVideoController | null>(null);
  if (enabled && !latched) setLatched(true);
  useEffect(() => {
    if (!latched) return;
    const next = createHeroVideoController(defaultHeroVideoDeps(range => refresh.current(range), () => refreshArt.current()));
    setController(next);
    void next.load();
    return () => { next.dispose(); setController(null); };
  }, [latched]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!controller) return;
    const sync = () => setUploading(controller.getState().phase === "uploading");
    sync();
    return controller.subscribe(sync);
  }, [controller]);
  useHeroUploadNavigationGuard(uploading);
  return controller;
}
