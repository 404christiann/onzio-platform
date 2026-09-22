"use client";

import { createContext, useContext, type HTMLAttributes } from "react";
import type { HomepageDraft, PieceId } from "./model";

export const HOMEPAGE_PIECE_LABELS: Record<PieceId, string> = {
  "hero.eyebrow": "Small heading", "hero.heading": "Main heading", "hero.intro": "Short paragraph", "hero.cta": "Top buttons",
  photos: "Photos", "story.text": "Your club's story", "story.cta": "Story button", story: "Your club's story", video: "Video feature",
  "shared.story": "Your club's story", "shared.shop": "Shop", "shared.programs": "Programs",
};
export type HomepagePreviewValue = {
  playback?: boolean;
  draft: HomepageDraft;
  videoSource: string;
  selection: PieceId | null;
  allowedPieces: readonly PieceId[];
  select: (piece: PieceId) => void;
};
export const HomepagePreviewContext = createContext<HomepagePreviewValue | null>(null);
export function useHomepagePreview() { return useContext(HomepagePreviewContext); }

/** Empty on public pages: existing semantics and behavior stay unchanged. */
export function useHomepagePiece(piece: PieceId): HTMLAttributes<HTMLElement> & { "data-homepage-piece"?: string; "data-homepage-shared"?: string } {
  const preview = useHomepagePreview();
  if (preview?.playback || !preview?.allowedPieces.includes(piece)) return {};
  // Content owned by another admin page cannot be typed into here, so the
  // editing canvas omits it rather than dressing it up as editable. The editor
  // offers it as an explicit shortcut instead. Playback and the public site are
  // untouched: neither receives this attribute.
  if (piece.startsWith("shared.")) return { "data-homepage-shared": "true" };
  return {
    "data-homepage-piece": piece, tabIndex: 0, role: "button",
    "aria-label": HOMEPAGE_PIECE_LABELS[piece], "aria-pressed": preview.selection === piece,
    onClick: event => { event.preventDefault(); event.stopPropagation(); preview.select(piece); },
    onKeyDown: event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); preview.select(piece); }
    },
  };
}

export function HomepageMissingPiece({ piece, children }: { piece: PieceId; children: React.ReactNode }) {
  const attributes = useHomepagePiece(piece);
  if (!attributes["data-homepage-piece"]) return null;
  return <button {...attributes} type="button" style={{ display: "block", width: "calc(100% - 32px)", minHeight: 64, margin: 16, padding: 16, border: "1px dashed #8a83d9", borderRadius: 8, background: "#f5f4ff", color: "#4c458c", font: "500 14px system-ui", textAlign: "left" }}>{children}</button>;
}

/** Keep the public DOM unchanged when grouping words only for editor selection. */
export function HomepagePieceGroup({ piece, children }: { piece: PieceId; children: React.ReactNode }) {
  const attributes = useHomepagePiece(piece);
  return attributes["data-homepage-piece"] ? <div {...attributes}>{children}</div> : <>{children}</>;
}
