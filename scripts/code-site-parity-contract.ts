import assert from "node:assert/strict";
import { z } from "zod";
import type { AcademyProofDocumentCase } from "./pilot-academy-documents";

export const accepted53Commit = "fee1c5ba10b2935e3a9c7cefb0ede2bb01c77f49";
export const codeSiteParityInputSchema = z.object({
  roots: z.object({ before: z.string().min(1), after: z.string().min(1) }).strict(),
  beforeCommit: z.literal(accepted53Commit),
  afterCommit: z.string().regex(/^[a-f0-9]{40}$/).refine(value => value !== accepted53Commit),
}).strict();

export const focusedCodeSiteDocuments = [
  "public.home", "public.programDetail", "public.roster", "public.schedule", "public.shop",
  "preview.about", "preview.programs", "preview.shop",
] as const;

export function selectFocusedCodeSiteDocuments(documents: readonly AcademyProofDocumentCase[]) {
  const selected = focusedCodeSiteDocuments.map(id => {
    const matching = documents.filter(item => item.id === id);
    assert.equal(matching.length, 1, `Focused proof requires exactly one ${id} document`);
    return matching[0];
  });
  assert.equal(new Set(selected.map(item => item.path)).size, selected.length, "Focused proof document paths must be distinct");
  return selected;
}

export type FocusedCodeSiteSnapshot = {
  id: string;
  width: number;
  screenshotSha256: string;
  text: string;
  links: [string | null, string | null][];
  headings: { text: string | null; font: string; color: string; size: string }[];
  controls: { text: string; role: string | null; current: string | null; pressed: string | null; disabled: boolean }[];
  browserReads: Record<string, number>;
  redirects: { from: string; to: string; status: number }[];
  fonts: string[];
  css: string[];
  images: Record<string, string>;
};

export function compareFocusedCodeSiteSnapshots(before: FocusedCodeSiteSnapshot, after: FocusedCodeSiteSnapshot) {
  assert.equal(before.id, after.id);
  assert.equal(before.width, after.width);
  const differences: string[] = [];
  for (const field of ["screenshotSha256", "text", "links", "headings", "controls", "browserReads", "redirects", "images"] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) differences.push(field);
  }
  assert(before.fonts.length > 0 && after.fonts.length > 0, "Both builds must load fonts");
  assert(before.css.length > 0 && after.css.length > 0, "Both builds must load CSS");
  return differences;
}
