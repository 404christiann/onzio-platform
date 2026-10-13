"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import { fetchCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const Context = createContext<{ content: CinematicHomepageContent | null; loading: boolean } | null>(null);

function useLoadedContent(enabled: boolean, initialContent: CinematicHomepageContent | null = null) {
  const club = useClubContext();
  const preview = useHomepagePreview();
  const initial = useRef({ clubId: club.id, content: initialContent });
  if (initial.current.content !== initialContent) initial.current = { clubId: club.id, content: initialContent };
  const trustedInitial = initial.current.clubId === club.id ? initial.current.content : null;
  const [state, setState] = useState<{ clubId: string; content: CinematicHomepageContent | null; loading: boolean }>({ clubId: club.id, content: trustedInitial, loading: !trustedInitial });
  useEffect(() => {
    if (!enabled || preview?.draft.revamp) return;
    if (trustedInitial) {
      setState({ clubId: club.id, content: trustedInitial, loading: false });
      return;
    }
    let active = true;
    setState({ clubId: club.id, content: null, loading: true });
    fetchCinematicHomepageContent(club.id)
      .then(content => { if (active) setState({ clubId: club.id, content, loading: false }); })
      .catch(error => { console.error("Cinematic homepage content:", error); if (active) setState({ clubId: club.id, content: null, loading: false }); });
    return () => { active = false; };
  }, [club.id, enabled, preview?.draft.revamp, trustedInitial]);
  return preview?.draft.revamp ? { content: preview.draft.revamp, loading: false } : trustedInitial ? { content: trustedInitial, loading: false } : state.clubId === club.id ? state : { content: null, loading: true };
}

export function CinematicContentProvider({ children, initialContent = null }: { children: ReactNode; initialContent?: CinematicHomepageContent | null }) {
  const state = useLoadedContent(true, initialContent);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** Shared shell loads once; standalone branding previews can load their tenant directly. */
export function useCinematicContent() {
  const inherited = useContext(Context);
  const local = useLoadedContent(inherited === null);
  return inherited ?? local;
}
