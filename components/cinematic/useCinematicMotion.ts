"use client";

import { useEffect, useState } from "react";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";

export function useCinematicMotion() {
  const preview = useHomepagePreview();
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    query.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => { query.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return { reduced, playing: !reduced && visible && (!preview || !!preview.playback) };
}
