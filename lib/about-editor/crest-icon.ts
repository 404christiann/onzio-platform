/**
 * The saved range of a crest feature's icon size (px) and scale (×). The save contract (contract.ts) and the database
 * policy (about_content_policy: 24-140 and 0.5-4) refuse anything outside them; the editor's sliders read them from here.
 */
export const CREST_ICON_SIZE = { min: 24, max: 140, default: 70 } as const;
export const CREST_ICON_SCALE = { min: 0.5, max: 4, default: 1 } as const;
